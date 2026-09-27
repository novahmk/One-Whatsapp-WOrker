import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config';
import { criarServidor } from '../src/server';
import { criarDepsMock } from '../src/services/mock';
import fixtureTexto from './fixtures/webhook-texto.json';

const cfg = carregarConfig({ MOCK_EXTERNAL: 'true' });

describe('POST /webhooks/whatsapp', () => {
  it('rejeita assinatura inválida com 401', async () => {
    const { deps } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'x-webhook-signature': 'errada' },
      payload: fixtureTexto,
    });

    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('aceita assinatura válida e processa a mensagem de ponta a ponta', async () => {
    const { deps, estado } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'x-webhook-signature': cfg.WASENDER_WEBHOOK_SECRET },
      payload: fixtureTexto,
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ received: true });
    expect(estado.tarefas).toHaveLength(1);
    expect(estado.tarefas[0].responsavel_nome).toBe('Carla Lima');
    await app.close();
  });

  it('responde 200 e ignora payload sem mensagem útil', async () => {
    const { deps, estado } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'x-webhook-signature': cfg.WASENDER_WEBHOOK_SECRET },
      payload: { event: 'messages.upsert', data: {} },
    });

    expect(r.statusCode).toBe(200);
    expect(estado.logs).toHaveLength(0);
    await app.close();
  });
});
