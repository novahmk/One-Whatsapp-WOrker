import { FastifyInstance } from 'fastify';
import { Config } from '../config';
import { Deps, MensagemRecebida } from '../types';
import { processarMensagem } from '../core/processarMensagem';
import { segredoValido } from '../util/auth';

export { segredoValido };

// Normaliza o payload estilo Baileys do WaSenderAPI para o formato interno.
export function extrairMensagem(payload: unknown): MensagemRecebida | null {
  const corpo = payload as any;
  const bruto = corpo?.data?.messages;
  const msg = Array.isArray(bruto) ? bruto[0] : bruto;
  if (!msg?.key || msg.key.fromMe) return null;

  const telefone = String(msg.key.remoteJid ?? '').split('@')[0];
  if (!telefone) return null;

  const conteudo = msg.message ?? {};
  const texto: string | undefined =
    conteudo.conversation ?? conteudo.extendedTextMessage?.text ?? undefined;
  const audio = conteudo.audioMessage;
  const audioUrl: string | undefined = audio?.url ?? undefined;
  if (!texto && !audioUrl) return null;

  return {
    messageId: String(msg.key.id ?? ''),
    telefone,
    texto,
    audioUrl,
    audioMimetype: audio?.mimetype ?? undefined,
  };
}

export function registrarWebhook(app: FastifyInstance, deps: Deps, cfg: Config): void {
  app.post('/webhooks/whatsapp', async (req, reply) => {
    const assinatura = req.headers['x-webhook-signature'];
    if (!segredoValido(assinatura, cfg.WASENDER_WEBHOOK_SECRET)) {
      return reply.code(401).send({ erro: 'assinatura inválida' });
    }

    const msg = extrairMensagem(req.body);
    if (msg) {
      try {
        await processarMensagem(msg, deps, cfg);
      } catch (e) {
        // Sempre responde 200 para o WaSenderAPI não reenviar o webhook.
        req.log.error(e, 'falha ao processar mensagem');
      }
    }

    return { received: true };
  });
}
