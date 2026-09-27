// Helpers de data/hora no fuso das clínicas (padrão America/Sao_Paulo).

export function dataLocalISO(tz: string, agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(agora);
}

// Offset fixo -03:00: Brasil não tem horário de verão desde 2019.
export function inicioDoDiaISO(tz: string, agora: Date = new Date()): string {
  return `${dataLocalISO(tz, agora)}T00:00:00-03:00`;
}
