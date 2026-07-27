/**
 * Espelha a normalização/correção de app/src/types/questao.ts.
 * Duplicado de propósito: Deno (Edge Functions) não compartilha módulos com o
 * projeto Vite sem um pacote comum, e a regra é pequena o bastante para não
 * valer a complexidade de um workspace. Se mudar aqui, mude lá também.
 */

export type Par = { esquerda: string; direita: string }

export function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
}

/**
 * `valorDado` para ligar_colunas é um JSON de string[] com a "direita" que o
 * aluno escolheu para cada item de `pares`, na MESMA ORDEM em que o servidor
 * enviou `pares` (a coluna esquerda nunca muda de ordem; só a direita é
 * embaralhada na tela — ver CONTRATO-QUESTOES.md §3).
 */
/**
 * Corte de nota de fala para contar como acerto. Espelha CORTE_PRONUNCIA em
 * app/src/types/questao.ts — se mudar lá, muda aqui.
 */
export const CORTE_PRONUNCIA = 70

export function corretaPorPontuacao(pontuacao: number): boolean {
  return pontuacao >= CORTE_PRONUNCIA
}

export function corrigir(
  tipo: string,
  respostaCorreta: string,
  respostasAceitas: string[],
  valorDado: string,
  pares?: Par[] | null,
): boolean {
  // `pronuncia` não se corrige por comparação de texto — a nota vem da IA em
  // `tarefa-pronuncia`, que grava a resposta por conta própria. Se chegou aqui,
  // alguém mandou uma resposta de fala pela rota de texto.
  if (tipo === 'pronuncia') {
    throw new Error('pronuncia é pontuada em tarefa-pronuncia, não por comparação de texto')
  }

  if (tipo === 'multipla_escolha' || tipo === 'verdadeiro_falso') {
    return valorDado === respostaCorreta
  }

  // `ordenar_audio` usa a mesma regra de `ordenar_palavras`: comparação da
  // frase montada, normalizada (as fichas distratoras simplesmente sobram).

  if (tipo === 'ligar_colunas') {
    if (!pares || pares.length === 0) return false
    let escolhas: unknown
    try {
      escolhas = JSON.parse(valorDado)
    } catch {
      return false
    }
    if (!Array.isArray(escolhas) || escolhas.length !== pares.length) return false
    return pares.every((par, i) => normalizar(String(escolhas[i] ?? '')) === normalizar(par.direita))
  }

  const alvo = normalizar(valorDado)
  return [respostaCorreta, ...respostasAceitas].some((aceita) => normalizar(aceita) === alvo)
}
