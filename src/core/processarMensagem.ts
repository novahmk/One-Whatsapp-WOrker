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
import { resolverResponsavel } from './resolverResponsavel';
import { notificarAgenda } from './notificarAgenda';

type BaseLog = Omit<LogEntrada, 'resultado' | 'tarefa_id' | 'interpretacao'>;

export async function processarMensagem(
  msg: MensagemRecebida,
  deps: Deps,
  cfg: Config,
): Promise<void> {
  // Dedupe persistido: sobrevive a reinícios do processo.
  if (msg.messageId && (await deps.db.mensagemJaProcessada(msg.messageId))) return;

  const tipo = msg.audioUrl ? 'audio' : 'texto';

  const { perfil, colaboradores } = await deps.one.buscarPerfil(msg.telefone);
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
      const audio = await deps.whats.baixarMidia(msg.audioUrl);
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

  await fluxoCriarTarefa(interpretacao, perfil, colaboradores, base, deps);
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
        descricao: interpretacao.descricao,
        prazo: interpretacao.prazo,
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
    interpretacao.descricao,
    interpretacao.prazo,
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
    contexto.descricao,
    contexto.prazo,
    base,
    { tipo: 'criar_tarefa', responsavel: res.colaborador.nome_completo, descricao: contexto.descricao, prazo: contexto.prazo },
    deps,
  );
}

async function criarEConfirmar(
  perfil: Perfil,
  responsavel: Colaborador,
  descricao: string,
  prazo: string | undefined,
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
    descricao,
    prazo,
  });

  if (resultado.sucesso) {
    const sufixoPrazo = prazo ? ` (prazo: ${prazo})` : '';
    await deps.whats.enviarMensagem(
      base.telefone,
      `✅ Tarefa criada para ${responsavel.nome_completo}: "${descricao}"${sufixoPrazo}.`,
    );
    await deps.db.registrarLog({
      ...base,
      interpretacao,
      resultado: 'tarefa_criada',
      tarefa_id: resultado.tarefa_id,
    });
    if (resultado.responsavel_profile_id) {
      try {
        await notificarAgenda(deps, resultado.responsavel_profile_id, prazo, { dedupe: false });
      } catch (e) {
        console.error('Falha ao notificar agenda do responsável:', e);
      }
    }
  } else {
    await deps.whats.enviarMensagem(
      base.telefone,
      `Não consegui criar a tarefa: ${resultado.erro ?? 'erro desconhecido'}.`,
    );
    await deps.db.registrarLog({ ...base, interpretacao, resultado: 'erro' });
  }
}
