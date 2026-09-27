import {
  AvisoPessoa,
  Colaborador,
  ConversaPendente,
  CriarTarefaBody,
  Deps,
  Interpretacao,
  LogEntrada,
  Perfil,
} from '../types';
import { normalizar } from '../core/resolverResponsavel';

type PerfilMock = Perfil & { telefone_whatsapp: string; whatsapp_verificado: boolean };

export interface EstadoMock {
  perfis: PerfilMock[];
  conversas: ConversaPendente[];
  logs: (LogEntrada & { created_at: string })[];
  enviadas: { telefone: string; texto: string }[];
  tarefas: CriarTarefaBody[];
  avisos: AvisoPessoa[];
}

export const TELEFONE_GESTORA = '5511999990000';
export const TELEFONE_COLABORADORA = '5511999990003';

function estadoPadrao(): EstadoMock {
  return {
    perfis: [
      {
        id: 'perfil-ana',
        clinica_id: 'clinica-1',
        nome_completo: 'Ana Souza',
        telefone_whatsapp: TELEFONE_GESTORA,
        whatsapp_verificado: true,
        papel: 'gestor',
      },
      {
        id: 'perfil-vitor-a',
        clinica_id: 'clinica-1',
        nome_completo: 'Vitor Almeida',
        telefone_whatsapp: '5511999990001',
        whatsapp_verificado: true,
        papel: 'colaborador',
      },
      {
        id: 'perfil-vitor-s',
        clinica_id: 'clinica-1',
        nome_completo: 'Vitor Santos',
        telefone_whatsapp: '5511999990002',
        whatsapp_verificado: true,
        papel: 'colaborador',
      },
      {
        id: 'perfil-carla',
        clinica_id: 'clinica-1',
        nome_completo: 'Carla Lima',
        telefone_whatsapp: TELEFONE_COLABORADORA,
        whatsapp_verificado: true,
        papel: 'colaborador',
      },
    ],
    conversas: [],
    logs: [],
    enviadas: [],
    tarefas: [],
    avisos: [
      {
        profile_id: 'perfil-carla',
        telefone: TELEFONE_COLABORADORA,
        nome: 'Carla Lima',
        tarefas_hoje: ['Enviar relatório mensal'],
        tarefas_atrasadas: ['Atualizar prontuários (26/09)'],
      },
    ],
  };
}

// Interpretador determinístico: acha um colaborador citado no texto (nome completo ou primeiro nome).
function interpretarMock(
  texto: string,
  colaboradores: string[],
): Interpretacao {
  const t = normalizar(texto);

  const nomeCompleto = colaboradores.find((n) => t.includes(normalizar(n)));
  if (nomeCompleto) {
    return { tipo: 'criar_tarefa', responsavel: nomeCompleto, descricao: texto };
  }

  const primeiroNome = colaboradores
    .map((n) => normalizar(n).split(/\s+/)[0])
    .find((p) => new RegExp(`\\b${p}\\b`).test(t));
  if (primeiroNome) {
    return { tipo: 'criar_tarefa', responsavel: primeiroNome, descricao: texto };
  }

  return {
    tipo: 'pedir_esclarecimento',
    pergunta: 'Não entendi. Para quem é a tarefa e o que deve ser feito?',
  };
}

export function criarDepsMock(parcial: Partial<EstadoMock> = {}): {
  deps: Deps;
  estado: EstadoMock;
} {
  const estado: EstadoMock = { ...estadoPadrao(), ...parcial };
  let seq = 0;

  const deps: Deps = {
    db: {
      async buscarConversaPendente(telefone) {
        return (
          [...estado.conversas]
            .reverse()
            .find((c) => c.telefone === telefone && c.status === 'aguardando_resposta') ?? null
        );
      },
      async criarConversaPendente(conversa) {
        estado.conversas.push({
          ...conversa,
          id: `conv-${++seq}`,
          status: 'aguardando_resposta',
          created_at: new Date().toISOString(),
        });
      },
      async resolverConversa(id) {
        const c = estado.conversas.find((x) => x.id === id);
        if (c) c.status = 'resolvida';
      },
      async registrarLog(entrada) {
        estado.logs.push({ ...entrada, created_at: new Date().toISOString() });
        console.log('[MOCK log]', entrada.resultado, entrada.telefone);
      },
      async mensagemJaProcessada(messageId) {
        return estado.logs.some((l) => l.message_id === messageId);
      },
      async avisoJaEnviadoHoje(telefone) {
        const hoje = new Date().toISOString().slice(0, 10);
        return estado.logs.some(
          (l) =>
            l.tipo === 'aviso_diario' &&
            l.telefone === telefone &&
            l.created_at.startsWith(hoje),
        );
      },
    },
    whats: {
      async enviarMensagem(telefone, texto) {
        estado.enviadas.push({ telefone, texto });
        console.log(`[MOCK wasender] → ${telefone}: ${texto}`);
      },
      async baixarMidia() {
        return Buffer.from('audio-fake');
      },
    },
    async transcrever() {
      return 'Criar uma tarefa para a Carla Lima organizar os prontuários até sexta-feira';
    },
    async interpretar(texto, colaboradores) {
      return interpretarMock(texto, colaboradores);
    },
    one: {
      async criarTarefa(body) {
        estado.tarefas.push(body);
        const responsavel = estado.perfis.find(
          (p) => p.nome_completo === body.responsavel_nome,
        );
        return {
          sucesso: true,
          tarefa_id: `mock-tarefa-${estado.tarefas.length}`,
          responsavel_profile_id: responsavel?.id,
        };
      },
      async buscarAvisosDoDia(filtro) {
        if (filtro?.profileId) {
          return estado.avisos.filter((a) => a.profile_id === filtro.profileId);
        }
        return estado.avisos;
      },
      async buscarPerfil(telefone) {
        const encontrado =
          estado.perfis.find(
            (p) => p.telefone_whatsapp === telefone && p.whatsapp_verificado,
          ) ?? null;
        if (!encontrado) return { perfil: null, colaboradores: [] };
        const { telefone_whatsapp, whatsapp_verificado, ...perfil } = encontrado;
        const colaboradores: Colaborador[] = estado.perfis
          .filter((p) => p.clinica_id === perfil.clinica_id)
          .map(({ id, nome_completo }) => ({ id, nome_completo }));
        return { perfil, colaboradores };
      },
    },
  };

  return { deps, estado };
}
