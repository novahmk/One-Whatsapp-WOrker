import { Config } from '../config';
import {
  Colaborador,
  ContextoPendente,
  Deps,
  Interpretacao,
  LogEntrada,
  MensagemRecebida,
  Perfil,
} from '../types';
import { dataLocalISO } from '../util/tempo';
import { formatarAgenda } from '../services/formatarAgenda';
import { resolverResponsavel } from './resolverResponsavel';
import { resolverTarefa } from './resolverTarefa';

type BaseLog = Omit<LogEntrada, 'resultado' | 'tarefa_id' | 'interpretacao'>;

export async function processarMensagem(
  msg: MensagemRecebida,
  deps: Deps,
  cfg: Config,
): Promise<void> {
  // Dedupe persistido: sobrevive a reinícios do processo.
  if (msg.messageId && (await deps.db.mensagemJaProcessada(msg.messageId))) return;

  const tipo = msg.audioUrl ? 'audio' : 'texto';

  const { perfil, colaboradores, erro } = await deps.one.buscarPerfil(msg.telefone);
  if (erro) {
    await deps.whats.enviarMensagem(
      msg.telefone,
      'Tive um problema pra te identificar no ONE agora. Tenta de novo daqui a pouco.',
    );
    await deps.db.registrarLog({
      message_id: msg.messageId,
      telefone: msg.telefone,
      tipo,
      texto_original: msg.texto,
      resultado: 'erro_perfil',
    });
    return;
  }
  if (!perfil) {
    await deps.whats.enviarMensagem(
      msg.telefone,
      'Esse número ainda não está configurado no ONE. Peça pro seu gestor liberar seu acesso pelo painel.',
    );
    await deps.db.registrarLog({
      message_id: msg.messageId,
      telefone: msg.telefone,
      tipo,
      texto_original: msg.texto,
      resultado: 'nao_reconhecido',
    });
    return;
  }

  let texto = msg.texto ?? '';
  let transcricao: string | undefined;
  if (msg.audioUrl) {
    try {
      const audio = await deps.whats.baixarAudio(msg.bruta);
      transcricao = (await deps.transcrever(audio, msg.audioMimetype)).trim();
    } catch (e) {
      console.error('Falha ao baixar/transcrever áudio:', e);
    }
    if (!transcricao) {
      await deps.whats.enviarMensagem(
        msg.telefone,
        'Não consegui processar seu áudio. Pode tentar de novo ou mandar por texto?',
      );
      await deps.db.registrarLog({
        message_id: msg.messageId,
        telefone: msg.telefone,
        profile_id: perfil.id,
        clinica_id: perfil.clinica_id,
        tipo: 'audio',
        resultado: 'erro',
      });
      return;
    }
    texto = transcricao;
    // Eco da transcrição: se o Whisper errar um nome, o usuário percebe na hora.
    await deps.whats.enviarMensagem(msg.telefone, `🎙️ Entendi: _"${texto}"_`);
  }

  const base: BaseLog = {
    message_id: msg.messageId,
    telefone: msg.telefone,
    profile_id: perfil.id,
    clinica_id: perfil.clinica_id,
    tipo,
    texto_original: msg.texto,
    transcricao,
  };

  const pendente = await deps.db.buscarConversaPendente(msg.telefone);
  if (pendente) {
    await tratarRespostaPendente(texto, pendente.id, pendente.contexto, perfil, base, deps);
    return;
  }

  const interpretacao = await deps.interpretar(
    texto,
    colaboradores.map((c) => c.nome_completo),
    dataLocalISO(cfg.TZ_AVISOS),
  );

  if (interpretacao.tipo === 'pedir_esclarecimento') {
    await deps.whats.enviarMensagem(msg.telefone, interpretacao.pergunta);
    await deps.db.registrarLog({ ...base, interpretacao, resultado: 'esclarecimento_solicitado' });
    return;
  }

  if (interpretacao.tipo === 'sem_acao') {
    await deps.whats.enviarMensagem(msg.telefone, interpretacao.resposta);
    await deps.db.registrarLog({ ...base, interpretacao, resultado: 'sem_acao' });
    return;
  }

  if (interpretacao.tipo === 'consultar_agenda') {
    await fluxoConsultarAgenda(interpretacao, perfil, base, deps, cfg);
    return;
  }

  if (interpretacao.tipo === 'concluir_tarefa') {
    await fluxoConcluirTarefa(interpretacao.titulo, perfil, base, deps);
    return;
  }

  await fluxoCriarTarefa(interpretacao, perfil, colaboradores, base, deps);
}

