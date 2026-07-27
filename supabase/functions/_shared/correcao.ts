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

function normalizarFala(texto: string): string[] {
  return normalizar(texto)
    .replace(/[.,!?;:"()]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

function palavrasEmComum(a: string[], b: string[]): number {
  const tabela: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tabela[i][j] = a[i - 1] === b[j - 1] ? tabela[i - 1][j - 1] + 1 : Math.max(tabela[i - 1][j], tabela[i][j - 1])
    }
  }
  return tabela[a.length][b.length]
}

/**
 * Espelha pontuarPronuncia de app/src/types/questao.ts. O cliente calcula a
 * mesma nota para dar feedback na hora; esta cópia existe porque a nota que o
 * professor vê nunca sai do que o cliente mandou — só a transcrição sai.
 */
export function pontuarPronuncia(fraseAlvo: string, transcricao: string): number {
  const alvo = normalizarFala(fraseAlvo)
  const dito = normalizarFala(transcricao)
  if (alvo.length === 0 || dito.length === 0) return 0
  const comuns = palavrasEmComum(alvo, dito)
  if (comuns === 0) return 0
  const cobertura = comuns / alvo.length
  const precisao = comuns / dito.length
  return Math.round(((2 * cobertura * precisao) / (cobertura + precisao)) * 100)
}

export function corrigir(
  tipo: string,
  respostaCorreta: string,
  respostasAceitas: string[],
  valorDado: string,
  pares?: Par[] | null,
): boolean {
  // `valorDado` de pronuncia é a TRANSCRIÇÃO que o navegador do aluno ouviu.
  if (tipo === 'pronuncia') {
    return corretaPorPontuacao(pontuarPronuncia(respostaCorreta, valorDado))
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
