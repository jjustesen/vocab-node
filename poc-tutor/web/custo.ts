/**
 * Preço dos tokens de cada serviço, a partir do que a função devolve em cada
 * chamada (`custos: [{ servico, entrada, saida }]`).
 *
 * US$ por 1 milhão de tokens, consultados em 03/10/2026:
 * - Gemini: ai.google.dev/gemini-api/docs/pricing. O 3.6 Flash e o 3.8 Flash
 *   TTS estão com preço reduzido até 31/12/2026 e dobram em 1º/01/2027.
 * - Jev (TypeSafe AI): só a entrada é cobrada; a saída é grátis.
 *
 * O valor exato está nos faturamentos do Google AI Studio e da TypeSafe.
 */
const ATE_2027 = new Date() < new Date('2027-01-01')

export const PRECOS: Record<string, { nome: string; entrada: number; saida: number }> = {
  'gemini-3.6-flash': { nome: 'Gemini 3.6 Flash', ...(ATE_2027 ? { entrada: 0.75, saida: 3.75 } : { entrada: 1.5, saida: 7.5 }) },
  'gemini-3.5-flash-lite': { nome: 'Gemini 3.5 Flash-Lite', entrada: 0.3, saida: 2.5 },
  'gemini-3.8-flash-tts': { nome: 'Gemini 3.8 Flash TTS', ...(ATE_2027 ? { entrada: 0.5, saida: 9 } : { entrada: 1, saida: 18 }) },
  'gemini-3.8-flash-lite-tts': { nome: 'Gemini 3.8 Flash-Lite TTS', ...(ATE_2027 ? { entrada: 0.5, saida: 6 } : { entrada: 1, saida: 12 }) },
  jev: { nome: 'Jev', entrada: 0.042, saida: 0 },
}

export type Custo = { servico: string; entrada: number; saida: number }

/** Gasto acumulado da sessão, por serviço. */
export type Gasto = Record<string, { entrada: number; saida: number; chamadas: number }>

export function somar(gasto: Gasto, custos: Custo[] = []): Gasto {
  const novo = { ...gasto }
  for (const c of custos) {
    const atual = novo[c.servico] ?? { entrada: 0, saida: 0, chamadas: 0 }
    novo[c.servico] = { entrada: atual.entrada + c.entrada, saida: atual.saida + c.saida, chamadas: atual.chamadas + 1 }
  }
  return novo
}

export function precoDe(servico: string, entrada: number, saida: number): number {
  const p = PRECOS[servico]
  return p ? (entrada * p.entrada + saida * p.saida) / 1_000_000 : 0
}

export function precoDosCustos(custos: Custo[] = []): number {
  return custos.reduce((t, c) => t + precoDe(c.servico, c.entrada, c.saida), 0)
}

export function precoTotal(gasto: Gasto): number {
  return Object.entries(gasto).reduce((t, [s, g]) => t + precoDe(s, g.entrada, g.saida), 0)
}

/** Gemini é tudo que é cobrado pelo Google (texto e voz); o resto é Jev. */
export const ehGemini = (servico: string) => servico.startsWith('gemini')

/** Os serviços que a sessão SEMPRE mostra, mesmo zerados — para comparar. */
export const SERVICOS_FIXOS = ['gemini-3.6-flash', 'gemini-3.8-flash-lite-tts', 'jev']

export function precoDoGemini(gasto: Gasto): number {
  return Object.entries(gasto)
    .filter(([s]) => ehGemini(s))
    .reduce((t, [s, g]) => t + precoDe(s, g.entrada, g.saida), 0)
}

/** "Gemini US$ 0.0012 + Jev < US$ 0.0001" — o custo de UM turno, por serviço. */
export function custoPorServico(custos: Custo[] = []): string {
  const gemini = custos.filter((c) => ehGemini(c.servico))
  const outros = custos.filter((c) => !ehGemini(c.servico))
  const partes = []
  if (gemini.length) partes.push(`Gemini ${formatarDolares(precoDosCustos(gemini))}`)
  for (const c of outros) partes.push(`${nomeDoServico(c.servico)} ${formatarDolares(precoDe(c.servico, c.entrada, c.saida))}`)
  return partes.join(' + ')
}

export function nomeDoServico(servico: string): string {
  return PRECOS[servico]?.nome ?? servico
}

export function formatarDolares(v: number): string {
  if (v > 0 && v < 0.0001) return '< US$ 0.0001'
  return `US$ ${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`
}
