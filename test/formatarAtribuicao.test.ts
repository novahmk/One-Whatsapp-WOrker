import { describe, expect, it } from 'vitest';
import {
  listarNomes,
  montarConfirmacaoCriacao,
  montarMensagemAtribuicao,
  sufixoPrazo,
} from '../src/services/formatarAtribuicao';

const EQUIPE = [
  { profile_id: 'p-carla', nome: 'Carla Lima' },
  { profile_id: 'p-ana', nome: 'Ana Souza' },
  { profile_id: 'p-vitor', nome: 'Vitor Almeida' },
];

describe('listarNomes', () => {
  it('monta listas no padrão "a, b e c"', () => {
    expect(listarNomes([])).toBe('');
    expect(listarNomes(['Ana'])).toBe('Ana');
    expect(listarNomes(['Ana', 'Vitor'])).toBe('Ana e Vitor');
    expect(listarNomes(['você', 'Ana', 'Vitor'])).toBe('você, Ana e Vitor');
  });
});

describe('sufixoPrazo', () => {
  it('omite tudo quando não há prazo nem horário', () => {
    expect(sufixoPrazo()).toBe('');
  });

  it('mostra só o horário quando não há prazo', () => {
    expect(sufixoPrazo(undefined, '14:00')).toBe(' às 14:00');
  });

  it('junta prazo e horário', () => {
    expect(sufixoPrazo('2026-10-02', '14:00')).toBe(' (prazo: 2026-10-02 às 14:00)');
  });
});

describe('montarMensagemAtribuicao', () => {
  it('tarefa com 1 pessoa fala só "para você"', () => {
    const texto = montarMensagemAtribuicao({
      destinatarioId: 'p-carla',
      responsaveis: [EQUIPE[0]],
      titulo: 'Organizar prontuários',
    });

    expect(texto).toContain('Foi atribuída uma tarefa para você.');
    expect(texto).not.toContain('equipe');
    expect(texto).toContain('Organizar prontuários');
  });

  it('tarefa com 2 pessoas lista "você e Fulano"', () => {
    const texto = montarMensagemAtribuicao({
      destinatarioId: 'p-carla',
      responsaveis: [EQUIPE[0], EQUIPE[2]],
      titulo: 'Organizar prontuários',
    });

    expect(texto).toContain('para você e equipe: você e Vitor Almeida.');
  });

  it('tarefa com 3 pessoas lista todos com o destinatário como "você"', () => {
    const texto = montarMensagemAtribuicao({
      destinatarioId: 'p-carla',
      responsaveis: EQUIPE,
      titulo: 'Organizar prontuários',
    });

    expect(texto).toContain('para você e equipe: você, Ana Souza e Vitor Almeida.');
    expect(texto).not.toContain('Carla Lima');
  });

  it('cada destinatário vê a própria perspectiva', () => {
    const paraAna = montarMensagemAtribuicao({
      destinatarioId: 'p-ana',
      responsaveis: EQUIPE,
      titulo: 'Organizar prontuários',
    });

    expect(paraAna).toContain('você, Carla Lima e Vitor Almeida.');
    expect(paraAna).not.toContain('Ana Souza');
  });

  it('inclui prazo, recado personalizado e autor quando existem', () => {
    const texto = montarMensagemAtribuicao({
      destinatarioId: 'p-carla',
      responsaveis: [EQUIPE[0]],
      titulo: 'Organizar prontuários',
      prazo: '2026-10-02',
      horario: '14:00',
      autorNome: 'Ana Souza',
      mensagemPersonalizada: '  Favor priorizar  ',
    });

    expect(texto).toContain('(prazo: 2026-10-02 às 14:00)');
    expect(texto).toContain('💬 _Favor priorizar_');
    expect(texto).toContain('— enviado por Ana Souza');
  });

  it('ignora recado vazio ou só com espaços', () => {
    const texto = montarMensagemAtribuicao({
      destinatarioId: 'p-carla',
      responsaveis: [EQUIPE[0]],
      titulo: 'Organizar prontuários',
      mensagemPersonalizada: '   ',
    });

    expect(texto).not.toContain('💬');
  });
});

describe('montarConfirmacaoCriacao', () => {
  it('confirma um responsável', () => {
    expect(montarConfirmacaoCriacao(['Carla Lima'], 'Organizar prontuários')).toBe(
      '✅ Tarefa criada para Carla Lima: "Organizar prontuários".',
    );
  });

  it('confirma vários responsáveis com prazo', () => {
    expect(
      montarConfirmacaoCriacao(
        ['Carla Lima', 'Ana Souza', 'Vitor Almeida'],
        'Organizar prontuários',
        '2026-10-02',
      ),
    ).toBe(
      '✅ Tarefa criada para Carla Lima, Ana Souza e Vitor Almeida: "Organizar prontuários" (prazo: 2026-10-02).',
    );
  });
});
