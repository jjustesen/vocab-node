/**
 * A conta do custo de IA que o professor vê antes de montar preço e limite
 * (docs/TUTOR-TRILHAS.md §5.1 e §5.2). Espelha as funções da migration 0031:
 * `taxa_da_plataforma_centavos` e `preco_minimo_centavos`. Mude de um lado,
 * mude do outro. O servidor confere de novo ao salvar o plano.
 *
 * Sem React e sem Supabase, para ser testada sozinha (custo-ia.test.mts).
 */

/** Cotação do dólar usada nas contas (fixa por enquanto). */
export const COTACAO_DOLAR = 5.5

/**
 * O pagamento leva cerca de 10% do que entra, então a IA é cobrada 10% acima
 * do preço do modelo. Mesmo valor de _shared/creditos.ts.
 */
export const ACRESCIMO_PAGAMENTO = 1.1

/** Reais cobrados por dólar de IA (cotação + 10%). A mesma de `cotacao_dolar()` no banco e de _shared/creditos.ts. */
export const REAIS_POR_DOLAR = Math.round(COTACAO_DOLAR * ACRESCIMO_PAGAMENTO * 100) / 100

/** Teto de uma sessão do tutor (TETO_POR_SESSAO_USD em tutor-aluno): o pior caso por prática. */
export const TETO_POR_SESSAO_USD = 0.5

/** Sem histórico, quanto do limite de práticas os alunos usam de fato (§5.2). */
export const USO_TIPICO = 0.6

/** A tabela de preços do Gemini dobra nesta data (precos.ts). */
export const DATA_AUMENTO = new Date('2027-01-01T00:00:00-03:00')

/** Taxa da plataforma por assinatura por mês: 10%, mínimo de R$ 6 (em centavos). */
export function taxaDaPlataformaCentavos(precoCentavos: number): number {
  return Math.max(Math.ceil(precoCentavos * 0.1), 600)
}

/**
 * O menor preço (em centavos, reais inteiros) em que o que sobra depois da
 * taxa cobre a IA máxima do mês: `preço − taxa(preço) ≥ IA máxima`.
 */
export function precoMinimoCentavos(iaMaximaReais: number): number {
  // Arredonda a 4 casas antes do teto: 8.28 + 6 não pode virar 14.280000001 → 15.
  const limpo = (v: number) => Math.round(v * 10_000) / 10_000
  const reais = iaMaximaReais + 6 <= 60 ? Math.ceil(limpo(iaMaximaReais + 6)) : Math.ceil(limpo(iaMaximaReais / 0.9))
  return reais * 100
}

export type EstimativaPorAluno = {
  /** Custo médio de uma prática nas lições do tutor (R$). */
  porPratica: number
  /** Práticas/mês × uso típico × custo por prática (R$). */
  esperadoMes: number
  /** Práticas/mês × custo por prática: o aluno que usa tudo (R$). */
  maximoMes: number
  /** Uma prática de cada lição do tutor (R$). */
  concluirUmaVez: number
  precoMinimoCentavos: number
}

/** `custosUsd`: a estimativa por sessão de cada lição do tutor da trilha (ou do plano). */
export function estimarPorAluno(custosUsd: number[], praticasMes: number): EstimativaPorAluno {
  const somaUsd = custosUsd.reduce((t, c) => t + c, 0)
  const porPratica = custosUsd.length ? (somaUsd / custosUsd.length) * REAIS_POR_DOLAR : 0
  const maximoMes = praticasMes * porPratica
  return {
    porPratica,
    esperadoMes: maximoMes * USO_TIPICO,
    maximoMes,
    concluirUmaVez: somaUsd * REAIS_POR_DOLAR,
    precoMinimoCentavos: precoMinimoCentavos(maximoMes),
  }
}

/** Quanto sobra para o professor por aluno no mês, no pior caso de IA (sem a tarifa do cartão). */
export function sobraPorAlunoCentavos(precoCentavos: number, iaMaximaReais: number): number {
  return precoCentavos - taxaDaPlataformaCentavos(precoCentavos) - Math.round(iaMaximaReais * 100)
}

export function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function reaisDeCentavos(centavos: number): string {
  return reais(centavos / 100)
}
