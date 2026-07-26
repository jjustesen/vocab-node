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
export function corrigir(
  tipo: string,
  respostaCorreta: string,
  respostasAceitas: string[],
  valorDado: string,
  pares?: Par[] | null,
): boolean {
  if (tipo === 'multipla_escolha' || tipo === 'verdadeiro_falso') {
    return valorDado === respostaCorreta
  }

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
