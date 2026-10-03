import type { RespostaDoAvaliador } from '../src/turno.ts'

const URL_FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poc-tutor`
const CHAVE_CODIGO = 'poc-tutor:codigo'

/**
 * A senha da POC — a secret POC_TUTOR_CODIGO da função, que NUNCA está no
 * código: a pessoa digita na tela de entrada, a função confere, e a página só
 * a lembra neste navegador para não pedir de novo a cada recarga.
 */
export function codigoDeAcesso(): string | undefined {
  try {
    return localStorage.getItem(CHAVE_CODIGO) ?? undefined
  } catch {
    return undefined
  }
}

export function esquecerSenha() {
  try {
    localStorage.removeItem(CHAVE_CODIGO)
  } catch {
    /* nada a esquecer */
  }
}

/** Confere a senha na função; só guarda se estiver certa. */
export async function entrarComSenha(senha: string): Promise<boolean> {
  const resposta = await fetch(URL_FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'verificar', codigo: senha }),
  })
  if (resposta.status === 403) return false
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status}.`)
  try {
    localStorage.setItem(CHAVE_CODIGO, senha)
  } catch {
    /* sem armazenamento: vale até recarregar */
  }
  return true
}

export async function avaliarNoServidor(corpo: {
  audio?: { base64: string; mimeType: string }
  texto?: string
  contexto: unknown
}): Promise<RespostaDoAvaliador> {
  const resposta = await fetch(URL_FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...corpo, acao: 'avaliar', codigo: codigoDeAcesso() }),
  })
  const json = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    const erro = (json as { erro?: string }).erro
    if (resposta.status === 401) throw new Error('A função foi publicada sem --no-verify-jwt (veja o README).')
    if (resposta.status === 404) throw new Error('A função poc-tutor ainda não foi publicada no Supabase.')
    if (resposta.status === 403) {
      // A senha mudou desde a última vez: volta para a tela de senha.
      esquecerSenha()
      location.reload()
    }
    throw new Error(erro ?? `O servidor respondeu ${resposta.status}.`)
  }
  return json as RespostaDoAvaliador
}
