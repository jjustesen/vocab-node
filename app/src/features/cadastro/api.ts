import { apiTarefa } from '@/lib/api-tarefa'

export type ConviteObterResposta = { alunoNome: string; professorNome: string }

export function obterConvite(token: string) {
  return apiTarefa.post<ConviteObterResposta>('/convite-obter', { token })
}

export function concluirConvite(token: string, accessToken: string) {
  return apiTarefa.post<{ ok: true; alunoNome: string }>('/convite-concluir', {
    token,
    access_token: accessToken,
  })
}

// ---------------------------------------------------------------------------
// Link de cadastro do PROFESSOR (0019) — uso múltiplo, 24h, sem aluno prévio.
// ---------------------------------------------------------------------------

export type LinkCadastroInfo = { professorNome: string; expiraEm: string; semVagas: boolean }

export function obterLinkDeCadastro(token: string) {
  return apiTarefa.post<LinkCadastroInfo>('/link-cadastro-obter', { token })
}

/**
 * Cria no servidor a conta de auth + `alunos` + `contas_aluno`. Não devolve
 * sessão: quem chama entra em seguida com signInWithPassword no cliente do
 * aluno (ver o cabeçalho de link-cadastro-concluir para o porquê).
 */
export function concluirLinkDeCadastro(token: string, dados: { nome: string; email: string; senha: string }) {
  return apiTarefa.post<{ ok: true; alunoNome: string; email: string }>('/link-cadastro-concluir', {
    token,
    ...dados,
  })
}
