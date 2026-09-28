import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config';
import { criarServidor } from '../src/server';
import { criarDepsMock } from '../src/services/mock';
import { extrairMensagem } from '../src/routes/webhook';
import fixtureTexto from './fixtures/webhook-texto.json';

const cfg = carregarConfig({ MOCK_EXTERNAL: 'true' });

describe('extrairMensagem', () => {
  it('remove sufixo de dispositivo mantendo o JID completo', () => {
    const msg = extrairMensagem({
      event: 'messages.upsert',
      data: {
        messages: {
          key: {
            id: 'SIM-TEXTO-DEVICE-001',
            remoteJid: '5511993521100:7@s.whatsapp.net',
            fromMe: false,
          },
          message: {
            conversation: 'oi',
          },
        },
      },
    });

    expect(msg?.telefone).toBe('5511993521100@s.whatsapp.net');
  });

  it('mantém JID @lid inteiro como telefone', () => {
    const msg = extrairMensagem({
      event: 'messages.upsert',
      data: {
        messages: {
          key: { id: 'SIM-LID-000', remoteJid: '167255035912336@lid', fromMe: false },
          message: { conversation: 'oi' },
        },
      },
    });

    expect(msg?.telefone).toBe('167255035912336@lid');
  });

  it('ignora mensagens de grupo (@g.us)', () => {
    const msg = extrairMensagem({
      event: 'messages.upsert',
      data: {
        messages: {
          key: { id: 'SIM-GRUPO-001', remoteJid: '120363000000000000@g.us', fromMe: false },
          message: { conversation: 'oi grupo' },
        },
      },
    });

    expect(msg).toBeNull();
  });
});

describe('POST /webhooks/whatsapp', () => {
  it('remetente @lid segue o pipeline e responde pelo próprio JID', async () => {
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
    expect(estado.logs.at(-1)?.resultado).toBe('nao_reconhecido');
    expect(estado.enviadas.at(-1)?.telefone).toBe('167255035912336@lid');
    expect(estado.enviadas.at(-1)?.texto).toContain('ainda não está configurado no ONE');
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
