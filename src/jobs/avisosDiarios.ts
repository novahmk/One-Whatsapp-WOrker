import cron from 'node-cron';
import { Config } from '../config';
import { AvisoPessoa, Deps } from '../types';
import { minutosLocais } from '../util/tempo';

const JANELA_MINUTOS = 15;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function dentroDaJanela(horario: string, agora: Date, tz: string): boolean {
  const [h, m] = horario.split(':').map(Number);
  const alvo = h * 60 + m;
  const atual = minutosLocais(tz, agora);
  return atual >= alvo && atual < alvo + JANELA_MINUTOS;
}

export function montarMensagemAviso(aviso: AvisoPessoa): string {
  const linhas = aviso.tarefas.map(
    (t) => `• ${t.descricao}${t.prazo ? ` (prazo: ${t.prazo})` : ''}`,
  );
  return [`Bom dia, ${aviso.nome}! Você tem tarefas pendentes ou atrasadas hoje:`, ...linhas].join(
    '\n',
  );
}

export async function executarAvisos(
  deps: Deps,
  cfg: Config,
  agora: Date = new Date(),
  intervaloEnvioMs = 1500,
): Promise<void> {
  const clinicas = await deps.db.listarClinicasComAviso();

  for (const clinica of clinicas) {
    const horario = clinica.horario_aviso_whatsapp ?? cfg.AVISO_HORARIO_PADRAO;
    if (!dentroDaJanela(horario, agora, cfg.TZ_AVISOS)) continue;

    let avisos: AvisoPessoa[];
    try {
      avisos = await deps.one.buscarAvisosDoDia(clinica.id);
    } catch (e) {
      console.error(`Falha ao buscar avisos da clínica ${clinica.id}:`, e);
      continue;
    }

    for (const aviso of avisos) {
      if (aviso.tarefas.length === 0) continue;
      if (await deps.db.avisoJaEnviadoHoje(clinica.id, aviso.telefone)) continue;

      try {
        await deps.whats.enviarMensagem(aviso.telefone, montarMensagemAviso(aviso));
        await deps.db.registrarLog({
          telefone: aviso.telefone,
          clinica_id: clinica.id,
          tipo: 'aviso_diario',
          resultado: 'aviso_enviado',
        });
      } catch (e) {
        console.error(`Falha ao enviar aviso para ${aviso.telefone}:`, e);
      }

      // Espaçamento anti-rajada: número não-oficial enviando conteúdo repetido é padrão de banimento.
      if (intervaloEnvioMs > 0) {
        await delay(intervaloEnvioMs + Math.random() * 500);
      }
    }
  }
}

export function iniciarJobAvisos(deps: Deps, cfg: Config): void {
  cron.schedule('*/15 * * * *', () => void executarAvisos(deps, cfg), {
    timezone: cfg.TZ_AVISOS,
  });
}
