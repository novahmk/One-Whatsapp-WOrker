export interface Colaborador {
  id: string;
  nome_completo: string;
}

export interface Perfil extends Colaborador {
  clinica_id: string;
  papel: string;
}

export interface PerfilResposta {
  perfil: Perfil | null;
  colaboradores: Colaborador[];
  erro?: string;
}

export interface MensagemRecebida {
  messageId: string;
  telefone: string;
  texto?: string;
  audioUrl?: string;
  audioMimetype?: string;
  bruta?: unknown;
}

export type Interpretacao =
  | {
      tipo: 'criar_tarefa';
      responsaveis: string[];
      titulo: string;
      descricao?: string;
      prazo?: string;
      horario?: string;
      mensagem?: string;
    }
  | { tipo: 'consultar_agenda'; data?: string }
  | { tipo: 'concluir_tarefa'; titulo: string }
  | { tipo: 'pedir_esclarecimento'; pergunta: string }
  | { tipo: 'sem_acao'; resposta: string };

export interface TarefaRef {
  id: string;
  titulo: string;
}

export type ContextoPendente =
  | {
      tipo: 'responsavel';
      titulo: string;
      descricao?: string;
      prazo?: string;
      horario?: string;
      mensagem?: string;
      /** Responsáveis já definidos nas rodadas anteriores. */
      resolvidos: Colaborador[];
      /** Nomes ainda não resolvidos; o primeiro é o que está sendo perguntado. */
      pendentes: string[];
      /** Candidatos do nome que está sendo perguntado. */
      candidatos: Colaborador[];
    }
  | { tipo: 'concluir'; profile_id: string; candidatos: TarefaRef[] };

export interface ConversaPendente {
  id: string;
  telefone: string;
  clinica_id: string;
  profile_id: string;
  pergunta: string;
  contexto: ContextoPendente;
  status: 'aguardando_resposta' | 'resolvida';
  created_at: string;
}

export type ResultadoLog =
  | 'tarefa_criada'
  | 'agenda_consultada'
  | 'tarefa_concluida'
  | 'tarefa_nao_encontrada'
  | 'esclarecimento_solicitado'
  | 'esclarecimento_repetido'
  | 'nao_autorizado'
  | 'nao_reconhecido'
  | 'erro_perfil'
  | 'responsavel_nao_encontrado'
  | 'limite_responsaveis'
  | 'sem_acao'
  | 'aviso_enviado'
  | 'erro';

export interface LogEntrada {
  message_id?: string;
  telefone: string;
  profile_id?: string;
  clinica_id?: string;
  tipo: 'texto' | 'audio' | 'aviso_diario';
  texto_original?: string;
  transcricao?: string;
  interpretacao?: unknown;
  resultado: ResultadoLog;
  tarefa_id?: string;
}

export interface CriarTarefaBody {
  clinica_id: string;
  criado_por_profile_id: string;
  /** Mantido para compatibilidade: nome do primeiro responsável. */
  responsavel_nome: string;
  /** Mantido para compatibilidade: profile_id do primeiro responsável. */
  responsavel_id?: string;
  /** Contrato novo: profile_id de todos os responsáveis (até MAX_RESPONSAVEIS). */
  responsaveis: string[];
  responsaveis_nomes: string[];
  titulo: string;
  descricao?: string;
  prazo?: string;
  horario?: string | null;
  mensagem_personalizada?: string;
}

export interface CriarTarefaResposta {
  sucesso: boolean;
  tarefa_id?: string;
  responsavel_profile_id?: string;
  erro?: string;
}

export interface ConcluirTarefaBody {
  profile_id: string;
  titulo_aproximado?: string;
  tarefa_id?: string;
}

export interface ConcluirTarefaResposta {
  sucesso: boolean;
  titulo?: string;
  ambiguo?: boolean;
  candidatos?: TarefaRef[];
  erro?: string;
}

export interface AvisoPessoa {
  profile_id: string;
  telefone: string;
  nome: string;
  tarefas_hoje: string[];
  tarefas_atrasadas: string[];
}

export interface FiltroAvisos {
  profileId?: string;
  data?: string;
}

export interface AgendaItem {
  titulo: string;
  horario?: string | null;
  concluida?: boolean;
}

export interface AgendaResposta {
  data: string;
  itens: AgendaItem[];
}

export interface Deps {
  db: {
    buscarConversaPendente(telefone: string): Promise<ConversaPendente | null>;
    criarConversaPendente(
      conversa: Omit<ConversaPendente, 'id' | 'status' | 'created_at'>,
    ): Promise<void>;
    resolverConversa(id: string): Promise<void>;
    registrarLog(entrada: LogEntrada): Promise<void>;
    mensagemJaProcessada(messageId: string): Promise<boolean>;
    avisoJaEnviadoHoje(telefone: string): Promise<boolean>;
  };
  whats: {
    enviarMensagem(telefone: string, texto: string): Promise<void>;
    baixarAudio(mensagemBruta: unknown): Promise<Buffer>;
  };
  transcrever(audio: Buffer, mimetype?: string): Promise<string>;
  interpretar(texto: string, colaboradores: string[], dataAtual: string): Promise<Interpretacao>;
  one: {
    criarTarefa(body: CriarTarefaBody): Promise<CriarTarefaResposta>;
    concluirTarefa(body: ConcluirTarefaBody): Promise<ConcluirTarefaResposta>;
    buscarAgenda(profileId: string, data?: string): Promise<AgendaResposta>;
    buscarAvisosDoDia(filtro?: FiltroAvisos): Promise<AvisoPessoa[]>;
    buscarPerfil(telefone: string): Promise<PerfilResposta>;
  };
}
