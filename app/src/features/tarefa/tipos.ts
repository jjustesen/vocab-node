import type { NivelCefr, QuestaoTipo, Par } from '@/types/db'

/**
 * Duas formas de identificar a tentativa perante as Edge Functions
 * tarefa-obter/responder/concluir — ver supabase/functions/_shared/atribuicao.ts:
 *  - `{ token }` — link anônimo (RF-20), o modo original.
 *  - `{ atribuicao_id, access_token }` — aluno logado, acessando pelo painel (RF-28).
 */
export type IdentificadorTarefa = { token: string } | { atribuicao_id: string; access_token: string }

/**
 * O gabarito completo vem já na primeira chamada — resposta_correta,
 * respostas_aceitas, pares e explicacao presentes mesmo antes de o aluno
 * responder. Decisão de produto de 26/07/2026 (velocidade sobre
 * anti-cola): ver docs/CONTRATO-QUESTOES.md §7.
 */
export type QuestaoTarefa = {
  id: string
  ordem: number
  tipo: QuestaoTipo
  enunciado: string
  opcoes: string[] | null
  pares: Par[] | null
  resposta_correta: string
  respostas_aceitas: string[]
  explicacao: string
  /** URL assinada (1h) do TTS de `ordenar_audio`. Nulo nos outros tipos, ou se a geração falhou ao salvar. */
  audio_url: string | null
  respondida: boolean
  resposta_dada: string | null
  correta: boolean | null
}

export type TarefaObterResposta = {
  atividade: { titulo: string; nivel: NivelCefr }
  professor_nome: string
  aluno_nome: string
  prazo: string | null
  concluida: boolean
  questoes: QuestaoTarefa[]
}

/**
 * O que a UI mostra ao aluno — calculado no cliente, não vem mais do servidor.
 * Com uma exceção: em `pronuncia` os três últimos campos vêm de
 * `tarefa-pronuncia`, porque a nota depende de uma chamada à IA.
 */
export type FeedbackLocal = {
  correta: boolean
  resposta_correta: string
  pares_corretos: Par[] | null
  explicacao: string
  /** 0–100, só em `pronuncia`. */
  pontuacao?: number
  /** O que a IA ouviu de verdade — pode divergir da frase-alvo. */
  transcricao?: string
  tentativasRestantes?: number
}

/** Resposta de `tarefa-pronuncia`. */
export type PronunciaResposta = {
  ok: boolean
  correta: boolean
  pontuacao: number
  transcricao: string
  comentario: string
  tentativas_restantes: number
}

/**
 * RF-139. Só vem preenchido quando a tarefa é etapa de uma trilha e há uma
 * etapa seguinte pendente. Abrir depende de sessão (a rota é por
 * `atribuicao_id`), então o botão só aparece para aluno logado.
 */
export type ProximaEtapa = {
  atribuicao_id: string
  titulo: string
  ordem: number
  total_etapas: number
  trilha_nome: string
  etapas_concluidas: number
  total_questoes: number
}

export type ConcluirResposta = {
  acertos: number
  total: number
  tempo_total_ms: number | null
  proxima_etapa: ProximaEtapa | null
}
