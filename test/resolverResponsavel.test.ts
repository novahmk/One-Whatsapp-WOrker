import { describe, expect, it } from 'vitest';
import { resolverResponsavel, resolverResponsaveis } from '../src/core/resolverResponsavel';

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

describe('resolverResponsaveis', () => {
  it('resolve vários nomes de uma vez', () => {
    const r = resolverResponsaveis(['Carla', 'joao pereira'], colaboradores);
    expect(r.tipo).toBe('todos');
    if (r.tipo === 'todos') {
      expect(r.colaboradores.map((c) => c.id)).toEqual(['3', '4']);
    }
  });

  it('deduplica quando dois nomes caem na mesma pessoa', () => {
    const r = resolverResponsaveis(['Carla', 'Carla Lima'], colaboradores);
    expect(r.tipo).toBe('todos');
    if (r.tipo === 'todos') {
      expect(r.colaboradores).toHaveLength(1);
    }
  });

  it('para no primeiro ambíguo guardando resolvidos e restantes', () => {
    const r = resolverResponsaveis(['Carla', 'Vitor', 'joao pereira'], colaboradores);
    expect(r.tipo).toBe('ambiguo');
    if (r.tipo === 'ambiguo') {
      expect(r.nome).toBe('Vitor');
      expect(r.resolvidos.map((c) => c.id)).toEqual(['3']);
      expect(r.restantes).toEqual(['joao pereira']);
      expect(r.candidatos.map((c) => c.id).sort()).toEqual(['1', '2']);
    }
  });

  it('reporta qual nome não foi encontrado', () => {
    const r = resolverResponsaveis(['Carla', 'Roberta'], colaboradores);
    expect(r).toMatchObject({ tipo: 'nao_encontrado', nome: 'Roberta' });
  });

  it('lista vazia resolve para nenhum responsável', () => {
    expect(resolverResponsaveis([], colaboradores)).toMatchObject({ tipo: 'todos' });
  });
});
