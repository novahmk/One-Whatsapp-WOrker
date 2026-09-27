import { describe, expect, it } from 'vitest';
import { resolverResponsavel } from '../src/core/resolverResponsavel';

const colaboradores = [
  { id: '1', nome_completo: 'Vitor Almeida' },
  { id: '2', nome_completo: 'Vitor Santos' },
  { id: '3', nome_completo: 'Carla Lima' },
  { id: '4', nome_completo: 'João Pereira' },
];

describe('resolverResponsavel', () => {
  it('resolve nome completo exato', () => {
    const r = resolverResponsavel('Carla Lima', colaboradores);
    expect(r).toMatchObject({ tipo: 'unico', colaborador: { id: '3' } });
  });

  it('ignora acentos e caixa', () => {
    const r = resolverResponsavel('joao pereira', colaboradores);
    expect(r).toMatchObject({ tipo: 'unico', colaborador: { id: '4' } });
  });

  it('resolve primeiro nome quando único', () => {
    const r = resolverResponsavel('carla', colaboradores);
    expect(r).toMatchObject({ tipo: 'unico', colaborador: { id: '3' } });
  });

  it('retorna ambíguo quando primeiro nome bate em mais de um', () => {
    const r = resolverResponsavel('Vitor', colaboradores);
    expect(r.tipo).toBe('ambiguo');
    if (r.tipo === 'ambiguo') {
      expect(r.candidatos.map((c) => c.id).sort()).toEqual(['1', '2']);
    }
  });

  it('desambigua com prefixo do sobrenome', () => {
    const r = resolverResponsavel('vitor a', colaboradores);
    expect(r).toMatchObject({ tipo: 'unico', colaborador: { id: '1' } });
  });

  it('não encontra nome inexistente', () => {
    expect(resolverResponsavel('Roberta', colaboradores).tipo).toBe('nao_encontrado');
  });

  it('não encontra alvo vazio', () => {
    expect(resolverResponsavel('  ', colaboradores).tipo).toBe('nao_encontrado');
  });
});
