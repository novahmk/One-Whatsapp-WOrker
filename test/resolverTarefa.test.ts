import { describe, expect, it } from 'vitest';
import { resolverTarefa, TarefaRef } from '../src/core/resolverTarefa';

const candidatos: TarefaRef[] = [
  { id: 't1', titulo: 'Follow up cliente X' },
  { id: 't2', titulo: 'Follow up cliente Y' },
  { id: 't3', titulo: 'Enviar relatório mensal' },
];

describe('resolverTarefa', () => {
  it('resolve por número de ordem', () => {
    expect(resolverTarefa('2', candidatos)).toEqual({ tipo: 'unico', tarefa: candidatos[1] });
  });

  it('resolve por título único contido', () => {
    expect(resolverTarefa('relatório mensal', candidatos)).toEqual({
      tipo: 'unico',
      tarefa: candidatos[2],
    });
  });

  it('marca ambíguo quando o texto bate em mais de uma', () => {
    const r = resolverTarefa('follow up cliente', candidatos);
    expect(r.tipo).toBe('ambiguo');
  });

  it('não encontra quando nada bate', () => {
    expect(resolverTarefa('comprar café', candidatos)).toEqual({ tipo: 'nao_encontrado' });
  });

  it('número fora do intervalo não resolve por ordem', () => {
    expect(resolverTarefa('9', candidatos)).toEqual({ tipo: 'nao_encontrado' });
  });
});
