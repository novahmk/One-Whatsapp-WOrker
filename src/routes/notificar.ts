import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Config } from '../config';
import { Deps } from '../types';
import { extrairBearer, segredoValido } from '../util/auth';
import { MAX_RESPONSAVEIS, montarMensagemAtribuicao } from '../services/formatarAtribuicao';

const responsavelSchema = z.object({
  profile_id: z.string().min(1),
  nome: z.string().min(1),
});

const bodySchema = z.object({
  telefone: z.string().min(1),
  tipo: z.literal('tarefa_atribuida'),
  dados: z
    .object({
      titulo: z.string().min(1),
      data_vencimento: z.string().min(1),
      horario_sugerido: z.string().nullish(),
      criado_por_nome: z.string().min(1),
      // Multi-responsáveis: o ONE chama a rota uma vez por destinatário.
      destinatario_id: z.string().min(1).optional(),
      responsaveis: z.array(responsavelSchema).min(1).max(MAX_RESPONSAVEIS).optional(),
      mensagem_personalizada: z.string().optional(),
    })
    .refine((d) => !d.responsaveis || Boolean(d.destinatario_id), {
      message: 'destinatario_id é obrigatório quando responsaveis é informado',
      path: ['destinatario_id'],
    }),
});

export type NotificacaoBody = z.infer<typeof bodySchema>;

export function formatarNotificacao(body: NotificacaoBody): string {
  const { dados } = body;

  if (dados.responsaveis?.length) {
    return montarMensagemAtribuicao({
      destinatarioId: dados.destinatario_id!,
      responsaveis: dados.responsaveis,
      titulo: dados.titulo,
      prazo: dados.data_vencimento,
      horario: dados.horario_sugerido,
      autorNome: dados.criado_por_nome,
      mensagemPersonalizada: dados.mensagem_personalizada,
    });
  }

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
