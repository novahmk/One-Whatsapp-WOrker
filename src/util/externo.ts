// Chamadas externas com timeout explícito e identificação do serviço que falhou.

export type ServicoExterno = 'wasender' | 'one-app' | 'openai';

export const TIMEOUT_EXTERNO_MS = 10_000;

// Transcrição sobe o áudio inteiro e processa: áudios longos passam de 10s.
export const TIMEOUT_TRANSCRICAO_MS = 60_000;

export class ErroServicoExterno extends Error {
  constructor(
    public readonly servico: ServicoExterno,
    public readonly etapa: string,
    public readonly causa: unknown,
  ) {
    const base = causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa);
    super(`[${servico}] ${etapa}: ${base}`);
    this.name = 'ErroServicoExterno';
  }
}

/** fetch com AbortController (10s). Erros de rede/timeout viram ErroServicoExterno. */
export async function fetchExterno(
  servico: ServicoExterno,
  etapa: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_EXTERNO_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    const causa = controller.signal.aborted ? new Error(`timeout após ${timeoutMs}ms`) : e;
    throw new ErroServicoExterno(servico, etapa, causa);
  } finally {
    clearTimeout(timer);
  }
}

/** Envolve uma chamada (ex.: SDK da OpenAI) para marcar o serviço em caso de erro. */
export async function comServico<T>(
  servico: ServicoExterno,
  etapa: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErroServicoExterno) throw e;
    throw new ErroServicoExterno(servico, etapa, e);
  }
}

// Mascara tokens/chaves que possam aparecer em mensagens de erro.
const PADROES_SEGREDO: RegExp[] = [
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /((?:api[_-]?key|token|secret|senha|password|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export function mascararSegredos(texto: string, segredos: Array<string | undefined> = []): string {
  let out = texto;
  for (const s of segredos) {
    if (s && s.length >= 6) out = out.split(s).join('***');
  }
  for (const re of PADROES_SEGREDO) {
    out = out.replace(re, (_m, prefixo) => (typeof prefixo === 'string' ? `${prefixo}***` : '***'));
  }
  return out;
}

/** Resumo seguro de um erro para log: nome, mensagem, 5 linhas de stack e serviço/etapa. */
export function resumirErro(e: unknown, segredos: Array<string | undefined> = []) {
  const err = e instanceof Error ? e : new Error(String(e));
  const causa = err instanceof ErroServicoExterno ? err.causa : undefined;
  const stack = (err.stack ?? '').split('\n').slice(0, 5).join('\n');
  return {
    servico: err instanceof ErroServicoExterno ? err.servico : 'interno',
    etapa: err instanceof ErroServicoExterno ? err.etapa : undefined,
    nome: err.name,
    mensagem: mascararSegredos(err.message, segredos),
    causa:
      causa instanceof Error
        ? mascararSegredos(`${causa.name}: ${causa.message}`, segredos)
        : undefined,
    stack: mascararSegredos(stack, segredos),
  };
}
