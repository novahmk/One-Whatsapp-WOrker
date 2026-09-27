import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config';
import { dentroDaJanela, executarAvisos, montarMensagemAviso } from '../src/jobs/avisosDiarios';
import { criarDepsMock, TELEFONE_COLABORADORA } from '../src/services/mock';

const cfg = carregarConfig({ MOCK_EXTERNAL: 'true' });

// 08:05 em São Paulo (-03:00) = 11:05 UTC
const AGORA_NA_JANELA = new Date('2026-09-28T11:05:00Z');
const AGORA_FORA = new Date('2026-09-28T14:00:00Z');

describe('avisosDiarios', () => {
  it('dentroDaJanela respeita a janela de 15 minutos no fuso da clínica', () => {
    expect(dentroDaJanela('08:00', AGORA_NA_JANELA, cfg.TZ_AVISOS)).toBe(true);
    expect(dentroDaJanela('08:00', AGORA_FORA, cfg.TZ_AVISOS)).toBe(false);
    expect(dentroDaJanela('11:00', AGORA_FORA, cfg.TZ_AVISOS)).toBe(true);
  });

  it('envia aviso para quem tem tarefas e registra log persistido', async () => {
    const { deps, estado } = criarDepsMock();

    await executarAvisos(deps, cfg, AGORA_NA_JANELA, 0);

    expect(estado.enviadas).toHaveLength(1);
    expect(estado.enviadas[0].telefone).toBe(TELEFONE_COLABORADORA);
    expect(estado.enviadas[0].texto).toContain('Enviar relatório mensal');
    expect(estado.logs.at(-1)).toMatchObject({ tipo: 'aviso_diario', resultado: 'aviso_enviado' });
  });

  it('não reenvia no mesmo dia, mesmo após "reinício" do processo', async () => {
    const { deps, estado } = criarDepsMock();

    await executarAvisos(deps, cfg, AGORA_NA_JANELA, 0);
    // Segunda execução simula novo tick/novo processo lendo o mesmo log persistido.
    await executarAvisos(deps, cfg, AGORA_NA_JANELA, 0);

    expect(estado.enviadas).toHaveLength(1);
  });

  it('fora da janela da clínica não envia nada', async () => {
    const { deps, estado } = criarDepsMock();

    await executarAvisos(deps, cfg, AGORA_FORA, 0);

    expect(estado.enviadas).toHaveLength(0);
  });

  it('montarMensagemAviso lista as tarefas com prazo', () => {
    const msg = montarMensagemAviso({
      telefone: 'x',
      nome: 'Carla Lima',
      tarefas: [
        { descricao: 'Enviar relatório', prazo: '2026-09-26' },
        { descricao: 'Ligar para paciente' },
      ],
    });
    expect(msg).toContain('Bom dia, Carla Lima');
    expect(msg).toContain('• Enviar relatório (prazo: 2026-09-26)');
    expect(msg).toContain('• Ligar para paciente');
  });
});
