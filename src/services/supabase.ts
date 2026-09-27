import { createClient } from '@supabase/supabase-js';
import { Config } from '../config';
import { Colaborador, ConversaPendente, Deps, LogEntrada, Perfil } from '../types';
import { inicioDoDiaISO } from '../util/tempo';

export function criarDb(cfg: Config): Deps['db'] {
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY);

  return {
    async buscarPerfilPorTelefone(telefone: string): Promise<Perfil | null> {
      const { data, error } = await sb
        .from('profiles')
        .select('id, clinica_id, nome_completo, telefone_whatsapp, whatsapp_verificado, papel')
        .eq('telefone_whatsapp', telefone)
        .eq('whatsapp_verificado', true)
        .maybeSingle();
      if (error) throw error;
      return data as Perfil | null;
    },

    async listarColaboradores(clinicaId: string): Promise<Colaborador[]> {
      const { data, error } = await sb
        .from('profiles')
        .select('id, nome_completo')
        .eq('clinica_id', clinicaId);
      if (error) throw error;
      return (data ?? []) as Colaborador[];
    },

    async buscarConversaPendente(telefone: string): Promise<ConversaPendente | null> {
      // Pendências com mais de 24h são consideradas expiradas.
      const limite = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, error } = await sb
        .from('whatsapp_conversas')
        .select('*')
        .eq('telefone', telefone)
        .eq('status', 'aguardando_resposta')
        .gte('created_at', limite)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ConversaPendente | null;
    },

    async criarConversaPendente(conversa): Promise<void> {
      const { error } = await sb
        .from('whatsapp_conversas')
        .insert({ ...conversa, status: 'aguardando_resposta' });
      if (error) throw error;
    },

    async resolverConversa(id: string): Promise<void> {
      const { error } = await sb
        .from('whatsapp_conversas')
        .update({ status: 'resolvida' })
        .eq('id', id);
      if (error) throw error;
    },

    async registrarLog(entrada: LogEntrada): Promise<void> {
      const { error } = await sb.from('whatsapp_mensagens_log').insert(entrada);
      if (error) throw error;
    },

    async mensagemJaProcessada(messageId: string): Promise<boolean> {
      const { data, error } = await sb
        .from('whatsapp_mensagens_log')
        .select('id')
        .eq('message_id', messageId)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },

    async avisoJaEnviadoHoje(telefone: string): Promise<boolean> {
      const { data, error } = await sb
        .from('whatsapp_mensagens_log')
        .select('id')
        .eq('tipo', 'aviso_diario')
        .eq('telefone', telefone)
        .gte('created_at', inicioDoDiaISO(cfg.TZ_AVISOS))
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  };
}
