import { createContext, useContext } from 'react'

/**
 * A lição da biblioteca abre só para leitura. Isto NÃO é um `<fieldset
 * disabled>` em volta do editor: ele desligaria também os botões de abrir os
 * blocos e os de ouvir — e ler e ouvir é justamente o que se faz numa lição
 * que não se pode editar. Os campos leem daqui e ficam só para leitura.
 */
export const SomenteLeitura = createContext(false)

export function useSomenteLeitura(): boolean {
  return useContext(SomenteLeitura)
}
