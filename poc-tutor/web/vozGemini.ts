import type { Fala } from '../src/falas.ts'
import { codigoDeAcesso } from './api.ts'
import type { Custo } from './custo.ts'

/**
 * A voz do tutor pelo Gemini TTS (ação `falar` da função poc-tutor), gerada na
 * hora — sem áudio gravado de antemão.
 *
 * Uma voz só para português e inglês: o modelo troca de idioma no meio da
 * frase sem trocar de voz, e não depende das vozes instaladas no aparelho
 * (que já derrubaram uma versão do app por falta de inglês).
 *
 * Custa ~1–2 s por fala. Para não somar isso a cada fala de um turno, a página
 * pede TODAS as falas do turno de uma vez (`gerar`) e toca em sequência
 * (`tocar`) — enquanto a primeira toca, as outras já chegaram.
 */

const URL_FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poc-tutor`

export type AudioGerado = { url: string; custos: Custo[] }

export async function gerar(fala: Fala): Promise<AudioGerado> {
  const resposta = await fetch(URL_FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: codigoDeAcesso(), acao: 'falar', fala }),
  })
  const json = await resposta.json().catch(() => ({}))
  if (!resposta.ok || !json.audio) throw new Error(json.erro ?? `TTS respondeu ${resposta.status}`)
  const bytes = Uint8Array.from(atob(json.audio.base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: json.audio.mimeType }))
  return { url, custos: json.custos ?? [] }
}

let tocando: HTMLAudioElement | null = null

/** Toca e resolve ao terminar (ou ao ser parado). `false` se foi interrompido. */
export function tocar(audio: AudioGerado): Promise<boolean> {
  return new Promise((resolve) => {
    const el = new Audio(audio.url)
    tocando = el
    const fim = (concluiu: boolean) => {
      if (tocando === el) tocando = null
      URL.revokeObjectURL(audio.url)
      resolve(concluiu)
    }
    el.onended = () => fim(true)
    el.onerror = () => fim(false)
    el.onpause = () => {
      if (!el.ended) fim(false)
    }
    el.play().catch(() => fim(false))
  })
}

export function pararAudio() {
  tocando?.pause()
  tocando = null
}
