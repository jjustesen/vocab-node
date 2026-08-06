/**
 * Tipos do banco, espelhando supabase/migrations/0001_init.sql.
 *
 * Use `type`, nunca `interface`: o postgrest-js exige que cada Row satisfaça
 * `Record<string, unknown>`, e interfaces não ganham index signature implícita
 * em TypeScript. Com `interface` o cliente inteiro degrada para `never`.
 *
 * Escritos à mão por enquanto. Quando o schema estabilizar, gere com:
 *   npx supabase gen types typescript --project-id <id> > src/types/db.ts
 * e apague este arquivo — não mantenha as duas fontes.
 */

export type PlanoTipo = 'gratuito' | 'pro' | 'ilimitado'
export type AlunoStatus = 'ativo' | 'arquivado'
export type NivelCefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
export type AulaStatus = 'agendada' | 'realizada' | 'cancelada' | 'falta'
export type MaterialTipo = 'pdf' | 'docx' | 'imagem' | 'audio' | 'texto'
export type AtividadeStatus = 'rascunho' | 'publicada' | 'arquivada'
export type PagamentoStatus = 'pendente' | 'pago'
export type QuestaoTipo =
  | 'multipla_escolha'
  | 'lacuna'
  | 'ordenar_palavras'
  | 'ligar_colunas'
  | 'verdadeiro_falso'
  | 'resposta_curta'
  | 'pronuncia'
  | 'ordenar_audio'

export type Professor = {
  id: string
  nome: string
  foto_url: string | null
  plano: PlanoTipo
  criado_em: string
}

/** Espelho do estado no Stripe (migration 0008). Só o webhook escreve. */
export type Assinatura = {
  professor_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plano: PlanoTipo
  status: string
  periodo_fim: string | null
  cancela_no_fim: boolean
  atualizado_em: string
}

export type Aluno = {
  id: string
  professor_id: string
  nome: string
  email: string | null
  telefone: string | null
  nivel_cefr: NivelCefr | null
  valor_mensal: number | null
  dia_semana: number | null
  horario: string | null
  observacoes: string | null
  status: AlunoStatus
  criado_em: string
}

export type ContaAluno = {
  id: string
  aluno_id: string
  professor_id: string
  user_id: string
  email: string
  criado_em: string
  ultimo_login: string | null
}

export type ConviteAluno = {
  id: string
  aluno_id: string
  token_hash: string
  expira_em: string
  usado_em: string | null
  criado_em: string
}

export type EventoAcessoTipo = 'conta_criada' | 'acesso_resetado' | 'email_alterado'

export type EventoAcessoAluno = {
  id: string
  aluno_id: string
  tipo: EventoAcessoTipo
  email_antigo: string | null
  email_novo: string | null
  criado_em: string
}

export type Aula = {
  id: string
  aluno_id: string
  data_hora: string
  duracao_min: number
  status: AulaStatus
  anotacao: string | null
  /**
   * Carimbo das aulas criadas juntas por "repetir semanalmente" (RF-42).
   * Null em aula avulsa. Só dá o vínculo — cada ocorrência segue editável
   * sozinha (ver 0007_aulas_serie.sql).
   */
  serie_id: string | null
  criada_em: string
}

export type Pagamento = {
  id: string
  aluno_id: string
  referencia_mes: string
  valor: number
  status: PagamentoStatus
  pago_em: string | null
}

export type Material = {
  id: string
  professor_id: string
  aluno_id: string | null
  aula_id: string | null
  tipo: MaterialTipo
  nome: string
  storage_path: string | null
  texto: string | null
  criado_em: string
}

export type Atividade = {
  id: string
  professor_id: string
  material_id: string | null
  titulo: string
  nivel: NivelCefr
  habilidades: string[]
  foco: string | null
  status: AtividadeStatus
  origem_ia: boolean
  criada_em: string
}

export type Atribuicao = {
  id: string
  atividade_id: string
  aluno_id: string
  trilha_etapa_id: string | null
  token_hash: string
  tentativa: number
  prazo: string | null
  enviada_em: string
  iniciada_em: string | null
  concluida_em: string | null
  revogada_em: string | null
}

/**
 * Trilhas (PRD §6.9-B). Repare no que NÃO existe aqui: nenhuma coluna de
 * "etapa liberada" ou "etapa atual". Atribuir a trilha cria as atribuições de
 * todas as etapas de uma vez, e a etapa atual é derivada na leitura — a
 * primeira sem `concluida_em`. É isso que torna impossível o aluno ficar
 * travado esperando liberação (RF-132).
 */
export type Trilha = {
  id: string
  professor_id: string
  nome: string
  nivel: NivelCefr
  descricao: string | null
  criada_em: string
}

export type TrilhaEtapa = {
  id: string
  trilha_id: string
  atividade_id: string
  ordem: number
}

export type TrilhaAlunoStatus = 'ativa' | 'pausada' | 'concluida'

export type TrilhaAluno = {
  id: string
  trilha_id: string
  aluno_id: string
  status: TrilhaAlunoStatus
  iniciada_em: string
  concluida_em: string | null
}

