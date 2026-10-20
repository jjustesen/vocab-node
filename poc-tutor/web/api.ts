import type { RespostaDoAvaliador } from '../src/turno.ts'
import { chamar, conexao, lembrarSenha, URL_DO_LABORATORIO } from './conexao.ts'

export { codigoDeAcesso, esquecerSenha } from './conexao.ts'

/**
 * A função respondeu com erro. `recusa` = ela disse NÃO (tutor desligado,
 * sessão expirada, limite do mês): a mensagem dela é o que o aluno precisa
 * ler. O resto (rede, 5xx) é falha passageira.
 */
export class ErroDoTutor extends Error {
  readonly status: number
  constructor(mensagem: string, status: number) {
    super(mensagem)
    this.status = status
  }
  get recusa(): boolean {
    return this.status === 403 || this.status === 410 || this.status === 429
  }
}

/** Confere a senha na função do laboratório; só guarda se estiver certa. */
export async function entrarComSenha(senha: string): Promise<boolean> {
  const resposta = await fetch(URL_DO_LABORATORIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'verificar', codigo: senha }),
  })
  if (resposta.status === 403) return false
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status}.`)
  lembrarSenha(senha)
  return true
}

export async function avaliarNoServidor(corpo: {
  audio?: { base64: string; mimeType: string }
  texto?: string
  contexto: unknown
  /** O item do roteiro em andamento: o app confere que ele existe na lição. */
  itemId?: string
}): Promise<RespostaDoAvaliador> {
  const resposta = await chamar({ ...corpo, acao: 'avaliar' })
  const json = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    const erro = (json as { erro?: string }).erro
    conexao().aoRecusar?.(resposta.status)
    if (resposta.status === 401) throw new ErroDoTutor(erro ?? 'A função foi publicada sem --no-verify-jwt (veja o README).', 401)
    if (resposta.status === 404 && !erro) throw new ErroDoTutor('A função do tutor ainda não foi publicada no Supabase.', 404)
    throw new ErroDoTutor(erro ?? `O servidor respondeu ${resposta.status}.`, resposta.status)
  }
  return json as RespostaDoAvaliador
}
