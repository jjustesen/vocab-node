import type { Parte } from './falar.ts'

/**
 * O nome do arquivo pré-gravado de uma fala no bucket `tutor-falas`.
 *
 * ESPELHO de poc-tutor/src/chaveDaFala.ts — mude de um lado, mude do outro: a
 * página procura o áudio por este nome, e um hash diferente aqui seria um
 * arquivo que nunca toca. A função recalcula o nome em vez de aceitar o do
 * navegador: assim ninguém grava outra voz por cima da chave de uma fala.
 */
export function chaveDaFala(fala: Parte[]): string {
  const texto = fala.map((p) => `${p.idioma}:${p.texto.trim()}`).join('|')
  const fnv = (semente: number) => {
    let h = semente
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(16).padStart(8, '0')
  }
  return fnv(0x811c9dc5) + fnv(0x2f1b8a43)
}
