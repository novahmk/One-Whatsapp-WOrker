import { Config } from '../config';
import { Deps } from '../types';
import { ErroServicoExterno, fetchExterno } from '../util/externo';

const BASE_URL = 'https://www.wasenderapi.com/api';

export function criarWasender(cfg: Config): Deps['whats'] {
  return {
    async enviarMensagem(telefone: string, texto: string): Promise<void> {
      // Número comum vai só com dígitos; @lid precisa do JID inteiro.
      const to = telefone.endsWith('@s.whatsapp.net') ? telefone.split('@')[0] : telefone;
      const r = await fetchExterno('wasender', 'enviar-mensagem', `${BASE_URL}/send-message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.WASENDER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, text: texto }),
      });
      if (!r.ok) {
        throw new ErroServicoExterno(
          'wasender',
          'enviar-mensagem',
          new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`),
        );
      }
    },

    // WaSender criptografa a mídia; é preciso pedir a URL decifrada antes de baixar.
    async baixarAudio(mensagemBruta: unknown): Promise<Buffer> {
      const r = await fetchExterno('wasender', 'decrypt-media', `${BASE_URL}/decrypt-media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.WASENDER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { messages: mensagemBruta } }),
      });
      if (!r.ok) {
        throw new ErroServicoExterno(
          'wasender',
          'decrypt-media',
          new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`),
        );
      }
      const j: any = await r.json();
      const url = j.publicUrl ?? j.url;
      const audio = await fetchExterno('wasender', 'baixar-midia', url);
      if (!audio.ok) {
        throw new ErroServicoExterno('wasender', 'baixar-midia', new Error(`HTTP ${audio.status}`));
      }
      return Buffer.from(await audio.arrayBuffer());
    },
  };
}
