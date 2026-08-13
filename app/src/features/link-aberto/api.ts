import { apiTarefa } from '@/lib/api-tarefa'
import type { NivelCefr } from '@/types/db'

export type LinkAbertoInfo = {
  atividadeTitulo: string
  nivel: NivelCefr
  questoes: number
  professorNome: string
  cadastroAberto: boolean
  cadastroExpiraEm: string
  /** Presente quando a chamada levou um access_token válido de aluno. */
  sessao: { email: string; alunoNome: string | null; vinculada: boolean } | null
}

export function obterLinkAberto(token: string, accessToken?: string) {
  return apiTarefa.post<LinkAbertoInfo>('/link-aberto-obter', {
    token,
    access_token: accessToken,
  })
}

export type LinkAbertoEntrada = { atribuicaoId: string; alunoNome: string; contaCriada: boolean }

/**
 * Sessão de aluno válida em mãos (signUp recém-feito ou login) → vincula ao
 * professor se preciso (só dentro das 12h) e devolve a atribuição para
 * navegar direto a /painel/tarefa/:atribuicaoId.
 */
export function entrarPeloLinkAberto(token: string, accessToken: string, nome?: string) {
  return apiTarefa.post<LinkAbertoEntrada>('/link-aberto-entrar', {
    token,
    access_token: accessToken,
    nome,
  })
}