async function fluxoConsultarAgenda(
  interpretacao: Extract<Interpretacao, { tipo: 'consultar_agenda' }>,
  perfil: Perfil,
  base: BaseLog,
  deps: Deps,
  cfg: Config,
): Promise<void> {
  const dataRef = interpretacao.data ?? dataLocalISO(cfg.TZ_AVISOS);
  const agenda = await deps.one.buscarAgenda(perfil.id, dataRef);
  const itens = agenda.itens.map((i) => ({
    titulo: i.titulo,
    horario_sugerido: i.horario,
    concluida: i.concluida,
  }));
  const dia = new Date(`${agenda.data || dataRef}T12:00:00-03:00`);
  await deps.whats.enviarMensagem(base.telefone, formatarAgenda(itens, dia));
  await deps.db.registrarLog({ ...base, interpretacao, resultado: 'agenda_consultada' });
}

async function fluxoConcluirTarefa(
  titulo: string,
  perfil: Perfil,
  base: BaseLog,
  deps: Deps,
): Promise<void> {
  const resultado = await deps.one.concluirTarefa({
    profile_id: perfil.id,
    titulo_aproximado: titulo,
  });

  if (resultado.ambiguo && resultado.candidatos && resultado.candidatos.length > 0) {
    const titulos = resultado.candidatos.map((c) => `'${c.titulo}'`);
    const pergunta = `Encontrei mais de uma tarefa parecida: ${titulos.join(', ')}. Qual delas?`;
    await deps.db.criarConversaPendente({
      telefone: base.telefone,
      clinica_id: perfil.clinica_id,
      profile_id: perfil.id,
      pergunta,
      contexto: { tipo: 'concluir', profile_id: perfil.id, candidatos: resultado.candidatos },
    });
    await deps.whats.enviarMensagem(base.telefone, pergunta);
    await deps.db.registrarLog({ ...base, resultado: 'esclarecimento_solicitado' });
    return;
  }

  if (resultado.sucesso) {
    await deps.whats.enviarMensagem(
      base.telefone,
      `Marquei '${resultado.titulo ?? titulo}' como concluída.`,
    );
    await deps.db.registrarLog({ ...base, resultado: 'tarefa_concluida', tarefa_id: resultado.titulo });
    return;
  }

  await deps.whats.enviarMensagem(
    base.telefone,
    `Não encontrei uma tarefa parecida com "${titulo}". Pode conferir o nome?`,
  );
  await deps.db.registrarLog({ ...base, resultado: 'tarefa_nao_encontrada' });
}

async function fluxoCriarTarefa(
  interpretacao: Extract<Interpretacao, { tipo: 'criar_tarefa' }>,
  perfil: Perfil,
  colaboradores: Colaborador[],
  base: BaseLog,
  deps: Deps,
): Promise<void> {
  const res = resolverResponsavel(interpretacao.responsavel, colaboradores);

  if (res.tipo === 'ambiguo') {
    const nomes = res.candidatos.map((c) => c.nome_completo);
    const pergunta = `Encontrei mais de uma pessoa parecida com "${interpretacao.responsavel}": ${nomes.join(', ')}. Qual delas?`;
    await deps.db.criarConversaPendente({
      telefone: base.telefone,
      clinica_id: perfil.clinica_id,
      profile_id: perfil.id,
      pergunta,
      contexto: {
        tipo: 'responsavel',
        titulo: interpretacao.titulo,
        descricao: interpretacao.descricao,
        prazo: interpretacao.prazo,
        horario: interpretacao.horario,
        candidatos: res.candidatos.map(({ id, nome_completo }) => ({ id, nome_completo })),
      },
    });
    await deps.whats.enviarMensagem(base.telefone, pergunta);
    await deps.db.registrarLog({ ...base, interpretacao, resultado: 'esclarecimento_solicitado' });
    return;
  }

  if (res.tipo === 'nao_encontrado') {
    await deps.whats.enviarMensagem(
      base.telefone,
      `Não encontrei ninguém chamado "${interpretacao.responsavel}" na sua clínica. Pode conferir o nome?`,
    );
    await deps.db.registrarLog({ ...base, interpretacao, resultado: 'responsavel_nao_encontrado' });
    return;
  }

  await criarEConfirmar(
    perfil,
    res.colaborador,
    interpretacao.titulo,
    interpretacao.descricao,
    interpretacao.prazo,
    interpretacao.horario,
    { ...base },
    interpretacao,
    deps,
  );
}

