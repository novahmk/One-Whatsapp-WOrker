import { Config } from '../config';
import { Deps } from '../types';

const BASE_URL = 'https://www.wasenderapi.com/api';

export function criarWasender(cfg: Config): Deps['whats'] {
  return {
    async enviarMensagem(telefone: string, texto: string): Promise<void> {
      // Número comum vai só com dígitos; @lid precisa do JID inteiro.
      const to = telefone.endsWith('@s.whatsapp.net') ? telefone.split('@')[0] : telefone;
      const r = await fetch(`${BASE_URL}/send-message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.WASENDER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, text: texto }),
      });
      if (!r.ok) {
        throw new Error(`WaSenderAPI falhou ao enviar (${r.status}): ${await r.text()}`);
      }
    },

    async baixarMidia(url: string): Promise<Buffer> {
      const r = await fetch(url);
      if (!r.ok) {
        throw new Error(`Falha ao baixar mídia (${r.status}): ${url}`);
      }
      return Buffer.from(await r.arrayBuffer());
    },
  };
}
