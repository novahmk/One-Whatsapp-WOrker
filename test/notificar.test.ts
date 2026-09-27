import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config';
import { criarServidor } from '../src/server';
import { criarDepsMock } from '../src/services/mock';

const cfg = carregarConfig({ MOCK_EXTERNAL: 'true' });

const bodyValido = {
  telefone: '5511999990003',
  tipo: 'tarefa_atribuida',
  dados: {
    titulo: 'Entregar relatório',
    data_vencimento: '30/09',
    horario_sugerido: '14:00',
    criado_por_nome: 'Ana Souza',
  },
};

describe('POST /notificar', () => {
  it('rejeita sem Authorization com 401', async () => {
    const { deps } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({ method: 'POST', url: '/notificar', payload: bodyValido });

    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('rejeita tipo desconhecido com 400', async () => {
    const { deps } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/notificar',
      headers: { authorization: `Bearer ${cfg.WHATSAPP_SERVICE_SECRET}` },
      payload: { ...bodyValido, tipo: 'outro_tipo' },
    });

    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('envia notificação formatada com horário', async () => {
    const { deps, estado } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/notificar',
      headers: { authorization: `Bearer ${cfg.WHATSAPP_SERVICE_SECRET}` },
      payload: bodyValido,
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ sucesso: true });
    expect(estado.enviadas).toHaveLength(1);
    expect(estado.enviadas[0].telefone).toBe('5511999990003');
    expect(estado.enviadas[0].texto).toBe(
      'Você tem uma nova tarefa: Entregar relatório, para 30/09 às 14:00. Criada por Ana Souza.',
    );
    await app.close();
  });

  it('omite horário quando não informado', async () => {
    const { deps, estado } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/notificar',
      headers: { authorization: `Bearer ${cfg.WHATSAPP_SERVICE_SECRET}` },
      payload: { ...bodyValido, dados: { ...bodyValido.dados, horario_sugerido: null } },
    });

    expect(r.statusCode).toBe(200);
    expect(estado.enviadas[0].texto).toBe(
      'Você tem uma nova tarefa: Entregar relatório, para 30/09. Criada por Ana Souza.',
    );
    await app.close();
  });

  it('responde 500 quando o envio falha', async () => {
    const { deps } = criarDepsMock();
    deps.whats.enviarMensagem = async () => {
      throw new Error('wasender fora do ar');
    };
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/notificar',
      headers: { authorization: `Bearer ${cfg.WHATSAPP_SERVICE_SECRET}` },
      payload: bodyValido,
    });

    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ erro: 'Falha no envio da mensagem' });
    await app.close();
  });
});
