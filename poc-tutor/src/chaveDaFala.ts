import type { Fala } from './falas.ts'

/**
 * O nome do arquivo pré-gravado de uma fala: um hash do texto COM o idioma de
 * cada parte. O script que grava (scripts/gravar-falas.ts) e a página que toca
 * (web/vozGemini.ts) chegam ao mesmo nome sem lista nenhuma no meio — e
 * qualquer mudança de uma vírgula num template vira outro nome, então um áudio
 * velho nunca toca para um texto novo: a fala simplesmente cai no stream.
 */
export function chaveDaFala(fala: Fala): string {
  const texto = fala.map((p) => `${p.idioma}:${p.texto.trim()}`).join('|')
  // FNV-1a 32 bits, duas vezes com sementes diferentes: 64 bits, sem colisão
  // prática para algumas centenas de falas, e síncrono no navegador.
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
