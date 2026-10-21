import type { Custo } from './comum.ts'

/**
 * US$ por 1 milhão de tokens, por serviço. ESPELHADO em poc-tutor/web/custo.ts
 * (a gaveta do laboratório) — mude de um lado, mude do outro.
 *
 * Aqui o preço é o que vale para o limite por sessão e para o "uso e custo do
 * mês" do professor: o navegador do aluno não decide quanto gastou.
 */
const ATE_2027 = new Date() < new Date('2027-01-01')

const PRECOS: Record<string, { entrada: number; saida: number }> = {
  'gemini-3.6-flash': ATE_2027 ? { entrada: 0.75, saida: 3.75 } : { entrada: 1.5, saida: 7.5 },
  'gemini-3.5-flash-lite': { entrada: 0.3, saida: 2.5 },
  'gemini-3.8-flash-tts': ATE_2027 ? { entrada: 0.5, saida: 9 } : { entrada: 1, saida: 18 },
  'gemini-3.8-flash-lite-tts': ATE_2027 ? { entrada: 0.5, saida: 6 } : { entrada: 1, saida: 12 },
  jev: { entrada: 0.042, saida: 0 },
  // Por 1 mi de CARACTERES (a "entrada" do custo é o tamanho do texto).
  'xai-tts': { entrada: 15, saida: 0 },
}

/** Serviço sem preço conhecido (modelo trocado por secret) cobra como o Flash: melhor sobrar que faltar. */
const PRECO_DESCONHECIDO = PRECOS['gemini-3.6-flash']

export function custoEmUsd(custos: Custo[]): number {
  return custos.reduce((total, c) => {
    const p = PRECOS[c.servico] ?? PRECO_DESCONHECIDO
    return total + (c.entrada * p.entrada + c.saida * p.saida) / 1_000_000
  }, 0)
}

/** Tokens somados por serviço, no formato da coluna `tutor_sessoes.gasto`. */
export function gastoPorServico(custos: Custo[]): Record<string, { entrada: number; saida: number }> {
  const gasto: Record<string, { entrada: number; saida: number }> = {}
  for (const c of custos) {
    const atual = gasto[c.servico] ?? { entrada: 0, saida: 0 }
    gasto[c.servico] = { entrada: atual.entrada + c.entrada, saida: atual.saida + c.saida }
  }
  return gasto
}
