// Helpers de data/hora no fuso das clínicas (padrão America/Sao_Paulo).

export function dataLocalISO(tz: string, agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(agora);
}
