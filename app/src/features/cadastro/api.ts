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
