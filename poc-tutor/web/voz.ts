import type { Fala } from '../src/falas.ts'

/**
 * A voz do tutor, com o `speechSynthesis` do próprio aparelho.
 *
 * Cada parte da fala vai na voz do seu idioma: "A frase é:" em português,
 * "It was windy this morning." em inglês. É instantâneo e não custa nada.
 *
 * O risco conhecido (ver app/src/features/tarefa/vozDoNavegador.ts): nem todo
 * aparelho tem voz em inglês instalada. Aqui isso não trava a aula — a fala
 * sempre aparece escrita na tela, e sem voz em inglês a parte em inglês sai na
 * voz que houver. A tela avisa quando é o caso.
 */

export type Vozes = { pt: SpeechSynthesisVoice | null; en: SpeechSynthesisVoice | null }

const disponivel = () => typeof speechSynthesis !== 'undefined'

function escolher(vozes: SpeechSynthesisVoice[], idioma: string): SpeechSynthesisVoice | null {
  const doIdioma = vozes.filter((v) => v.lang?.replace('_', '-').toLowerCase().startsWith(idioma.toLowerCase().slice(0, 2)))
  // A variante exata primeiro (pt-BR, en-US); entre elas, as do Google, que no Android soam bem melhor.
  const exatas = doIdioma.filter((v) => v.lang.replace('_', '-').toLowerCase() === idioma.toLowerCase())
  const lista = exatas.length > 0 ? exatas : doIdioma
  return lista.find((v) => /google/i.test(v.name)) ?? lista[0] ?? null
}

/** A lista de vozes chega assíncrona no Chrome; espera um pouco por ela. */
export function carregarVozes(): Promise<Vozes> {
  if (!disponivel()) return Promise.resolve({ pt: null, en: null })
  const montar = (): Vozes => {
    const vozes = speechSynthesis.getVoices()
    return { pt: escolher(vozes, 'pt-BR'), en: escolher(vozes, 'en-US') }
  }
  if (speechSynthesis.getVoices().length > 0) return Promise.resolve(montar())
  return new Promise((resolve) => {
    const pronto = () => resolve(montar())
    speechSynthesis.addEventListener('voiceschanged', pronto, { once: true })
    setTimeout(pronto, 1500)
  })
}

/**
 * Alguns navegadores (iOS, Chrome em certos aparelhos) só deixam falar depois
 * de uma fala iniciada DENTRO de um toque. Chamar no clique de "Começar".
 */
export function destravarVoz() {
  if (!disponivel()) return
  const vazia = new SpeechSynthesisUtterance(' ')
  vazia.volume = 0
  speechSynthesis.speak(vazia)
}

export function cancelarFala() {
  if (disponivel()) speechSynthesis.cancel()
}

/** Fala as partes em sequência; resolve quando termina ou é cancelada. */
export async function falar(fala: Fala, vozes: Vozes, velocidade = 1): Promise<void> {
  if (!disponivel()) return
  for (const parte of fala) {
    if (!parte.texto.trim()) continue
    const voz = parte.idioma === 'en' ? (vozes.en ?? vozes.pt) : (vozes.pt ?? vozes.en)
    const concluiu = await falarParte(parte.texto, voz, parte.idioma, velocidade)
    if (!concluiu) return // cancelada: não segue para a próxima parte
  }
}

function falarParte(texto: string, voz: SpeechSynthesisVoice | null, idioma: 'pt' | 'en', velocidade: number): Promise<boolean> {
  return new Promise((resolve) => {
    const fala = new SpeechSynthesisUtterance(texto)
    if (voz) fala.voice = voz
    fala.lang = voz?.lang ?? (idioma === 'en' ? 'en-US' : 'pt-BR')
    // Inglês um pouco mais devagar: é o modelo que o aluno vai reproduzir.
    fala.rate = (idioma === 'en' ? 0.9 : 1.05) * velocidade

    let acabou = false
    const fim = (concluiu: boolean) => {
      if (acabou) return
      acabou = true
      clearTimeout(seguranca)
      resolve(concluiu)
    }
    fala.onend = () => fim(true)
    fala.onerror = (e) => fim(e.error !== 'canceled' && e.error !== 'interrupted')
    // O Chrome às vezes não dispara `onend` (bug antigo com falas longas):
    // sem esta trava, o tutor ficaria "falando" para sempre.
    const seguranca = setTimeout(() => fim(true), 3000 + texto.length * 90)
    speechSynthesis.speak(fala)
  })
}
