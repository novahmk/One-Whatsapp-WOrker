import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config';
import { criarServidor } from '../src/server';
import { criarDepsMock } from '../src/services/mock';

const cfg = carregarConfig({ MOCK_EXTERNAL: 'true' });

const bodyValido = { telefone: '5511999999999', nome: 'Carlos Silva', codigo: '123456' };

describe('POST /verificacao', () => {
  it('rejeita requisição sem Authorization com 401', async () => {
    const { deps } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({ method: 'POST', url: '/verificacao', payload: bodyValido });

    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('rejeita token errado com 401', async () => {
    const { deps } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/verificacao',
      headers: { authorization: 'Bearer errado' },
      payload: bodyValido,
    });

    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('rejeita body inválido com 400', async () => {
    const { deps } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/verificacao',
      headers: { authorization: `Bearer ${cfg.WHATSAPP_SERVICE_SECRET}` },
      payload: { telefone: '5511999999999' },
    });

    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('envia o código pelo WhatsApp e responde sucesso', async () => {
    const { deps, estado } = criarDepsMock();
    const app = criarServidor(deps, cfg);

    const r = await app.inject({
      method: 'POST',
      url: '/verificacao',
      headers: { authorization: `Bearer ${cfg.WHATSAPP_SERVICE_SECRET}` },
      payload: bodyValido,
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ sucesso: true });
    expect(estado.enviadas).toHaveLength(1);
    expect(estado.enviadas[0].telefone).toBe('5511999999999');
    expect(estado.enviadas[0].texto).toContain('Carlos Silva');
    expect(estado.enviadas[0].texto).toContain('*123456*');
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
      url: '/verificacao',
      headers: { authorization: `Bearer ${cfg.WHATSAPP_SERVICE_SECRET}` },
      payload: bodyValido,
    });

    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ erro: 'Falha no envio da mensagem' });
    await app.close();
  });
});