export type Par = { esquerda: string; direita: string }

/**
 * Linha de `questoes` no banco. Não confundir com `Questao` de
 * types/questao.ts (o contrato de saída da IA, sem id/atividade_id/ordem,
 * e com opcoes/pares sempre array — nunca null). Aqui refletimos o jsonb tal
 * como o Postgres devolve, que pode vir null.
 */
export type QuestaoRow = {
  id: string
  atividade_id: string
  ordem: number
  tipo: QuestaoTipo
  enunciado: string
  opcoes: string[] | null
  resposta_correta: string
  respostas_aceitas: string[]
  pares: Par[] | null
  explicacao: string
  /** TTS de `ordenar_audio`, gerado ao salvar. Nulo nos demais tipos, ou se a geração falhou. */
  audio_path: string | null
}

export type Resposta = {
  id: string
  atribuicao_id: string
  questao_id: string
  valor: string
  correta: boolean
  /** 0–100, só em `pronuncia`; nos demais tipos `correta` é a única verdade. */
  pontuacao: number | null
  /** Gravação do aluno em `pronuncia`, no bucket `audio-respostas`. */
  audio_path: string | null
  tempo_ms: number | null
  respondida_em: string
}

/** Campos com default no banco viram opcionais no insert. */
type Insert<T, Obrigatorios extends keyof T> = Pick<T, Obrigatorios> &
  Partial<Omit<T, Obrigatorios>>

export type AlunoInsert = Insert<Aluno, 'professor_id' | 'nome'>
export type AlunoUpdate = Partial<Omit<Aluno, 'id' | 'professor_id' | 'criado_em'>>

/**
 * `Relationships` é exigido pelo postgrest-js. Fica vazio porque ainda não
 * usamos select aninhado — quando usar, gere os tipos pela CLI do Supabase.
 */
type Tabela<Row, Ins, Upd> = { Row: Row; Insert: Ins; Update: Upd; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      professores: Tabela<Professor, Insert<Professor, 'id' | 'nome'>, Partial<Professor>>
      alunos: Tabela<Aluno, AlunoInsert, AlunoUpdate>
      contas_aluno: Tabela<
        ContaAluno,
        Insert<ContaAluno, 'aluno_id' | 'professor_id' | 'user_id' | 'email'>,
        Partial<ContaAluno>
      >
      aulas: Tabela<Aula, Insert<Aula, 'aluno_id' | 'data_hora'>, Partial<Aula>>
      pagamentos: Tabela<
        Pagamento,
        Insert<Pagamento, 'aluno_id' | 'referencia_mes' | 'valor'>,
        Partial<Pagamento>
      >
      convites_aluno: Tabela<ConviteAluno, Insert<ConviteAluno, 'aluno_id' | 'token_hash' | 'expira_em'>, Partial<ConviteAluno>>
      eventos_acesso_aluno: Tabela<
        EventoAcessoAluno,
        Insert<EventoAcessoAluno, 'aluno_id' | 'tipo'>,
        Partial<EventoAcessoAluno>
      >
      materiais: Tabela<Material, Insert<Material, 'professor_id' | 'tipo' | 'nome'>, Partial<Material>>
      atividades: Tabela<
        Atividade,
        Insert<Atividade, 'professor_id' | 'titulo' | 'nivel'>,
        Partial<Atividade>
      >
      atribuicoes: Tabela<
        Atribuicao,
        Insert<Atribuicao, 'atividade_id' | 'aluno_id' | 'token_hash'>,
        Partial<Atribuicao>
      >
      questoes: Tabela<
        QuestaoRow,
        Insert<QuestaoRow, 'atividade_id' | 'ordem' | 'tipo' | 'enunciado' | 'resposta_correta' | 'explicacao'>,
        Partial<QuestaoRow>
      >
      respostas: Tabela<
        Resposta,
        Insert<Resposta, 'atribuicao_id' | 'questao_id' | 'valor' | 'correta'>,
        Partial<Resposta>
      >
      trilhas: Tabela<Trilha, Insert<Trilha, 'professor_id' | 'nome' | 'nivel'>, Partial<Trilha>>
      trilha_etapas: Tabela<
        TrilhaEtapa,
        Insert<TrilhaEtapa, 'trilha_id' | 'atividade_id' | 'ordem'>,
        Partial<TrilhaEtapa>
      >
      trilha_alunos: Tabela<
        TrilhaAluno,
        Insert<TrilhaAluno, 'trilha_id' | 'aluno_id'>,
        Partial<TrilhaAluno>
      >
    }
    Views: Record<string, never>
    Functions: {
      /** Desloca uma série de aulas no tempo — ver 0007_aulas_serie.sql. */
      mover_aulas_da_serie: {
        Args: {
          p_serie_id: string
          /** ISO; null = a série toda. */
          p_a_partir_de: string | null
          p_delta_segundos: number
          /** null = mantém a duração de cada aula. */
          p_duracao_min: number | null
        }
        Returns: number
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
