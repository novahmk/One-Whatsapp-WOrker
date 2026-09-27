import { timingSafeEqual } from 'node:crypto';

export function segredoValido(recebido: unknown, esperado: string): boolean {
  if (typeof recebido !== 'string' || recebido.length === 0) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function extrairBearer(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const m = /^Bearer\s+(.+)$/.exec(header);
  return m ? m[1] : null;
}
