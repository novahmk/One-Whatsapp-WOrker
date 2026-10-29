import { AvisoPessoa, Deps } from '../types';

const LINK_TAREFAS_PADRAO = 'https://onedashboard.app/m/tarefas';
const LINK_TAREFAS_NO_TEXTO = /https?:\/\/\S*\/m\/tarefas/i;

export function resolverLinkTarefas(aviso: AvisoPessoa, baseUrl?: string): string {
  const doAviso = aviso.link_tarefas?.trim();
  if (doAviso) return doAviso;
  const base = baseUrl?.trim().replace(/\/+$/, '');
  return base ? `${base}/m/tarefas` : LINK_TAREFAS_PADRAO;
}

export function montarMensagemAviso(aviso: AvisoPessoa, baseUrl?: string): string {
  let texto = `*Bom dia, ${aviso.nome}!* 📋\n\n`;

  if (aviso.tarefas_hoje.length > 0) {
    texto += `*Tarefas para hoje:*\n`;
    for (const t of aviso.tarefas_hoje) texto += `• ${t}\n`;
  }

  if (aviso.tarefas_atrasadas.length > 0) {
    texto += `\n⚠️ *Tarefas em atraso:*\n`;
    for (const t of aviso.tarefas_atrasadas) texto += `• ${t}\n`;
  }

  const corpo = texto.trimEnd();
  if (LINK_TAREFAS_NO_TEXTO.test(corpo)) return corpo;

  return `${corpo}\n\n📱 Veja e gerencie suas tarefas por aqui: ${resolverLinkTarefas(aviso, baseUrl)}`;
}

// Busca a agenda da pessoa (mesma fonte do avisos-do-dia) e envia via WhatsApp.
export async function notificarAgenda(
  deps: Deps,
  profileId: string,
  dataReferencia?: string,
  opts: { dedupe?: boolean; baseUrl?: string } = {},
): Promise<void> {
  const avisos = await deps.one.buscarAvisosDoDia({ profileId, data: dataReferencia });
  const aviso = avisos.find((a) => a.profile_id === profileId);
  if (!aviso) return;
  if (aviso.tarefas_hoje.length === 0 && aviso.tarefas_atrasadas.length === 0) return;
  if (opts.dedupe && (await deps.db.avisoJaEnviadoHoje(aviso.telefone))) return;

  await deps.whats.enviarMensagem(aviso.telefone, montarMensagemAviso(aviso, opts.baseUrl));
  await deps.db.registrarLog({
    telefone: aviso.telefone,
    profile_id: aviso.profile_id,
    tipo: 'aviso_diario',
    resultado: 'aviso_enviado',
  });
}
