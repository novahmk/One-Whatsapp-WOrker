import { Config } from '../config';
import {
  AvisoPessoa,
  Colaborador,
  CriarTarefaBody,
  CriarTarefaResposta,
  Deps,
  FiltroAvisos,
  Perfil,
  PerfilResposta,
} from '../types';

export function criarOneApp(cfg: Config): Deps['one'] {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.WHATSAPP_SERVICE_SECRET}`,
  };

  return {
    async criarTarefa(body: CriarTarefaBody): Promise<CriarTarefaResposta> {
      const r = await fetch(`${cfg.ONE_APP_URL}/api/public/whatsapp/comandos/criar-tarefa`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        return { sucesso: false, erro: `ONE respondeu HTTP ${r.status}` };
      }
      return (await r.json()) as CriarTarefaResposta;
    },

    async buscarAvisosDoDia(filtro?: FiltroAvisos): Promise<AvisoPessoa[]> {
      const query = new URLSearchParams();
      if (filtro?.profileId) query.set('profile_id', filtro.profileId);
      if (filtro?.data) query.set('data', filtro.data);
      const sufixo = query.size > 0 ? `?${query}` : '';
      const r = await fetch(`${cfg.ONE_APP_URL}/api/public/whatsapp/avisos-do-dia${sufixo}`, {
        headers,
      });
      if (!r.ok) {
        throw new Error(`ONE avisos-do-dia falhou: HTTP ${r.status}`);
      }
      const corpo = (await r.json()) as { avisos?: AvisoPessoa[] };
      return corpo.avisos ?? [];
    },

    async buscarPerfil(telefone: string): Promise<PerfilResposta> {
      const url = `${cfg.ONE_APP_URL}/api/public/whatsapp/perfil?telefone=${encodeURIComponent(telefone)}`;
      const r = await fetch(url, { headers });
      if (!r.ok) {
        throw new Error(`ONE perfil falhou: HTTP ${r.status}`);
      }
      const corpo = (await r.json()) as {
        perfil?: Perfil | null;
        colaboradores?: Colaborador[];
      };
      return { perfil: corpo.perfil ?? null, colaboradores: corpo.colaboradores ?? [] };
    },
  };
}
