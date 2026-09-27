import OpenAI from 'openai';
import { Config } from '../config';
import { Deps, Interpretacao } from '../types';

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'criar_tarefa',
      description:
        'Cria uma tarefa para um colaborador da clínica. Use quando o gestor pedir para criar, delegar ou atribuir uma tarefa a alguém.',
      parameters: {
        type: 'object',
        properties: {
          responsavel: {
            type: 'string',
            description:
              'Nome da pessoa responsável, exatamente como citado ou o nome completo se identificável na lista de colaboradores',
          },
          descricao: { type: 'string', description: 'Descrição objetiva da tarefa' },
          prazo: {
            type: 'string',
            description:
              'Prazo no formato YYYY-MM-DD, resolvido a partir da data atual quando relativo (ex: "sexta", "amanhã"). Omitir se não houver prazo.',
          },
          horario: {
            type: 'string',
            description:
              'Horário no formato HH:MM quando mencionado (ex: "às 14h" → "14:00", "meio-dia" → "12:00"). Omitir quando a mensagem não menciona horário.',
          },
        },
        required: ['responsavel', 'descricao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_agenda',
      description:
        'Use quando a pessoa só quer saber o que tem para um dia, sem pedir nenhuma ação (ex: "o que tenho amanhã?", "minha agenda de hoje").',
      parameters: {
        type: 'object',
        properties: {
          data_referencia: {
            type: 'string',
            description:
              'Data no formato YYYY-MM-DD, resolvida a partir da data atual quando relativa ("hoje", "amanhã", "sexta"). Omitir para o dia atual.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'concluir_tarefa',
      description:
        'Use quando a pessoa indica que algo foi terminado ("marca como feito", "já entreguei", "concluí o relatório").',
      parameters: {
        type: 'object',
        properties: {
          titulo_aproximado: {
            type: 'string',
            description: 'Trecho ou título aproximado da tarefa concluída, como a pessoa descreveu',
          },
        },
        required: ['titulo_aproximado'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pedir_esclarecimento',
      description:
        'Use quando a mensagem for ambígua ou incompleta demais para criar uma tarefa (falta responsável, falta o que fazer, etc). A pergunta será enviada de volta pelo WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          pergunta: { type: 'string', description: 'Pergunta curta e direta em português' },
        },
        required: ['pergunta'],
      },
    },
  },
];

export function criarInterpretador(cfg: Config): Deps['interpretar'] {
  const client = new OpenAI({ apiKey: cfg.OPENAI_API_KEY });

  return async (texto, colaboradores, dataAtual): Promise<Interpretacao> => {
    const resposta = await client.chat.completions.create({
      model: cfg.OPENAI_MODEL,
      max_tokens: 1024,
      tools: TOOLS,
      messages: [
        {
          role: 'system',
          content: [
            'Você é o assistente de WhatsApp do ONE, um sistema de gestão de clínicas.',
            'Gestores mandam mensagens em português pedindo para criar tarefas para colaboradores.',
            `Data atual: ${dataAtual}. Resolva prazos relativos ("amanhã", "sexta") para YYYY-MM-DD.`,
            'Extraia também o horário quando mencionado ("às 14h" → 14:00, "meio-dia" → 12:00); sem menção de horário, não preencha o campo horario.',
            `Colaboradores da clínica: ${colaboradores.join(', ')}.`,
            'Se o pedido for claro, chame criar_tarefa. Se faltar informação essencial, chame pedir_esclarecimento.',
            'Se a pessoa só quer saber o que tem para um dia, chame consultar_agenda. Se ela indica que algo foi concluído, chame concluir_tarefa.',
            'Se a mensagem não tiver relação com tarefas, responda brevemente explicando o que você sabe fazer.',
          ].join('\n'),
        },
        { role: 'user', content: texto },
      ],
    });

    const msg = resposta.choices[0]?.message;
    const call = msg?.tool_calls?.find((t) => t.type === 'function');

    if (call?.type === 'function') {
      const args = JSON.parse(call.function.arguments ?? '{}');
      if (call.function.name === 'criar_tarefa') {
        return {
          tipo: 'criar_tarefa',
          responsavel: String(args.responsavel ?? ''),
          descricao: String(args.descricao ?? ''),
          prazo: args.prazo ? String(args.prazo) : undefined,
          horario: args.horario ? String(args.horario) : undefined,
        };
      }
      if (call.function.name === 'pedir_esclarecimento') {
        return { tipo: 'pedir_esclarecimento', pergunta: String(args.pergunta ?? 'Pode detalhar?') };
      }
      if (call.function.name === 'consultar_agenda') {
        return { tipo: 'consultar_agenda', data: args.data_referencia ? String(args.data_referencia) : undefined };
      }
      if (call.function.name === 'concluir_tarefa') {
        return { tipo: 'concluir_tarefa', titulo: String(args.titulo_aproximado ?? '') };
      }
    }

    return { tipo: 'sem_acao', resposta: msg?.content ?? 'Não entendi o pedido.' };
  };
}
