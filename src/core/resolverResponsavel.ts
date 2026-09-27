import { Colaborador } from '../types';

export type ResultadoResolucao<T extends Colaborador> =
  | { tipo: 'unico'; colaborador: T }
  | { tipo: 'ambiguo'; candidatos: T[] }
  | { tipo: 'nao_encontrado' };

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Match parcial: toda palavra do alvo é prefixo de alguma palavra do nome.
function bateParcial(palavrasAlvo: string[], nome: string): boolean {
  const palavrasNome = normalizar(nome).split(/\s+/);
  return palavrasAlvo.every((p) => palavrasNome.some((n) => n.startsWith(p)));
}

export function resolverResponsavel<T extends Colaborador>(
  nome: string,
  colaboradores: T[],
): ResultadoResolucao<T> {
  const alvo = normalizar(nome);
  if (!alvo) return { tipo: 'nao_encontrado' };

  const exatos = colaboradores.filter((c) => normalizar(c.nome_completo) === alvo);
  if (exatos.length === 1) return { tipo: 'unico', colaborador: exatos[0] };
  if (exatos.length > 1) return { tipo: 'ambiguo', candidatos: exatos };

  const palavras = alvo.split(/\s+/);
  const parciais = colaboradores.filter((c) => bateParcial(palavras, c.nome_completo));
  if (parciais.length === 1) return { tipo: 'unico', colaborador: parciais[0] };
  if (parciais.length > 1) return { tipo: 'ambiguo', candidatos: parciais };

  return { tipo: 'nao_encontrado' };
}
