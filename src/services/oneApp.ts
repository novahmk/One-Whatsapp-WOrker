import { Config } from '../config';
import { AvisoPessoa, CriarTarefaBody, CriarTarefaResposta, Deps } from '../types';

export function criarOneApp(cfg: Config): Deps['one'] {
  const headers = {
    'Content-Type': 'application/json',
    'x-whatsapp-service-secret': cfg.WHATSAPP_SERVICE_SECRET,
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

    async buscarAvisosDoDia(clinicaId: string): Promise<AvisoPessoa[]> {
      const url = `${cfg.ONE_APP_URL}/api/public/whatsapp/avisos-do-dia?clinica_id=${encodeURIComponent(clinicaId)}`;
      const r = await fetch(url, { headers });
      if (!r.ok) {
        throw new Error(`ONE avisos-do-dia falhou: HTTP ${r.status}`);
      }
      const corpo = (await r.json()) as { avisos?: AvisoPessoa[] };
      return corpo.avisos ?? [];
    },
  };
}
