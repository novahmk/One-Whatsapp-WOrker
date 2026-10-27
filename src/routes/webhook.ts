import { FastifyInstance } from 'fastify';
import { Config } from '../config';
import { Deps, MensagemRecebida } from '../types';
import { processarMensagem } from '../core/processarMensagem';
import { segredoValido } from '../util/auth';
import { resumirErro } from '../util/externo';

export { segredoValido };

// Normaliza o payload estilo Baileys do WaSenderAPI para o formato interno.
export function extrairMensagem(payload: unknown): MensagemRecebida | null {
  const corpo = payload as any;
  const bruto = corpo?.data?.messages;
  const msg = Array.isArray(bruto) ? bruto[0] : bruto;
  if (!msg?.key || msg.key.fromMe) return null;

  console.log('JID cru recebido:', JSON.stringify(msg.key.remoteJid));

  const jidBruto = String(msg.key.remoteJid ?? '');
  if (!jidBruto || jidBruto.endsWith('@g.us')) return null;
  const [usuario, servidor] = jidBruto.split('@');
  if (!usuario || !servidor) return null;
  const telefone = `${usuario.split(':')[0]}@${servidor}`; // JID completo, sem :device

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
    bruta: msg,
  };
}

export function registrarWebhook(app: FastifyInstance, deps: Deps, cfg: Config): void {
  // O WaSender entrega o mesmo evento várias vezes ao mesmo tempo; processa cada mensagem uma vez só.
  const emAndamento = new Set<string>();

  app.post('/webhooks/whatsapp', async (req, reply) => {
    const assinatura = req.headers['x-webhook-signature'];
    if (!segredoValido(assinatura, cfg.WASENDER_WEBHOOK_SECRET)) {
      return reply.code(401).send({ erro: 'assinatura inválida' });
    }

    const msg = extrairMensagem(req.body);
    if (msg && msg.messageId && emAndamento.has(msg.messageId)) {
      return { received: true, duplicada: true };
    }
    if (msg) {
      if (msg.messageId) emAndamento.add(msg.messageId);
      try {
        await processarMensagem(msg, deps, cfg);
      } catch (e) {
        // Sempre responde 200 para o WaSenderAPI não reenviar o webhook.
        const tipo = msg.audioUrl ? 'audio' : 'texto';
        const erro = resumirErro(e, [
          cfg.WASENDER_API_KEY,
          cfg.WASENDER_WEBHOOK_SECRET,
          cfg.WHATSAPP_SERVICE_SECRET,
          cfg.OPENAI_API_KEY,
        ]);
        req.log.error(
          {
            jid: msg.telefone,
            tipo,
            messageId: msg.messageId,
            servico: erro.servico,
            etapa: erro.etapa,
            erro_nome: erro.nome,
            erro_mensagem: erro.mensagem,
            erro_causa: erro.causa,
            erro_stack: erro.stack,
          },
          `falha ao processar mensagem [${erro.servico}${erro.etapa ? `/${erro.etapa}` : ''}]: ${erro.nome}: ${erro.mensagem}`,
        );
      } finally {
        if (msg.messageId) setTimeout(() => emAndamento.delete(msg.messageId), 10 * 60_000).unref();
      }
    }

    return { received: true };
  });
}
