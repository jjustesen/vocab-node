import { useEffect, useState } from 'react'

/**
 * Fala uma palavra em inglês com o `speechSynthesis` do próprio navegador.
 *
 * ATENÇÃO ao histórico antes de reaproveitar isto: o `speechSynthesis` já foi
 * o motor de `ordenar_audio` e foi REVERTIDO no mesmo dia (26/07/2026, ver
 * docs/CONTRATO-QUESTOES.md) — em teste real, boa parte dos aparelhos não tem
 * voz em inglês instalada, e sem voz o exercício ficava impossível.
 *
 * Aqui ele volta com um papel diferente, e é essa diferença que o torna
 * aceitável: é uma DICA OPCIONAL. Sem voz em inglês, o botão simplesmente não
 * aparece e a questão continua respondível — o custo do aparelho sem voz caiu
 * de "impossível" para "sem dica". Nada de TTS pago aqui: seria uma geração de
 * áudio por palavra, para um botão que a maioria não vai tocar.
 */

function vozEmIngles(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null
  const vozes = speechSynthesis.getVoices()
  // en-US primeiro; qualquer inglês serve melhor que nenhum.
  return vozes.find((v) => v.lang === 'en-US') ?? vozes.find((v) => v.lang?.startsWith('en')) ?? null
}

/**
 * `true` quando dá para falar inglês neste aparelho. A lista de vozes chega
 * de forma assíncrona no Chrome — daí o `onvoiceschanged`, sem o qual a
 * primeira renderização quase sempre veria zero vozes e esconderia o botão
 * para todo mundo.
 */
export function useTemVozEmIngles(): boolean {
  const [tem, setTem] = useState(() => vozEmIngles() !== null)

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined' || tem) return
    const conferir = () => setTem(vozEmIngles() !== null)
    speechSynthesis.addEventListener('voiceschanged', conferir)
    // Alguns navegadores só populam a lista depois de uma chamada a getVoices().
    conferir()
    return () => speechSynthesis.removeEventListener('voiceschanged', conferir)
  }, [tem])

  return tem
}

export function falarEmIngles(texto: string): void {
  const voz = vozEmIngles()
  if (!voz || !texto.trim()) return

  // Cancela o que estiver na fila: tocar o botão duas vezes seguidas deve
  // repetir a palavra, não enfileirar duas leituras.
  speechSynthesis.cancel()

  const fala = new SpeechSynthesisUtterance(texto)
  fala.voice = voz
  fala.lang = voz.lang
  // Um pouco mais devagar que o normal: é uma palavra sozinha, sem contexto
  // para o ouvido se apoiar, e quem toca aqui é justamente quem travou.
  fala.rate = 0.85
  speechSynthesis.speak(fala)
}
