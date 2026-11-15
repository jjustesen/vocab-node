/**
 * Créditos do professor (migration 0031, docs/TUTOR-TRILHAS.md §5.3).
 *
 * Toda função que gasta IA do professor segue o mesmo passo:
 *
 *   const reserva = await reservarCreditos(db, professorId, teto, 'falas', ref, 'Gravar falas')
 *   …chama a IA…
 *   await acertarCreditos(db, reserva, custoUsd)
 *
 * A reserva tira o valor do saldo na hora (com trava no banco), então duas
 * ações ao mesmo tempo não deixam o saldo negativo. Sem saldo, a reserva lança
 * `SemCreditos`, e a função responde 402 com a mensagem de `respostaSemCreditos`.
 */
import type { clienteAdmin } from './cliente-admin.ts'
import { respostaJson } from './cors.ts'

type Db = ReturnType<typeof clienteAdmin>

/** A mesma de `cotacao_dolar()` no banco e de REAIS_POR_DOLAR no app. */
export const REAIS_POR_DOLAR = 5.5

export type OrigemDoGasto = 'sessao' | 'teste' | 'falas' | 'licao' | 'assinatura'

/**
 * Débito de valor conhecido (o plano contratado pelo professor, §5.4): reserva
 * e acerta pelo mesmo valor, na mesma trava. Sem saldo, lança `SemCreditos`.
 */
export async function debitarCreditos(
  db: Db,
  professorId: string,
  valorReais: number,
  origem: OrigemDoGasto,
  ref: string,
  descricao: string,
): Promise<void> {
  const reserva = await reservarCreditos(db, professorId, valorReais, origem, ref, descricao)
  const { error } = await db.rpc('creditos_acertar', { p_reserva: reserva, p_real: valorReais, p_descricao: descricao })
  if (error) throw new Error(`debitar créditos: ${error.message}`)
}

export class SemCreditos extends Error {
  constructor(
    readonly saldo: number,
    readonly precisa: number,
  ) {
    super('saldo_insuficiente')
  }
}

export function emReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export async function reservarCreditos(
  db: Db,
  professorId: string,
  valorReais: number,
  origem: OrigemDoGasto,
  ref: string,
  descricao: string,
): Promise<string> {
  const valor = Math.round(valorReais * 10_000) / 10_000
  const { data, error } = await db.rpc('creditos_reservar', {
    p_professor: professorId,
    p_valor: valor,
    p_origem: origem,
    p_ref: ref,
    p_descricao: descricao,
  })
  if (error) {
    if (error.message.includes('saldo_insuficiente')) throw new SemCreditos(Number(error.details) || 0, valor)
    throw new Error(`Não consegui reservar os créditos: ${error.message}`)
  }
  return data as string
}

/** Troca a reserva pelo custo real (em dólar, como a IA cobra). Nunca lança: o gasto já aconteceu. */
export async function acertarCreditos(db: Db, reservaId: string, custoUsd: number, descricao?: string) {
  const { error } = await db.rpc('creditos_acertar', {
    p_reserva: reservaId,
    p_real: Math.round(custoUsd * REAIS_POR_DOLAR * 10_000) / 10_000,
    p_descricao: descricao ?? null,
  })
  if (error) console.error('acertar créditos:', reservaId, error)
}

/**
 * 402 com o que a tela precisa para oferecer "Adicionar créditos": o saldo e
 * quanto a ação pedia. `codigo` deixa o app reconhecer sem ler a mensagem.
 */
export function respostaSemCreditos(e: SemCreditos, acao: string): Response {
  return respostaJson(
    {
      erro: `Seus créditos acabaram. ${acao} precisa de até ${emReais(e.precisa)} e o saldo é ${emReais(e.saldo)}.`,
      codigo: 'sem_creditos',
      saldo: e.saldo,
      precisa: e.precisa,
    },
    402,
  )
}
