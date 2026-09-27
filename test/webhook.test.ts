import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config';
import { criarServidor } from '../src/server';
import { criarDepsMock } from '../src/services/mock';
import { extrairMensagem } from '../src/routes/webhook';
import fixtureTexto from './fixtures/webhook-texto.json';

const cfg = carregarConfig({ MOCK_EXTERNAL: 'true' });

describe('extrairMensagem', () => {
  it('remove sufixo de dispositivo antes de normalizar telefone', () => {
    const msg = extrairMensagem({
      event: 'messages.upsert',
      data: {
        messages: {
          key: {
            id: 'SIM-TEXTO-DEVICE-001',
            remoteJid: '55 (11) 99352-1100:7@s.whatsapp.net',
            fromMe: false,
          },
          message: {
            conversation: 'oi',
          },
        },
      },
    });

    expect(msg?.telefone).toBe('5511993521100');
  });
});

describe('POST /webhooks/whatsapp', () => {
  it('trata remetente @lid com log dedicado e resposta amigável', async () => {
    const { deps, estado } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'x-webhook-signature': cfg.WASENDER_WEBHOOK_SECRET },
      payload: {
        event: 'messages.upsert',
        data: {
          messages: {
            key: {
              id: 'SIM-LID-001',
              remoteJid: '167255035912336@lid',
              fromMe: false,
            },
            message: {
              conversation: 'cria uma tarefa para Carla',
            },
          },
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ received: true });
    expect(estado.tarefas).toHaveLength(0);
    expect(estado.logs.at(-1)?.resultado).toBe('remetente_lid_nao_suportado');
    expect(estado.enviadas.at(-1)?.telefone).toBe('167255035912336');
    expect(estado.enviadas.at(-1)?.texto).toContain('identificador privado (LID)');
    await app.close();
  });

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
