import { chaveDaFala } from '../src/chaveDaFala.ts'
import type { Fala } from '../src/falas.ts'
import { codigoDeAcesso } from './api.ts'
import type { Custo } from './custo.ts'

/**
 * A voz do tutor: Gemini TTS, sempre a mesma voz e semente, por dois caminhos.
 *
 * 1. PRÉ-GRAVADA — as falas que só dependem do roteiro e dos templates
 *    ("Primeiro, diga em inglês…", "Windy.", "A frase é: …") já estão em
 *    web/audios/<chaveDaFala>.mp3, gravadas por scripts/gravar-falas.ts.
 *    Tocam na hora, sem custo.
 * 2. STREAM — o resto (a pista que o Gemini escreveu, o que o aluno disse, a
 *    resposta de uma dúvida) é pedido à ação `falar_stream` e começa a tocar
 *    no primeiro pedaço (~0,8 s), não quando a fala inteira ficou pronta
 *    (~3 s).
 *
 * `preparar` começa o trabalho na hora (a página prepara TODAS as falas do
 * turno juntas); `tocar` toca quando chegar a vez.
 */

const URL_FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poc-tutor`

const GRAVADAS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./audios/*.{mp3,wav}', { query: '?url', import: 'default', eager: true }),
  ).map(([caminho, url]) => [caminho.replace(/^.*\/|\.\w+$/g, ''), url]),
)

/** Falas que já tocaram em stream, guardadas inteiras: o "Devagar" não pede de novo. */
const jaOuvidas = new Map<string, string>()

export type Origem = 'gravada' | 'stream'

export type VozPreparada = {
  origem: Origem
  /** Tokens gastos (vazio na pré-gravada); resolve quando o stream termina. */
  custos: Promise<Custo[]>
  /** Do pedido ao primeiro som que chegou (só stream). */
  primeiroSomMs: Promise<number | null>
  /** Toca até o fim (ou até `pararAudio`). `false` só se falhou sem soar nada: a página cai na voz do aparelho. */
  tocar: (velocidade?: number) => Promise<boolean>
}

export function temGravada(fala: Fala): boolean {
  return chaveDaFala(fala) in GRAVADAS
}

export function preparar(fala: Fala): VozPreparada {
  const chave = chaveDaFala(fala)
  const url = GRAVADAS[chave] ?? jaOuvidas.get(chave)
  if (url) {
    return {
      origem: 'gravada',
      custos: Promise.resolve([]),
      primeiroSomMs: Promise.resolve(null),
      tocar: (velocidade = 1) => tocarUrl(url, velocidade),
    }
  }
  return emStream(fala, chave)
}

// ── Stream ───────────────────────────────────────────────────────────────────

let contexto: AudioContext | null = null

/**
 * O stream toca pelo Web Audio, que só sai do mudo depois de um toque do
 * aluno. Chamar DENTRO do gesto (Começar, microfone, atalhos).
 */
export function destravarAudio() {
  contexto ??= new AudioContext()
  void contexto.resume()
}

function emStream(fala: Fala, chave: string): VozPreparada {
  const inicio = performance.now()
  const pedacos: Int16Array[] = []
  let taxa = 24_000
  let terminou = false
  let avisar: (() => void) | null = null
  const novidade = () => {
    avisar?.()
    avisar = null
  }
  let resolverCustos!: (c: Custo[]) => void
  const custos = new Promise<Custo[]>((r) => (resolverCustos = r))
  let resolverPrimeiro!: (ms: number | null) => void
  const primeiroSomMs = new Promise<number | null>((r) => (resolverPrimeiro = r))

  void (async () => {
    try {
      const resposta = await fetch(URL_FUNCAO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigoDeAcesso(), acao: 'falar_stream', fala }),
      })
      if (!resposta.ok || !resposta.body) throw new Error(`TTS respondeu ${resposta.status}`)
      const leitor = resposta.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) break
        buffer += value
        let i
        while ((i = buffer.indexOf('\n')) !== -1) {
          const linha = JSON.parse(buffer.slice(0, i))
          buffer = buffer.slice(i + 1)
          if (linha.taxa) taxa = linha.taxa
          if (linha.pcm) {
            const bytes = Uint8Array.from(atob(linha.pcm), (c) => c.charCodeAt(0))
            if (!pedacos.length) resolverPrimeiro(Math.round(performance.now() - inicio))
            pedacos.push(new Int16Array(bytes.buffer, 0, bytes.length >> 1))
            novidade()
          }
          if (linha.fim) resolverCustos(linha.custos ?? [])
          if (linha.erro) throw new Error(linha.erro)
        }
      }
      if (pedacos.length) jaOuvidas.set(chave, URL.createObjectURL(paraWav(pedacos, taxa)))
    } catch (e) {
      console.warn('voz em stream:', e)
    } finally {
      terminou = true
      resolverCustos([])
      resolverPrimeiro(null)
      novidade()
    }
  })()

  const esperarNovidade = () => new Promise<void>((r) => (avisar = r))

  async function tocar(velocidade = 1): Promise<boolean> {
    // Mais devagar: o Web Audio não segura o tom ao desacelerar, o <audio>
    // sim. Espera a fala inteira e toca como arquivo.
    if (velocidade !== 1) {
      while (!terminou) await esperarNovidade()
      const url = jaOuvidas.get(chave)
      return url ? tocarUrl(url, velocidade) : false
    }

    destravarAudio()
    const ctx = contexto!
    const parada = { parou: false }
    const fontes = new Set<AudioBufferSourceNode>()
    const parar = () => {
      parada.parou = true
      for (const f of fontes) f.stop()
      novidade()
    }
    pararAtual = parar

    let proximo = 0
    let tocados = 0
    try {
      for (;;) {
        while (tocados < pedacos.length && !parada.parou) {
          const pcm = pedacos[tocados++]
          const buffer = ctx.createBuffer(1, pcm.length, taxa)
          const canal = buffer.getChannelData(0)
          for (let k = 0; k < pcm.length; k++) canal[k] = pcm[k] / 32768
          const fonte = ctx.createBufferSource()
          fonte.buffer = buffer
          fonte.connect(ctx.destination)
          // Encostado no anterior; se a rede atrasou e o anterior já acabou,
          // um respiro de 40 ms em vez de um estalo.
          proximo = Math.max(proximo, ctx.currentTime + 0.04)
          fonte.start(proximo)
          proximo += buffer.duration
          fontes.add(fonte)
          fonte.onended = () => {
            fontes.delete(fonte)
            novidade()
          }
        }
        if (parada.parou) return true
        if (terminou && tocados === pedacos.length && fontes.size === 0) return tocados > 0
        await esperarNovidade()
      }
    } finally {
      if (pararAtual === parar) pararAtual = null
    }
  }

  return { origem: 'stream', custos, primeiroSomMs, tocar }
}

function paraWav(pedacos: Int16Array[], taxa: number): Blob {
  const total = pedacos.reduce((n, p) => n + p.length, 0)
  const vista = new DataView(new ArrayBuffer(44 + total * 2))
  const ascii = (o: number, t: string) => [...t].forEach((c, i) => vista.setUint8(o + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  vista.setUint32(4, 36 + total * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  vista.setUint32(16, 16, true)
  vista.setUint16(20, 1, true)
  vista.setUint16(22, 1, true)
  vista.setUint32(24, taxa, true)
  vista.setUint32(28, taxa * 2, true)
  vista.setUint16(32, 2, true)
  vista.setUint16(34, 16, true)
  ascii(36, 'data')
  vista.setUint32(40, total * 2, true)
  let o = 44
  for (const p of pedacos) for (const v of p) (vista.setInt16(o, v, true), (o += 2))
  return new Blob([vista.buffer], { type: 'audio/wav' })
}

// ── Arquivo (pré-gravada, ou stream já ouvido) ───────────────────────────────

let pararAtual: (() => void) | null = null

/** Toca e resolve ao terminar (ou ao ser parado). `false` se o arquivo não tocou. */
function tocarUrl(url: string, velocidade: number): Promise<boolean> {
  return new Promise((resolve) => {
    const el = new Audio(url)
    el.playbackRate = velocidade
    // Sem isto o navegador "corrige" o tom ao desacelerar só em alguns aparelhos.
    el.preservesPitch = true
    const fim = (concluiu: boolean) => {
      if (pararAtual === parar) pararAtual = null
      resolve(concluiu)
    }
    const parar = () => el.pause()
    pararAtual = parar
    el.onended = () => fim(true)
    el.onerror = () => fim(false)
    el.onpause = () => {
      if (!el.ended) fim(true)
    }
    el.play().catch(() => fim(false))
  })
}

export function pararAudio() {
  pararAtual?.()
  pararAtual = null
}
