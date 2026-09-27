import { ConversaPendente, Deps, LogEntrada } from '../types';
import { dataLocalISO } from '../util/tempo';

// Estado volátil: sem Supabase, dedupe/pendências/avisos vivem só no processo.
export function criarEstadoMemoria(tz: string): Deps['db'] {
  const processadas = new Set<string>();
  const conversas: ConversaPendente[] = [];
  const avisosEnviados = new Map<string, string>();
  let seq = 0;

  return {
    async buscarConversaPendente(telefone: string): Promise<ConversaPendente | null> {
      const limite = Date.now() - 24 * 3600 * 1000;
      return (
        [...conversas]
          .reverse()
          .find(
            (c) =>
              c.telefone === telefone &&
              c.status === 'aguardando_resposta' &&
              Date.parse(c.created_at) >= limite,
          ) ?? null
      );
    },

    async criarConversaPendente(conversa): Promise<void> {
      conversas.push({
        ...conversa,
        id: `conv-${++seq}`,
        status: 'aguardando_resposta',
        created_at: new Date().toISOString(),
      });
    },

    async resolverConversa(id: string): Promise<void> {
      const c = conversas.find((x) => x.id === id);
      if (c) c.status = 'resolvida';
    },

    async registrarLog(entrada: LogEntrada): Promise<void> {
      if (entrada.message_id) processadas.add(entrada.message_id);
      if (entrada.tipo === 'aviso_diario' && entrada.resultado === 'aviso_enviado') {
        avisosEnviados.set(entrada.telefone, dataLocalISO(tz));
      }
      console.log(JSON.stringify({ whatsapp_log: entrada }));
    },

    async mensagemJaProcessada(messageId: string): Promise<boolean> {
      return processadas.has(messageId);
    },

    async avisoJaEnviadoHoje(telefone: string): Promise<boolean> {
      return avisosEnviados.get(telefone) === dataLocalISO(tz);
    },
  };
}
