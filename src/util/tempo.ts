// Helpers de data/hora no fuso das clínicas (padrão America/Sao_Paulo).

export function dataLocalISO(tz: string, agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(agora);
}

export function minutosLocais(tz: string, agora: Date = new Date()): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(agora);
  const [h, m] = partes.split(':').map(Number);
  return (h % 24) * 60 + m;
}

// Offset fixo -03:00: Brasil não tem horário de verão desde 2019.
export function inicioDoDiaISO(tz: string, agora: Date = new Date()): string {
  return `${dataLocalISO(tz, agora)}T00:00:00-03:00`;
}
