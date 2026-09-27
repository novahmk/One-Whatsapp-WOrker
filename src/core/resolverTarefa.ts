import { normalizar } from './resolverResponsavel';

export interface TarefaRef {
  id: string;
  titulo: string;
}

export type ResultadoTarefa =
  | { tipo: 'unico'; tarefa: TarefaRef }
  | { tipo: 'ambiguo'; candidatos: TarefaRef[] }
  | { tipo: 'nao_encontrado' };

export function resolverTarefa(texto: string, candidatos: TarefaRef[]): ResultadoTarefa {
  const alvo = normalizar(texto);
  if (!alvo) return { tipo: 'nao_encontrado' };

  // Resposta por número de ordem (ex.: "1", "2").
  const n = Number(alvo);
  if (Number.isInteger(n) && n >= 1 && n <= candidatos.length) {
    return { tipo: 'unico', tarefa: candidatos[n - 1] };
  }

  const exatos = candidatos.filter((c) => normalizar(c.titulo) === alvo);
  if (exatos.length === 1) return { tipo: 'unico', tarefa: exatos[0] };
  if (exatos.length > 1) return { tipo: 'ambiguo', candidatos: exatos };

  const contidos = candidatos.filter((c) => {
    const t = normalizar(c.titulo);
    return t.includes(alvo) || alvo.includes(t);
  });
  if (contidos.length === 1) return { tipo: 'unico', tarefa: contidos[0] };
  if (contidos.length > 1) return { tipo: 'ambiguo', candidatos: contidos };

  return { tipo: 'nao_encontrado' };
}
