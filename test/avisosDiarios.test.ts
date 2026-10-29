import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config';
import { executarAvisos } from '../src/jobs/avisosDiarios';
import { montarMensagemAviso } from '../src/core/notificarAgenda';
import { criarDepsMock, TELEFONE_COLABORADORA } from '../src/services/mock';

const cfg = carregarConfig({ MOCK_EXTERNAL: 'true' });

describe('avisosDiarios', () => {
  it('envia aviso para quem tem tarefas e registra log persistido', async () => {
    const { deps, estado } = criarDepsMock();

    await executarAvisos(deps, cfg, 0);

    expect(estado.enviadas).toHaveLength(1);
    expect(estado.enviadas[0].telefone).toBe(TELEFONE_COLABORADORA);
    expect(estado.enviadas[0].texto).toContain('Enviar relatório mensal');
    expect(estado.enviadas[0].texto).toContain(
      '📱 Veja e gerencie suas tarefas por aqui: https://onedashboard.app/m/tarefas',
    );
    expect(estado.logs.at(-1)).toMatchObject({ tipo: 'aviso_diario', resultado: 'aviso_enviado' });
  });

  it('não reenvia no mesmo dia, mesmo após "reinício" do processo', async () => {
    const { deps, estado } = criarDepsMock();

    await executarAvisos(deps, cfg, 0);
    // Segunda execução simula novo tick/novo processo lendo o mesmo log persistido.
    await executarAvisos(deps, cfg, 0);

    expect(estado.enviadas).toHaveLength(1);
  });

  it('ignora avisos sem nenhuma tarefa', async () => {
    const { deps, estado } = criarDepsMock({
      avisos: [
        {
          profile_id: 'perfil-x',
          telefone: '5511999990009',
          nome: 'Sem Tarefa',
          tarefas_hoje: [],
          tarefas_atrasadas: [],
        },
      ],
    });

    await executarAvisos(deps, cfg, 0);

    expect(estado.enviadas).toHaveLength(0);
  });

  it('montarMensagemAviso monta seções de hoje e atraso', () => {
    const msg = montarMensagemAviso({
      profile_id: 'p1',
      telefone: 'x',
      nome: 'Carla Lima',
      tarefas_hoje: ['Enviar relatório', 'Ligar para paciente'],
      tarefas_atrasadas: ['Atualizar prontuários'],
    });
    expect(msg).toContain('*Bom dia, Carla Lima!*');
    expect(msg).toContain('*Tarefas para hoje:*');
    expect(msg).toContain('• Enviar relatório');
    expect(msg).toContain('• Ligar para paciente');
    expect(msg).toContain('*Tarefas em atraso:*');
    expect(msg).toContain('• Atualizar prontuários');
  });

  it('montarMensagemAviso omite seção vazia', () => {
    const msg = montarMensagemAviso({
      profile_id: 'p1',
      telefone: 'x',
      nome: 'Carla Lima',
      tarefas_hoje: ['Enviar relatório'],
      tarefas_atrasadas: [],
    });
    expect(msg).toContain('*Tarefas para hoje:*');
    expect(msg).not.toContain('Tarefas em atraso');
  });

  it('montarMensagemAviso usa o link_tarefas do aviso', () => {
    const msg = montarMensagemAviso({
      profile_id: 'p1',
      telefone: 'x',
      nome: 'Carla Lima',
      tarefas_hoje: ['Enviar relatório'],
      tarefas_atrasadas: [],
      link_tarefas: 'https://clinica.exemplo.com/m/tarefas',
    });
    expect(msg).toContain(
      '📱 Veja e gerencie suas tarefas por aqui: https://clinica.exemplo.com/m/tarefas',
    );
  });

  it('montarMensagemAviso cai no ONE_APP_URL e depois no padrão quando link_tarefas vem vazio', () => {
    const base = {
      profile_id: 'p1',
      telefone: 'x',
      nome: 'Carla Lima',
      tarefas_hoje: ['Enviar relatório'],
      tarefas_atrasadas: [],
      link_tarefas: '',
    };

    expect(montarMensagemAviso(base, 'https://staging.onedashboard.app/')).toContain(
      'https://staging.onedashboard.app/m/tarefas',
    );
    expect(montarMensagemAviso(base)).toContain('https://onedashboard.app/m/tarefas');
  });

  it('montarMensagemAviso não duplica o link quando a tarefa já traz um', () => {
    const msg = montarMensagemAviso({
      profile_id: 'p1',
      telefone: 'x',
      nome: 'Carla Lima',
      tarefas_hoje: ['Revisar https://onedashboard.app/m/tarefas'],
      tarefas_atrasadas: [],
      link_tarefas: 'https://onedashboard.app/m/tarefas',
    });
    expect(msg.match(/\/m\/tarefas/g)).toHaveLength(1);
    expect(msg).not.toContain('Veja e gerencie suas tarefas por aqui');
  });
});
