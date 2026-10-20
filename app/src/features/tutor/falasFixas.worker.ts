import { falasFixasComItens } from '../../../../poc-tutor/src/falasFixas.ts'
import type { Roteiro } from '../../../../poc-tutor/src/tipos.ts'
import type { FalaFixa } from './audiosDaLicao'

/**
 * As falas fixas de uma lição, fora da tela: `falasFixasComItens` percorre a
 * aula inteira pelo controlador, respondendo de todos os jeitos, e numa lição
 * de 60 itens isso leva segundos. Num worker o editor continua respondendo.
 */
const ctx = self as unknown as { onmessage: (e: MessageEvent<Roteiro>) => void; postMessage: (m: unknown) => void }

ctx.onmessage = (e) => {
  const falas: FalaFixa[] = [...falasFixasComItens(e.data)].map(([chave, { fala, itens }]) => ({
    chave,
    fala,
    itens: [...itens],
  }))
  ctx.postMessage(falas)
}
