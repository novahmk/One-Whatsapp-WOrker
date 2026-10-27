// Mensagem de atribuição enviada a cada responsável da tarefa.

export const MAX_RESPONSAVEIS = 5;

/** Junta nomes no padrão "a, b e c". */
export function listarNomes(nomes: string[]): string {
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

export function sufixoPrazo(prazo?: string, horario?: string | null): string {
  const hora = horario ? ` às ${horario}` : '';
  return prazo ? ` (prazo: ${prazo}${hora})` : hora;
}

export interface DadosAtribuicao {
  /** profile_id de quem vai receber esta mensagem. */
  destinatarioId: string;
  responsaveis: Array<{ profile_id: string; nome: string }>;
  titulo: string;
  prazo?: string;
  horario?: string | null;
  autorNome?: string;
  mensagemPersonalizada?: string;
}

/**
 * Monta a mensagem do ponto de vista do destinatário: ele sempre aparece como
 * "você" e encabeça a lista da equipe.
 */
export function montarMensagemAtribuicao(dados: DadosAtribuicao): string {
  const outros = dados.responsaveis
    .filter((r) => r.profile_id !== dados.destinatarioId)
    .map((r) => r.nome);

  const abertura =
    outros.length === 0
      ? 'Foi atribuída uma tarefa para você.'
      : `Foi atribuída uma tarefa para você e equipe: ${listarNomes(['você', ...outros])}.`;

  const linhas = [abertura, '', `📋 *${dados.titulo}*${sufixoPrazo(dados.prazo, dados.horario)}`];

  if (dados.mensagemPersonalizada?.trim()) {
    linhas.push('', `💬 _${dados.mensagemPersonalizada.trim()}_`);
  }
  if (dados.autorNome) {
    linhas.push('', `— enviado por ${dados.autorNome}`);
  }

  return linhas.join('\n');
}

/** Confirmação enviada a quem criou a tarefa. */
export function montarConfirmacaoCriacao(
  nomes: string[],
  titulo: string,
  prazo?: string,
  horario?: string | null,
): string {
  return `✅ Tarefa criada para ${listarNomes(nomes)}: "${titulo}"${sufixoPrazo(prazo, horario)}.`;
}
