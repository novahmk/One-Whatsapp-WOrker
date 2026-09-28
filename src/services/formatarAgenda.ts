type Item = { titulo: string; horario_sugerido?: string | null; concluida?: boolean };

export function formatarAgenda(itens: Item[], data: Date): string {
  const dia = data.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
  });
  if (!itens.length) return `📅 *Sua agenda de hoje*\n_${dia}_\n\nNada agendado. Dia livre 🙌`;

  const pendentes = itens.filter((i) => !i.concluida);
  const comHora = pendentes
    .filter((i) => i.horario_sugerido)
    .sort((a, b) => a.horario_sugerido!.localeCompare(b.horario_sugerido!));
  const semHora = pendentes.filter((i) => !i.horario_sugerido);

  const linhas = [`📅 *Sua agenda de hoje*`, `_${dia}_`, ''];
  comHora.forEach((i) => linhas.push(`*${i.horario_sugerido!.slice(0, 5)}* · ${i.titulo}`));
  if (semHora.length) {
    if (comHora.length) linhas.push('');
    linhas.push('*Sem horário*');
    semHora.forEach((i) => linhas.push(`• ${i.titulo}`));
  }
  linhas.push('', `✅ ${comHora.length} com horário · ${semHora.length} sem horário`);
  return linhas.join('\n');
}
