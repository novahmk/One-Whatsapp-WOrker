import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ErroServicoExterno,
  comServico,
  fetchExterno,
  mascararSegredos,
  resumirErro,
} from '../src/util/externo';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mascararSegredos', () => {
  it('mascara segredos conhecidos passados explicitamente', () => {
    const texto = 'falhou com a chave minha-chave-secreta';
    expect(mascararSegredos(texto, ['minha-chave-secreta'])).toBe('falhou com a chave ***');
  });

  it('ignora segredos curtos demais para evitar mascarar texto comum', () => {
    expect(mascararSegredos('erro ao abrir', ['abrir'])).toBe('erro ao abrir');
  });

  it('mascara padrões de token no texto', () => {
    const comBearer = mascararSegredos('Authorization: Bearer abc123def456');
    expect(comBearer).not.toContain('abc123def456');
    expect(comBearer.startsWith('Authorization: ***')).toBe(true);
    expect(mascararSegredos('usando sk-proj-abcdefgh12345678')).toBe('usando ***');
  });
});

describe('fetchExterno', () => {
  it('converte falha de rede em ErroServicoExterno com serviço e etapa', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });

    const erro = await fetchExterno('one-app', 'perfil', 'https://exemplo.test').catch((e) => e);

    expect(erro).toBeInstanceOf(ErroServicoExterno);
    expect(erro.servico).toBe('one-app');
    expect(erro.etapa).toBe('perfil');
    expect(erro.message).toContain('ECONNREFUSED');
  });

  it('aborta a requisição quando estoura o timeout', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit = {}) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const erro = await fetchExterno('wasender', 'baixar-midia', 'https://exemplo.test', {}, 20).catch(
      (e) => e,
    );

    expect(erro).toBeInstanceOf(ErroServicoExterno);
    expect(erro.causa).toBeInstanceOf(Error);
    expect((erro.causa as Error).message).toContain('timeout após 20ms');
  });

  it('devolve a resposta quando a chamada funciona', async () => {
    vi.stubGlobal('fetch', async () => new Response('ok', { status: 200 }));

    const r = await fetchExterno('one-app', 'agenda', 'https://exemplo.test');

    expect(r.status).toBe(200);
  });
});

describe('comServico', () => {
  it('marca o serviço no erro e preserva a causa', async () => {
    const original = new TypeError('boom');
    const erro = await comServico('openai', 'transcrever-audio', async () => {
      throw original;
    }).catch((e) => e);

    expect(erro).toBeInstanceOf(ErroServicoExterno);
    expect(erro.servico).toBe('openai');
    expect(erro.causa).toBe(original);
  });

  it('não reembrulha um ErroServicoExterno já identificado', async () => {
    const original = new ErroServicoExterno('wasender', 'decrypt-media', new Error('HTTP 500'));
    const erro = await comServico('openai', 'interpretar-mensagem', async () => {
      throw original;
    }).catch((e) => e);

    expect(erro).toBe(original);
  });
});

describe('resumirErro', () => {
  it('extrai serviço, etapa e causa mascarando segredos', () => {
    const erro = new ErroServicoExterno(
      'wasender',
      'enviar-mensagem',
      new Error('HTTP 401 com chave-super-secreta'),
    );

    const resumo = resumirErro(erro, ['chave-super-secreta']);

    expect(resumo.servico).toBe('wasender');
    expect(resumo.etapa).toBe('enviar-mensagem');
    expect(resumo.causa).toBe('Error: HTTP 401 com ***');
    expect(resumo.mensagem).not.toContain('chave-super-secreta');
  });

  it('classifica erros comuns como interno e limita o stack', () => {
    const resumo = resumirErro(new Error('falhou'));

    expect(resumo.servico).toBe('interno');
    expect(resumo.etapa).toBeUndefined();
    expect(resumo.nome).toBe('Error');
    expect(resumo.stack.split('\n').length).toBeLessThanOrEqual(5);
  });

  it('aceita valores que não são Error', () => {
    expect(resumirErro('quebrou').mensagem).toBe('quebrou');
  });
});
