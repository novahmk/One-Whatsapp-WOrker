import { AvisoPessoa, Deps } from '../types';

export function montarMensagemAviso(aviso: AvisoPessoa): string {
  let texto = `*Bom dia, ${aviso.nome}!* 📋\n\n`;

  if (aviso.tarefas_hoje.length > 0) {
    texto += `*Tarefas para hoje:*\n`;
    for (const t of aviso.tarefas_hoje) texto += `• ${t}\n`;
  }

  if (aviso.tarefas_atrasadas.length > 0) {
    texto += `\n⚠️ *Tarefas em atraso:*\n`;
    for (const t of aviso.tarefas_atrasadas) texto += `• ${t}\n`;
  }

  return texto.trimEnd();
}

// Busca a agenda da pessoa (mesma fonte do avisos-do-dia) e envia via WhatsApp.
export async function notificarAgenda(
  deps: Deps,
  profileId: string,
  dataReferencia?: string,
  opts: { dedupe?: boolean } = {},
): Promise<void> {
  const avisos = await deps.one.buscarAvisosDoDia({ profileId, data: dataReferencia });
  const aviso = avisos.find((a) => a.profile_id === profileId);
  if (!aviso) return;
  if (aviso.tarefas_hoje.length === 0 && aviso.tarefas_atrasadas.length === 0) return;
  if (opts.dedupe && (await deps.db.avisoJaEnviadoHoje(aviso.telefone))) return;

  await deps.whats.enviarMensagem(aviso.telefone, montarMensagemAviso(aviso));
  await deps.db.registrarLog({
    telefone: aviso.telefone,
    profile_id: aviso.profile_id,
    tipo: 'aviso_diario',
    resultado: 'aviso_enviado',
  });
}
