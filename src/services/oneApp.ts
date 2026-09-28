import { Config } from '../config';
import {
  AgendaResposta,
  AvisoPessoa,
  Colaborador,
  ConcluirTarefaBody,
  ConcluirTarefaResposta,
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
        return { sucesso: false, erro: `ONE respondeu HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
      }
      return (await r.json()) as CriarTarefaResposta;
    },

    async concluirTarefa(body: ConcluirTarefaBody): Promise<ConcluirTarefaResposta> {
      const r = await fetch(`${cfg.ONE_APP_URL}/api/public/whatsapp/comandos/concluir-tarefa`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        return { sucesso: false, erro: `ONE respondeu HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
      }
      return (await r.json()) as ConcluirTarefaResposta;
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
        throw new Error(`ONE avisos-do-dia falhou: HTTP ${r.status} ${await r.text()}`);
      }
      const corpo = (await r.json()) as { avisos?: AvisoPessoa[] };
      return corpo.avisos ?? [];
    },

    async buscarAgenda(profileId: string, data?: string): Promise<AgendaResposta> {
      const query = new URLSearchParams({ profile_id: profileId });
      if (data) query.set('data', data);
      const r = await fetch(
        `${cfg.ONE_APP_URL}/api/public/whatsapp/comandos/agenda?${query}`,
        { headers },
      );
      if (!r.ok) {
        throw new Error(`ONE agenda falhou: HTTP ${r.status} ${await r.text()}`);
      }
      const corpo = (await r.json()) as { data?: string; itens?: AgendaResposta['itens'] };
      return { data: corpo.data ?? (data ?? ''), itens: corpo.itens ?? [] };
    },

    async buscarPerfil(telefone: string): Promise<PerfilResposta> {
      const [usuario, servidor] = telefone.split('@');
      const params = new URLSearchParams({ jid: telefone });
      if (servidor === 's.whatsapp.net') params.set('telefone', usuario);
      const url = `${cfg.ONE_APP_URL}/api/public/whatsapp/perfil?${params}`;
      let r: Response;
      try {
        r = await fetch(url, { headers });
      } catch (e) {
        console.error('ONE perfil: falha de rede', e);
        return { perfil: null, colaboradores: [], erro: 'rede' };
      }
      // 404 = telefone não cadastrado; tratamos como "não reconhecido", não como erro.
      if (r.status === 404) {
        return { perfil: null, colaboradores: [] };
      }
      if (!r.ok) {
        console.error(`ONE perfil falhou: HTTP ${r.status}`);
        return { perfil: null, colaboradores: [], erro: `HTTP ${r.status}` };
      }
      let corpo: any;
      try {
        corpo = await r.json();
      } catch (e) {
        console.error('ONE perfil: resposta não-JSON', e);
        return { perfil: null, colaboradores: [], erro: 'json' };
      }
      const p = corpo.perfil;
      const perfil = p
        ? {
            id: p.profile_id ?? p.id,
            nome_completo: p.nome ?? p.nome_completo,
            clinica_id: p.clinica_id,
            papel: p.papel ?? p.role,
          }
        : null;
      const colaboradores = (corpo.colaboradores ?? []).map((c: any) => ({
        id: c.profile_id ?? c.id,
        nome_completo: c.nome ?? c.nome_completo,
      }));
      return { perfil, colaboradores };
    },
  };
}
