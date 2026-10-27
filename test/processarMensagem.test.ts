import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config';
import { processarMensagem } from '../src/core/processarMensagem';
import { criarDepsMock, TELEFONE_COLABORADORA, TELEFONE_GESTORA } from '../src/services/mock';

const cfg = carregarConfig({ MOCK_EXTERNAL: 'true' });

describe('processarMensagem', () => {
  it('cria tarefa no caminho feliz e confirma pelo WhatsApp', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsaveis: ['Carla Lima'],
      titulo: 'organizar os prontuários',
      prazo: '2026-10-02',
      horario: '14:00',
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'cria tarefa pra Carla' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(1);
    expect(estado.tarefas[0]).toMatchObject({
      clinica_id: 'clinica-1',
      criado_por_profile_id: 'perfil-ana',
      responsavel_nome: 'Carla Lima',
      responsavel_id: 'perfil-carla',
      responsaveis: ['perfil-carla'],
      responsaveis_nomes: ['Carla Lima'],
      titulo: 'organizar os prontuários',
      prazo: '2026-10-02',
      horario: '14:00',
    });
    // Confirmação ao remetente é montada só com dados locais.
    expect(estado.enviadas.at(-1)?.telefone).toBe(TELEFONE_GESTORA);
    expect(estado.enviadas.at(-1)?.texto).toContain('Tarefa criada para Carla Lima');
    expect(estado.enviadas.at(-1)?.texto).toContain('prazo: 2026-10-02 às 14:00');
    // Avisar os responsáveis é do ONE, via POST /notificar.
    expect(estado.enviadas.some((e) => e.telefone === TELEFONE_COLABORADORA)).toBe(false);
    expect(estado.logs.at(-1)).toMatchObject({ resultado: 'tarefa_criada', tarefa_id: 'mock-tarefa-1' });
  });

  it('tarefa sem horário envia horario null ao ONE', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsaveis: ['Carla Lima'],
      titulo: 'organizar os prontuários',
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'cria tarefa pra Carla' },
      deps,
      cfg,
    );

    expect(estado.tarefas[0].horario).toBeNull();
    expect(estado.enviadas.at(-1)?.texto).not.toContain('às');
  });

  it('nome ambíguo gera pergunta e conversa pendente; resposta resolve e cria', async () => {
    const { deps, estado } = criarDepsMock();

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'Pede pro Vitor revisar a agenda' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.conversas).toHaveLength(1);
    expect(estado.conversas[0].status).toBe('aguardando_resposta');
    expect(estado.enviadas.at(-1)?.texto).toContain('mais de uma pessoa');
    expect(estado.logs.at(-1)?.resultado).toBe('esclarecimento_solicitado');

    await processarMensagem(
      { messageId: 'm2', telefone: TELEFONE_GESTORA, texto: 'Vitor Almeida' },
      deps,
      cfg,
    );

    expect(estado.conversas[0].status).toBe('resolvida');
    expect(estado.tarefas).toHaveLength(1);
    expect(estado.tarefas[0].responsavel_nome).toBe('Vitor Almeida');
    expect(estado.logs.at(-1)?.resultado).toBe('tarefa_criada');
  });

  it('multi-responsáveis: envia a lista completa ao ONE e confirma ao gestor', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsaveis: ['Carla Lima', 'Vitor Almeida', 'Vitor Santos'],
      titulo: 'revisar os prontuários',
      mensagem: 'é prioridade da semana',
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'tarefa pra Carla, Vitor A e Vitor S' },
      deps,
      cfg,
    );

    expect(estado.tarefas[0]).toMatchObject({
      responsaveis: ['perfil-carla', 'perfil-vitor-a', 'perfil-vitor-s'],
      responsaveis_nomes: ['Carla Lima', 'Vitor Almeida', 'Vitor Santos'],
      responsavel_nome: 'Carla Lima',
      responsavel_id: 'perfil-carla',
      mensagem_personalizada: 'é prioridade da semana',
    });

    // O worker só confirma ao gestor; os avisos individuais vêm do ONE via /notificar.
    const enviadas = estado.enviadas.filter((e) => e.telefone === TELEFONE_GESTORA);
    expect(estado.enviadas).toHaveLength(1);
    expect(enviadas[0].texto).toContain(
      'Tarefa criada para Carla Lima, Vitor Almeida e Vitor Santos',
    );
    expect(estado.logs.at(-1)?.resultado).toBe('tarefa_criada');
  });

  it('nome repetido vira um responsável só', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsaveis: ['Carla', 'Carla Lima'],
      titulo: 'organizar a sala',
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'tarefa pra Carla' },
      deps,
      cfg,
    );

    expect(estado.tarefas[0].responsaveis).toEqual(['perfil-carla']);
    expect(estado.enviadas.at(-1)?.texto).toContain('Tarefa criada para Carla Lima:');
  });

  it('recusa mais de 5 responsáveis sem criar a tarefa', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsaveis: ['a', 'b', 'c', 'd', 'e', 'f'],
      titulo: 'tarefa grande',
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'tarefa pra todo mundo' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.enviadas.at(-1)?.texto).toContain('no máximo 5 pessoas');
    expect(estado.logs.at(-1)?.resultado).toBe('limite_responsaveis');
  });

  it('ambiguidade no meio da lista pergunta e depois cria com todos', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsaveis: ['Carla Lima', 'Vitor'],
      titulo: 'revisar a agenda',
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'tarefa pra Carla e Vitor' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.enviadas.at(-1)?.texto).toContain('mais de uma pessoa parecida com "Vitor"');

    // Na resposta, o interpretador nem é chamado: o contexto pendente guarda a Carla.
    await processarMensagem(
      { messageId: 'm2', telefone: TELEFONE_GESTORA, texto: 'Vitor Santos' },
      deps,
      cfg,
    );

    expect(estado.conversas[0].status).toBe('resolvida');
    expect(estado.tarefas).toHaveLength(1);
    expect(estado.tarefas[0].responsaveis).toEqual(['perfil-carla', 'perfil-vitor-s']);
    expect(estado.enviadas.at(-1)?.texto).toContain(
      'Tarefa criada para Carla Lima e Vitor Santos',
    );
  });

  it('duas ambiguidades seguidas são perguntadas uma de cada vez', async () => {
    const { deps, estado } = criarDepsMock({
      perfis: [
        {
          id: 'perfil-ana',
          clinica_id: 'clinica-1',
          nome_completo: 'Ana Souza',
          telefone_whatsapp: TELEFONE_GESTORA,
          whatsapp_verificado: true,
          papel: 'gestor',
        },
        {
          id: 'perfil-vitor-a',
          clinica_id: 'clinica-1',
          nome_completo: 'Vitor Almeida',
          telefone_whatsapp: '5511999990001',
          whatsapp_verificado: true,
          papel: 'colaborador',
        },
        {
          id: 'perfil-vitor-s',
          clinica_id: 'clinica-1',
          nome_completo: 'Vitor Santos',
          telefone_whatsapp: '5511999990002',
          whatsapp_verificado: true,
          papel: 'colaborador',
        },
        {
          id: 'perfil-carla-l',
          clinica_id: 'clinica-1',
          nome_completo: 'Carla Lima',
          telefone_whatsapp: TELEFONE_COLABORADORA,
          whatsapp_verificado: true,
          papel: 'colaborador',
        },
        {
          id: 'perfil-carla-m',
          clinica_id: 'clinica-1',
          nome_completo: 'Carla Moreira',
          telefone_whatsapp: '5511999990004',
          whatsapp_verificado: true,
          papel: 'colaborador',
        },
      ],
    });
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsaveis: ['Vitor', 'Carla'],
      titulo: 'revisar a agenda',
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'tarefa pra Vitor e Carla' },
      deps,
      cfg,
    );
    expect(estado.enviadas.at(-1)?.texto).toContain('parecida com "Vitor"');

    await processarMensagem(
      { messageId: 'm2', telefone: TELEFONE_GESTORA, texto: 'Vitor Santos' },
      deps,
      cfg,
    );
    expect(estado.tarefas).toHaveLength(0);
    expect(estado.enviadas.at(-1)?.texto).toContain('parecida com "Carla"');

    await processarMensagem(
      { messageId: 'm3', telefone: TELEFONE_GESTORA, texto: 'Carla Moreira' },
      deps,
      cfg,
    );
    expect(estado.tarefas).toHaveLength(1);
    expect(estado.tarefas[0].responsaveis).toEqual(['perfil-vitor-s', 'perfil-carla-m']);
    expect(estado.conversas.every((c) => c.status === 'resolvida')).toBe(true);
  });

  it('responsável não encontrado na lista não cria tarefa parcial', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsaveis: ['Carla Lima', 'Roberta'],
      titulo: 'revisar a agenda',
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'tarefa pra Carla e Roberta' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.enviadas.at(-1)?.texto).toContain('ninguém chamado "Roberta"');
    expect(estado.logs.at(-1)?.resultado).toBe('responsavel_nao_encontrado');
  });

  it('resposta que não bate com os candidatos repete a pergunta', async () => {    const { deps, estado } = criarDepsMock();

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'Pede pro Vitor revisar a agenda' },
      deps,
      cfg,
    );
    await processarMensagem(
      { messageId: 'm2', telefone: TELEFONE_GESTORA, texto: 'Fernanda' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.conversas[0].status).toBe('aguardando_resposta');
    expect(estado.logs.at(-1)?.resultado).toBe('esclarecimento_repetido');
  });

  it('recusa quem não é gestor e loga nao_autorizado', async () => {
    const { deps, estado } = criarDepsMock();

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_COLABORADORA, texto: 'cria tarefa pra Ana Souza revisar' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.enviadas.at(-1)?.texto).toContain('não tem permissão');
    expect(estado.logs.at(-1)?.resultado).toBe('nao_autorizado');
  });

  it('telefone não reconhecido recebe orientação e loga nao_reconhecido', async () => {
    const { deps, estado } = criarDepsMock();

    await processarMensagem(
      { messageId: 'm1', telefone: '5500000000000', texto: 'oi' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.enviadas).toHaveLength(1);
    expect(estado.enviadas[0].texto).toContain('ainda não está configurado no ONE');
    expect(estado.logs.at(-1)?.resultado).toBe('nao_reconhecido');
  });

  it('erro no /perfil responde ao usuário e loga erro_perfil, sem ficar mudo', async () => {
    const { deps, estado } = criarDepsMock();
    deps.one.buscarPerfil = async () => ({ perfil: null, colaboradores: [], erro: 'HTTP 500' });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'cria tarefa pra Carla' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.enviadas).toHaveLength(1);
    expect(estado.enviadas[0].texto).toContain('problema pra te identificar no ONE');
    expect(estado.logs.at(-1)?.resultado).toBe('erro_perfil');
  });

  it('deduplica mensagens com o mesmo message_id', async () => {
    const { deps, estado } = criarDepsMock();
    const msg = { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'cria tarefa pra Carla Lima arquivar exames' };

    await processarMensagem(msg, deps, cfg);
    await processarMensagem(msg, deps, cfg);

    expect(estado.tarefas).toHaveLength(1);
    expect(estado.logs.filter((l) => l.message_id === 'm1')).toHaveLength(1);
  });

  it('áudio é baixado, transcrito e segue o mesmo pipeline', async () => {
    const { deps, estado } = criarDepsMock();

    await processarMensagem(
      {
        messageId: 'm1',
        telefone: TELEFONE_GESTORA,
        audioUrl: 'https://exemplo.local/audio.ogg',
      },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(1);
    expect(estado.tarefas[0].responsavel_nome).toBe('Carla Lima');
    expect(estado.logs.at(-1)).toMatchObject({ tipo: 'audio', resultado: 'tarefa_criada' });
    expect(estado.logs.at(-1)?.transcricao).toContain('Carla Lima');
  });

  it('falha na transcrição responde pedindo texto e loga erro, sem quebrar o webhook', async () => {
    const { deps, estado } = criarDepsMock();
    deps.transcrever = async () => {
      throw new Error('whisper indisponível');
    };

    await processarMensagem(
      {
        messageId: 'm1',
        telefone: TELEFONE_GESTORA,
        audioUrl: 'https://exemplo.local/audio.ogg',
      },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.enviadas.at(-1)?.texto).toContain('Não consegui processar seu áudio');
    expect(estado.logs.at(-1)).toMatchObject({ tipo: 'audio', resultado: 'erro' });
  });

  it('transcrição vazia recebe o mesmo fallback de erro', async () => {
    const { deps, estado } = criarDepsMock();
    deps.transcrever = async () => '   ';

    await processarMensagem(
      {
        messageId: 'm1',
        telefone: TELEFONE_GESTORA,
        audioUrl: 'https://exemplo.local/audio.ogg',
      },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    expect(estado.logs.at(-1)?.resultado).toBe('erro');
  });

  it('consultar_agenda responde a lista do dia sem criar nada', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({ tipo: 'consultar_agenda', data: '2026-09-28' });
    deps.one.buscarAgenda = async (_profileId, data) => ({
      data: data ?? '2026-09-28',
      itens: [
        { titulo: 'Reunião com Bruno', horario: '14:00' },
        { titulo: 'Follow-up cliente X' },
      ],
    });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'o que tenho amanhã?' },
      deps,
      cfg,
    );

    expect(estado.tarefas).toHaveLength(0);
    const resposta = estado.enviadas.at(-1)?.texto ?? '';
    expect(resposta).toContain('📅 *Sua agenda de hoje*');
    expect(resposta).toContain('*14:00* · Reunião com Bruno');
    expect(resposta).toContain('• Follow-up cliente X');
    expect(resposta).toContain('✅ 1 com horário · 1 sem horário');
    expect(estado.logs.at(-1)?.resultado).toBe('agenda_consultada');
  });

  it('concluir_tarefa direto marca como concluída', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({ tipo: 'concluir_tarefa', titulo: 'relatório mensal' });

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'já entreguei o relatório mensal' },
      deps,
      cfg,
    );

    expect(estado.concluidas).toHaveLength(1);
    expect(estado.concluidas[0].titulo_aproximado).toBe('relatório mensal');
    expect(estado.enviadas.at(-1)?.texto).toContain('como concluída');
    expect(estado.logs.at(-1)?.resultado).toBe('tarefa_concluida');
  });

  it('concluir_tarefa ambíguo pergunta e a resposta resolve pelo id', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({ tipo: 'concluir_tarefa', titulo: 'follow up' });
    let chamada = 0;
    deps.one.concluirTarefa = async (body) => {
      chamada += 1;
      if (chamada === 1) {
        return {
          sucesso: false,
          ambiguo: true,
          candidatos: [
            { id: 't1', titulo: 'Follow up cliente X' },
            { id: 't2', titulo: 'Follow up cliente Y' },
          ],
        };
      }
      return { sucesso: true, titulo: 'Follow up cliente Y', tarefa_id: body.tarefa_id };
    };

    await processarMensagem(
      { messageId: 'm1', telefone: TELEFONE_GESTORA, texto: 'concluí o follow up' },
      deps,
      cfg,
    );

    expect(estado.conversas).toHaveLength(1);
    expect(estado.enviadas.at(-1)?.texto).toContain('mais de uma tarefa parecida');

    await processarMensagem(
      { messageId: 'm2', telefone: TELEFONE_GESTORA, texto: '2' },
      deps,
      cfg,
    );

    expect(estado.conversas[0].status).toBe('resolvida');
    expect(estado.enviadas.at(-1)?.texto).toContain("Marquei 'Follow up cliente Y' como concluída");
    expect(estado.logs.at(-1)?.resultado).toBe('tarefa_concluida');
  });
});

