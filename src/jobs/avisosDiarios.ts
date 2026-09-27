import cron from 'node-cron';
import { Config } from '../config';
import { AvisoPessoa, Deps } from '../types';
import { notificarAgenda } from '../core/notificarAgenda';
import { dataLocalISO } from '../util/tempo';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function executarAvisos(
  deps: Deps,
  cfg: Config,
  intervaloEnvioMs = 1500,
): Promise<void> {
  let avisos: AvisoPessoa[];
  try {
    avisos = await deps.one.buscarAvisosDoDia();
  } catch (e) {
    console.error('Falha ao buscar avisos do dia:', e);
    return;
  }

  const dia = dataLocalISO(cfg.TZ_AVISOS);

  for (const aviso of avisos) {
    if (aviso.tarefas_hoje.length === 0 && aviso.tarefas_atrasadas.length === 0) continue;

    try {
      await notificarAgenda(deps, aviso.profile_id, dia, { dedupe: true });
    } catch (e) {
      console.error(`Falha ao enviar aviso para ${aviso.telefone}:`, e);
    }

    // Espaçamento anti-rajada: número não-oficial enviando conteúdo repetido é padrão de banimento.
    if (intervaloEnvioMs > 0) {
      await delay(intervaloEnvioMs + Math.random() * 500);
    }
  }
}

export function iniciarJobAvisos(deps: Deps, cfg: Config): void {
  cron.schedule('*/15 * * * *', () => void executarAvisos(deps, cfg), {
    timezone: cfg.TZ_AVISOS,
  });
}
