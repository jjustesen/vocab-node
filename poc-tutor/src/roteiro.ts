import { readFileSync } from 'node:fs'
import type { Roteiro } from './tipos.ts'
import { validarRoteiro } from './validacao.ts'

export { validarRoteiro }

/**
 * A lição da POC (especificação §2).
 *
 * Carregar do disco é coisa de Node (testes, scripts). A página importa o JSON
 * direto e chama `validarRoteiro`, que fica em validacao.ts justamente para não
 * arrastar `node:fs` para o navegador.
 */
export const ROTEIRO_PADRAO = new URL('../roteiro/licao-clima.json', import.meta.url)

export function carregarRoteiro(caminho: URL | string = ROTEIRO_PADRAO): Roteiro {
  const roteiro = JSON.parse(readFileSync(caminho, 'utf8')) as Roteiro
  const problemas = validarRoteiro(roteiro)
  if (problemas.length > 0) throw new Error(`Roteiro inválido:\n- ${problemas.join('\n- ')}`)
  return roteiro
}
