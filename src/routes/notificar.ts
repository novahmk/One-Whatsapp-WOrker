import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Config } from '../config';
import { Deps } from '../types';
import { extrairBearer, segredoValido } from '../util/auth';

const bodySchema = z.object({
  telefone: z.string().min(1),
  tipo: z.literal('tarefa_atribuida'),
  dados: z.object({
    titulo: z.string().min(1),
    data_vencimento: z.string().min(1),
    horario_sugerido: z.string().nullish(),
    criado_por_nome: z.string().min(1),
  }),
});

export type NotificacaoBody = z.infer<typeof bodySchema>;

export function formatarNotificacao(body: NotificacaoBody): string {
  const { dados } = body;
  const horario = dados.horario_sugerido ? ` às ${dados.horario_sugerido}` : '';
  return `Você tem uma nova tarefa: ${dados.titulo}, para ${dados.data_vencimento}${horario}. Criada por ${dados.criado_por_nome}.`;
}

export function registrarNotificar(app: FastifyInstance, deps: Deps, cfg: Config): void {
  app.post('/notificar', async (req, reply) => {
    const token = extrairBearer(req.headers.authorization);
    if (!segredoValido(token, cfg.WHATSAPP_SERVICE_SECRET)) {
      return reply.code(401).send({ erro: 'Não autorizado' });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ erro: 'Body inválido: telefone, tipo e dados são obrigatórios' });
    }

    try {
      await deps.whats.enviarMensagem(parsed.data.telefone, formatarNotificacao(parsed.data));
      return { sucesso: true };
    } catch (e) {
      req.log.error(e, 'falha ao enviar notificação');
      return reply.code(500).send({ erro: 'Falha no envio da mensagem' });
    }
  });
}
