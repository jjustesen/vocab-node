import { useState } from 'react'

/** Como uma lista do professor pode ser ordenada. */
export type Ordem = 'nome' | 'nome-desc' | 'recentes' | 'antigos'

export const ROTULO_ORDEM: Record<Ordem, string> = {
  nome: 'Nome (A–Z)',
  'nome-desc': 'Nome (Z–A)',
  recentes: 'Mais recentes',
  antigos: 'Mais antigos',
}

/**
 * Comparação "natural": `numeric` põe "Lesson 2" antes de "Lesson 11" — a
 * ordem que o professor espera num acervo cheio de "Adults 1 - Lesson N", e
 * que a comparação de texto pura quebra ("11" < "2"). `sensitivity: 'base'`
 * ignora maiúscula e acento, então "Área" não vai para o fim da lista.
 */
const COLADOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/**
 * Ordena uma cópia da lista. `nome` e `data` dizem de onde tirar cada chave —
 * cada tabela chama os campos de um jeito (`criado_em`, `criada_em`, `titulo`).
 * Empate no nome cai para a data, e vice-versa, para a ordem nunca "pular"
 * entre duas renderizações.
 */
export function ordenar<T>(
  itens: readonly T[],
  ordem: Ordem,
  { nome, data }: { nome: (item: T) => string; data: (item: T) => string },
): T[] {
  const porNome = (a: T, b: T) => COLADOR.compare(nome(a), nome(b))
  const porData = (a: T, b: T) => data(a).localeCompare(data(b))
  return [...itens].sort((a, b) => {
    switch (ordem) {
      case 'nome':
        return porNome(a, b) || porData(b, a)
      case 'nome-desc':
        return porNome(b, a) || porData(b, a)
      case 'recentes':
        return porData(b, a) || porNome(a, b)
      case 'antigos':
        return porData(a, b) || porNome(a, b)
    }
  })
}

/**
 * A ordem escolhida numa lista, lembrada neste navegador: quem prefere ver o
 * acervo por data não quer reescolher toda vez que abre a página. Preferência
 * de tela, e não dado — se o armazenamento falhar, vale o padrão.
 */
export function useOrdem(lista: string, padrao: Ordem) {
  const chave = `ordem:${lista}`
  const [ordem, setOrdem] = useState<Ordem>(() => {
    try {
      const salva = localStorage.getItem(chave)
      return salva && salva in ROTULO_ORDEM ? (salva as Ordem) : padrao
    } catch {
      return padrao
    }
  })

  function mudar(nova: Ordem) {
    setOrdem(nova)
    try {
      localStorage.setItem(chave, nova)
    } catch {
      // Sem armazenamento (aba anônima, bloqueio): a escolha vale até sair.
    }
  }

  return [ordem, mudar] as const
}
