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

  console.log('JID cru recebido:', JSON.stringify(msg.key.remoteJid));

  const remoteJid = String(msg.key.remoteJid ?? '');
  const jidSemDominio = remoteJid.split('@')[0];
  const jidSemDispositivo = jidSemDominio.split(':')[0];
  const telefone = jidSemDispositivo.replace(/\D/g, '');
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

    const corpo = req.body as any;
    const bruto = corpo?.data?.messages;
    const brutoMsg = Array.isArray(bruto) ? bruto[0] : bruto;
    const remoteJid = String(brutoMsg?.key?.remoteJid ?? '');
    if (remoteJid.endsWith('@lid')) {
      console.log('JID cru recebido:', JSON.stringify(brutoMsg?.key?.remoteJid));
      const destino = remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');
      const conteudo = brutoMsg?.message ?? {};
      const texto: string | undefined =
        conteudo.conversation ?? conteudo.extendedTextMessage?.text ?? undefined;
      const tipo = conteudo.audioMessage ? 'audio' : 'texto';

      try {
        await deps.whats.enviarMensagem(
          destino,
          'Recebi sua mensagem, mas o WhatsApp enviou um identificador privado (LID) e ainda não consegui mapear seu número no ONE. Peça ao gestor para confirmar seu vínculo no painel e tente novamente em alguns minutos.',
        );
      } catch (e) {
        req.log.error(e, 'falha ao enviar retorno para remetente LID');
      }

      await deps.db.registrarLog({
        message_id: String(brutoMsg?.key?.id ?? ''),
        telefone: destino || 'lid_desconhecido',
        tipo,
        texto_original: texto,
        resultado: 'remetente_lid_nao_suportado',
      });

      req.log.warn({ remoteJid }, 'remetente em formato LID');
      return { received: true };
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
