/**
 * O núcleo do tutor oral, dividido entre as duas portas de entrada:
 *
 *   poc-tutor   → o laboratório (senha compartilhada, sem banco)
 *   tutor-aluno → o aluno logado (sessão no banco, limite e custo)
 *
 * Ouvir e avaliar (avaliar.ts) e falar (falar.ts) são os mesmos nas duas; o
 * que muda é quem pode chamar e onde o gasto é anotado.
 */

/** Tokens gastos por serviço — multiplicados pelo preço em precos.ts. */
export type Custo = { servico: string; entrada: number; saida: number }

export const TIMEOUT_MS = 30_000

/** Problema no que o navegador mandou: vira resposta com este status, não 502. */
export class ErroDePedido extends Error {
  constructor(
    mensagem: string,
    readonly status = 400,
  ) {
    super(mensagem)
  }
}