async function tratarRespostaPendente(
  resposta: string,
  conversaId: string,
  contexto: ContextoPendente,
  perfil: Perfil,
  base: BaseLog,
  deps: Deps,
): Promise<void> {
  if (contexto.tipo === 'concluir') {
    await tratarRespostaConcluir(resposta, conversaId, contexto, perfil, base, deps);
    return;
  }

  const res = resolverResponsavel(resposta, contexto.candidatos);

  if (res.tipo !== 'unico') {
    const nomes = contexto.candidatos.map((c) => c.nome_completo).join(', ');
    await deps.whats.enviarMensagem(
      base.telefone,
      `Não entendi. Responda com um destes nomes: ${nomes}.`,
    );
    await deps.db.registrarLog({ ...base, resultado: 'esclarecimento_repetido' });
    return;
  }

  await deps.db.resolverConversa(conversaId);
  await criarEConfirmar(
    perfil,
    res.colaborador,
    contexto.titulo,
    contexto.descricao,
    contexto.prazo,
    contexto.horario,
    base,
    {
      tipo: 'criar_tarefa',
      responsavel: res.colaborador.nome_completo,
      titulo: contexto.titulo,
      descricao: contexto.descricao,
      prazo: contexto.prazo,
      horario: contexto.horario,
    },
    deps,
  );
}

async function tratarRespostaConcluir(
  resposta: string,
  conversaId: string,
  contexto: Extract<ContextoPendente, { tipo: 'concluir' }>,
  perfil: Perfil,
  base: BaseLog,
  deps: Deps,
): Promise<void> {
  const res = resolverTarefa(resposta, contexto.candidatos);

  if (res.tipo !== 'unico') {
    const titulos = contexto.candidatos.map((c) => `'${c.titulo}'`).join(', ');
    await deps.whats.enviarMensagem(
      base.telefone,
      `Não entendi. Responda com uma destas tarefas: ${titulos}.`,
    );
    await deps.db.registrarLog({ ...base, resultado: 'esclarecimento_repetido' });
    return;
  }

  await deps.db.resolverConversa(conversaId);
  const resultado = await deps.one.concluirTarefa({
    profile_id: contexto.profile_id,
    tarefa_id: res.tarefa.id,
  });

  if (resultado.sucesso) {
    await deps.whats.enviarMensagem(
      base.telefone,
      `Marquei '${resultado.titulo ?? res.tarefa.titulo}' como concluída.`,
    );
    await deps.db.registrarLog({ ...base, resultado: 'tarefa_concluida', tarefa_id: res.tarefa.id });
    return;
  }

  await deps.whats.enviarMensagem(
    base.telefone,
    `Não consegui concluir a tarefa: ${resultado.erro ?? 'erro desconhecido'}.`,
  );
  await deps.db.registrarLog({ ...base, resultado: 'erro' });
}

async function criarEConfirmar(
  perfil: Perfil,
  responsavel: Colaborador,
  titulo: string,
  descricao: string | undefined,
  prazo: string | undefined,
  horario: string | undefined,
  base: BaseLog,
  interpretacao: Interpretacao,
  deps: Deps,
): Promise<void> {
  if (perfil.papel !== 'gestor') {
    await deps.whats.enviarMensagem(
      base.telefone,
      'Você não tem permissão para criar tarefas — apenas gestores podem usar este comando.',
    );
    await deps.db.registrarLog({ ...base, interpretacao, resultado: 'nao_autorizado' });
    return;
  }

  const resultado = await deps.one.criarTarefa({
    clinica_id: perfil.clinica_id,
    criado_por_profile_id: perfil.id,
    responsavel_nome: responsavel.nome_completo,
    titulo,
    descricao,
    prazo,
    horario: horario ?? null,
  });

  if (resultado.sucesso) {
    const sufixoHorario = horario ? ` às ${horario}` : '';
    const sufixoPrazo = prazo ? ` (prazo: ${prazo}${sufixoHorario})` : sufixoHorario;
    await deps.whats.enviarMensagem(
      base.telefone,
      `✅ Tarefa criada para ${responsavel.nome_completo}: "${titulo}"${sufixoPrazo}.`,
    );
    await deps.db.registrarLog({
      ...base,
      interpretacao,
      resultado: 'tarefa_criada',
      tarefa_id: resultado.tarefa_id,
    });
  } else {
    await deps.whats.enviarMensagem(
      base.telefone,
      `Não consegui criar a tarefa: ${resultado.erro ?? 'erro desconhecido'}.`,
    );
    await deps.db.registrarLog({ ...base, interpretacao, resultado: 'erro' });
  }
}
