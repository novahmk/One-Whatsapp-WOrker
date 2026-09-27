import Anthropic from '@anthropic-ai/sdk';
import { Config } from '../config';
import { Deps, Interpretacao } from '../types';

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'criar_tarefa',
    description:
      'Cria uma tarefa para um colaborador da clínica. Use quando o gestor pedir para criar, delegar ou atribuir uma tarefa a alguém.',
    input_schema: {
      type: 'object',
      properties: {
        responsavel: {
          type: 'string',
          description: 'Nome da pessoa responsável, exatamente como citado ou o nome completo se identificável na lista de colaboradores',
        },
        descricao: { type: 'string', description: 'Descrição objetiva da tarefa' },
        prazo: {
          type: 'string',
          description: 'Prazo no formato YYYY-MM-DD, resolvido a partir da data atual quando relativo (ex: "sexta", "amanhã"). Omitir se não houver prazo.',
        },
      },
      required: ['responsavel', 'descricao'],
    },
  },
  {
    name: 'pedir_esclarecimento',
    description:
      'Use quando a mensagem for ambígua ou incompleta demais para criar uma tarefa (falta responsável, falta o que fazer, etc). A pergunta será enviada de volta pelo WhatsApp.',
    input_schema: {
      type: 'object',
      properties: {
        pergunta: { type: 'string', description: 'Pergunta curta e direta em português' },
      },
      required: ['pergunta'],
    },
  },
];

export function criarInterpretador(cfg: Config): Deps['interpretar'] {
  const client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });

  return async (texto, colaboradores, dataAtual): Promise<Interpretacao> => {
    const resposta = await client.messages.create({
      model: cfg.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: [
        'Você é o assistente de WhatsApp do ONE, um sistema de gestão de clínicas.',
        'Gestores mandam mensagens em português pedindo para criar tarefas para colaboradores.',
        `Data atual: ${dataAtual}. Resolva prazos relativos ("amanhã", "sexta") para YYYY-MM-DD.`,
        `Colaboradores da clínica: ${colaboradores.join(', ')}.`,
        'Se o pedido for claro, chame criar_tarefa. Se faltar informação essencial, chame pedir_esclarecimento.',
        'Se a mensagem não tiver relação com tarefas, responda brevemente explicando o que você sabe fazer.',
      ].join('\n'),
      tools: TOOLS,
      messages: [{ role: 'user', content: texto }],
    });

    const tool = resposta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (tool?.name === 'criar_tarefa') {
      const input = tool.input as { responsavel: string; descricao: string; prazo?: string };
      return {
        tipo: 'criar_tarefa',
        responsavel: input.responsavel,
        descricao: input.descricao,
        prazo: input.prazo,
      };
    }
    if (tool?.name === 'pedir_esclarecimento') {
      const input = tool.input as { pergunta: string };
      return { tipo: 'pedir_esclarecimento', pergunta: input.pergunta };
    }

    const textoResposta = resposta.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    return { tipo: 'sem_acao', resposta: textoResposta?.text ?? 'Não entendi o pedido.' };
  };
}
