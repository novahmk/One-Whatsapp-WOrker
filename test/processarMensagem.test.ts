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
      responsavel: 'Carla Lima',
      descricao: 'organizar os prontuários',
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
      prazo: '2026-10-02',
      horario: '14:00',
    });
    // Confirmação ao remetente é montada só com dados locais — última mensagem e último log.
    expect(estado.enviadas.at(-1)?.telefone).toBe(TELEFONE_GESTORA);
    expect(estado.enviadas.at(-1)?.texto).toContain('Tarefa criada para Carla Lima');
    expect(estado.enviadas.at(-1)?.texto).toContain('prazo: 2026-10-02 às 14:00');
    expect(estado.logs.at(-1)).toMatchObject({ resultado: 'tarefa_criada', tarefa_id: 'mock-tarefa-1' });
  });

  it('tarefa sem horário envia horario null ao ONE', async () => {
    const { deps, estado } = criarDepsMock();
    deps.interpretar = async () => ({
      tipo: 'criar_tarefa',
      responsavel: 'Carla Lima',
      descricao: 'organizar os prontuários',
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

  it('resposta que não bate com os candidatos repete a pergunta', async () => {
    const { deps, estado } = criarDepsMock();

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
});
