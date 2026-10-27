import OpenAI from 'openai';
import { Config } from '../config';
import { Deps, Interpretacao } from '../types';
import { MAX_RESPONSAVEIS } from './formatarAtribuicao';
import { TIMEOUT_EXTERNO_MS, comServico } from '../util/externo';

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
          responsaveis: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_RESPONSAVEIS,
            items: { type: 'string' },
            description:
              `Nomes das pessoas responsáveis (de 1 até ${MAX_RESPONSAVEIS}), cada uma exatamente como citada ou o nome completo se identificável na lista de colaboradores. Em "tarefa para a Ana e o Vithor", são duas pessoas.`,
          },
          titulo: { type: 'string', description: 'Título curto e objetivo da tarefa' },
          descricao: {
            type: 'string',
            description: 'Detalhes adicionais da tarefa, quando houver. Omitir se não houver.',
          },
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
          mensagem: {
            type: 'string',
            description:
              'Recado pessoal para os responsáveis, só quando o gestor ditar um explicitamente (ex: "avisa que é urgente"). Omitir caso contrário.',
          },
        },
        required: ['responsaveis', 'titulo'],
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

// O modelo pode devolver array (contrato novo) ou string (modelos antigos / fallback).
function normalizarResponsaveis(args: any): string[] {
  const brutos = Array.isArray(args.responsaveis)
    ? args.responsaveis
    : [args.responsaveis ?? args.responsavel];

  const nomes: string[] = [];
  for (const b of brutos) {
    const nome = String(b ?? '').trim();
    if (nome && !nomes.some((n) => n.toLowerCase() === nome.toLowerCase())) nomes.push(nome);
  }
  return nomes;
}

export function criarInterpretador(cfg: Config): Deps['interpretar'] {  const client = new OpenAI({ apiKey: cfg.OPENAI_API_KEY, timeout: TIMEOUT_EXTERNO_MS });

  return async (texto, colaboradores, dataAtual): Promise<Interpretacao> => {
    const resposta = await comServico('openai', 'interpretar-mensagem', () =>
      client.chat.completions.create({
        model: cfg.OPENAI_MODEL,
        max_tokens: 1024,
        tools: TOOLS,
        messages: [
          {
            role: 'system',
            content: [
              'Você é o assistente de WhatsApp do ONE, um sistema de gestão de empresas. Você só executa ações, não conversa.',
              `Hoje é ${dataAtual}. Converta datas ("amanhã", "sexta", "28 de outubro") para YYYY-MM-DD.`,
              `Pessoas da equipe: ${colaboradores.join(', ')}.`,
              'Para criar uma tarefa, reunião ou compromisso você precisa de 4 dados: pessoa, o que fazer, data e horário.',
              `- responsaveis: lista com os nomes citados (1 a ${MAX_RESPONSAVEIS}). Em "reunião com Bruno", é ["Bruno"]. Em "tarefa pra Ana e Vithor", é ["Ana", "Vithor"].`,
              '- titulo: o que fazer, curto (ex: "Reunião com Bruno").',
              '- prazo: a data. Sem data citada, use a data de hoje.',
              '- horario: HH:MM somente se citado ("às 14h" = 14:00). Sem horário, omita o campo.',
              '- mensagem: só quando o gestor ditar um recado para os responsáveis. Sem recado, omita.',
              'Se tiver pessoa e tarefa, chame criar_tarefa imediatamente. Nunca peça descrição, prioridade ou detalhes extras.',
              'Só chame pedir_esclarecimento se faltar a pessoa ou o que fazer.',
              'Use consultar_agenda somente para perguntas ("o que tenho hoje?"). Use concluir_tarefa quando disserem que terminaram algo.',
            ].join('\n'),
          },
          { role: 'user', content: texto },
        ],
      }),
    );

    const msg = resposta.choices[0]?.message;
    const call = msg?.tool_calls?.find((t) => t.type === 'function');

    if (call?.type === 'function') {
      const args = JSON.parse(call.function.arguments ?? '{}');
      if (call.function.name === 'criar_tarefa') {
        return {
          tipo: 'criar_tarefa',
          responsaveis: normalizarResponsaveis(args),
          titulo: String(args.titulo ?? args.descricao ?? ''),
          descricao: args.descricao ? String(args.descricao) : undefined,
          prazo: args.prazo ? String(args.prazo) : undefined,
          horario: args.horario ? String(args.horario) : undefined,
          mensagem: args.mensagem ? String(args.mensagem) : undefined,
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
