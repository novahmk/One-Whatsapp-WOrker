import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Config } from '../config';
import { Deps } from '../types';
import { extrairBearer, segredoValido } from '../util/auth';

const bodySchema = z.object({
  telefone: z.string().min(1),
  nome: z.string().min(1),
  codigo: z.string().min(1),
});

export function registrarVerificacao(app: FastifyInstance, deps: Deps, cfg: Config): void {
  app.post('/verificacao', async (req, reply) => {
    const token = extrairBearer(req.headers.authorization);
    if (!segredoValido(token, cfg.WHATSAPP_SERVICE_SECRET)) {
      return reply.code(401).send({ erro: 'Não autorizado' });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: 'Body inválido: telefone, nome e codigo são obrigatórios' });
    }

    const { telefone, nome, codigo } = parsed.data;
    const mensagem = `Olá, ${nome}! Seu código de verificação no One Dashboard é: *${codigo}*`;

    try {
      await deps.whats.enviarMensagem(telefone, mensagem);
      return { sucesso: true };
    } catch (e) {
      req.log.error(e, 'falha ao enviar código de verificação');
      return reply.code(500).send({ erro: 'Falha no envio da mensagem' });
    }
  });
}
