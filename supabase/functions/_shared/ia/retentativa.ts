import { ErroIA } from './tipos.ts'

/**
 * Backoff exponencial com jitter. Sem o jitter, várias gerações que caíram no
 * mesmo 503 voltam todas no mesmo milissegundo e derrubam de novo.
 * Tentativa 1 → ~1s, 2 → ~3s, 3 → ~7s (teto de 10s).
 */
const BASE_MS = 1_000
const TETO_MS = 10_000

export async function esperarBackoff(tentativa: number): Promise<void> {
  const alvo = Math.min(BASE_MS * (2 ** tentativa - 1), TETO_MS)
  const jitter = alvo * (0.5 + Math.random() * 0.5) // entre 50% e 100% do alvo
  await new Promise((r) => setTimeout(r, jitter))
}

/**
 * Só vale repetir o que pode dar certo sozinho: sobrecarga (429/5xx), timeout
 * e queda de rede. 400/401/403 é payload ou chave errada — repetir três vezes
 * só atrasa o erro que o professor vai ver de qualquer jeito.
 */
export function classificarHttp(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

export function ehRetentavel(e: unknown): boolean {
  if (e instanceof ErroIA) return e.retentavel
  return true // rede/abort/bug transitório: dá uma segunda chance
}

/** Mensagem por status, para o professor — nunca o corpo cru do fornecedor. */
export function mensagemPorStatus(status: number): string {
  if (status === 429) return 'A IA atingiu o limite de uso no momento. Tente novamente em alguns minutos.'
  if (status >= 500) return 'A IA está sobrecarregada no momento. Tente novamente em instantes.'
  if (status === 401 || status === 403) return 'Não consegui autenticar com a IA. Avise o suporte.'
  if (status === 413) return 'O material enviado é grande demais para a IA. Envie um arquivo menor.'
  return 'Não consegui gerar a atividade agora. Tente novamente em instantes.'
}
