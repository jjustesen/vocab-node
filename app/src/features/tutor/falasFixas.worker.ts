import { falasFixas } from '../../../../poc-tutor/src/falasFixas.ts'
import type { Fala } from '../../../../poc-tutor/src/falas.ts'
import type { Roteiro } from '../../../../poc-tutor/src/tipos.ts'

/**
 * As falas fixas de uma lição, fora da tela: `falasFixas` percorre a aula
 * inteira pelo controlador, respondendo de todos os jeitos, e numa lição de 60
 * itens isso leva segundos. Num worker o editor continua respondendo.
 */
const ctx = self as unknown as { onmessage: (e: MessageEvent<Roteiro>) => void; postMessage: (m: unknown) => void }

ctx.onmessage = (e) => {
  const falas: { chave: string; fala: Fala }[] = [...falasFixas(e.data)].map(([chave, fala]) => ({ chave, fala }))
  ctx.postMessage(falas)
}
