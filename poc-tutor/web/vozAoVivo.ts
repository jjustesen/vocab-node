/**
 * Transcrição ENQUANTO o aluno fala, pelo Gemini Live.
 *
 * Sem isto, o turno só começa a ser transcrito depois do silêncio: o áudio
 * inteiro sobe para a função e o Gemini leva ~1,6–2 s para devolver o texto.
 * Aqui o áudio vai em pedaços de ~85 ms enquanto o aluno fala, e o texto
 * chega ~0,2 s depois do fim da fala — medido com frases erradas ("They was at
 * home"), que continuam saindo como foram ditas.
 *
 * Tudo aqui é opcional: se a conexão não abriu, caiu ou não devolveu texto a
 * tempo, `terminar()` devolve `null` e a página manda o áudio gravado pelo
 * caminho de sempre (a função transcreve com o Flash-Lite).
 *
 * A detecção de fala é a do nosso microfone (microfone.ts): começar =
 * `activityStart`, silêncio = `activityEnd`. O token é efêmero e vem da função
 * (`token_voz`), já preso a este modelo e a esta configuração.
 */

const URL_LIVE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'

/** Esperar o `setupComplete`: passou disto, a aula segue sem o ao vivo. */
const LIMITE_CONEXAO_MS = 6000
/** Depois do fim da fala: sem nenhum texto até aqui, desiste e usa o áudio gravado. */
const LIMITE_SEM_TEXTO_MS = 1200
/** O texto pode chegar em pedaços: quieto por este tempo, está completo. */
const QUIETO_DEPOIS_DO_TEXTO_MS = 250
/** Teto absoluto da espera depois do fim da fala. */
const LIMITE_TOTAL_MS = 2000

export type PedirToken = () => Promise<{ token: string; modelo: string }>

export class TranscritorAoVivo {
  private ws: WebSocket | null = null
  private pronto = false
  private conectando: Promise<void> | null = null
  private ouvindo = false
  private texto = ''
  private ultimoTexto = 0
  private avisar: (() => void) | null = null
  private pedirToken: PedirToken

  constructor(pedirToken: PedirToken) {
    this.pedirToken = pedirToken
  }

  /** Abre a conexão (pode ser chamado de novo: reconecta se caiu). Nunca lança. */
  conectar(): Promise<void> {
    if (this.pronto || this.conectando) return this.conectando ?? Promise.resolve()
    this.conectando = this.abrir()
      .catch((e) => console.warn('voz ao vivo indisponível:', e))
      .finally(() => (this.conectando = null))
    return this.conectando
  }

  private async abrir() {
    const { token, modelo } = await this.pedirToken()
    const ws = new WebSocket(`${URL_LIVE}?access_token=${encodeURIComponent(token)}`)
    this.ws = ws
    await new Promise<void>((ok, falha) => {
      const limite = setTimeout(() => falha(new Error('o Live não respondeu')), LIMITE_CONEXAO_MS)
      ws.onopen = () => ws.send(JSON.stringify({ setup: { model: `models/${modelo}` } }))
      ws.onmessage = async (e) => {
        const m = await lerMensagem(e.data)
        if (m?.setupComplete) {
          clearTimeout(limite)
          this.pronto = true
          ok()
        }
        const pedaco = m?.serverContent?.inputTranscription?.text
        if (typeof pedaco === 'string' && this.ouvindo) {
          this.texto += pedaco
          this.ultimoTexto = Date.now()
          this.avisar?.()
        }
      }
      ws.onclose = (e) => {
        clearTimeout(limite)
        // Fim do token, goAway ou rede: o próximo turno reconecta; este usa o áudio.
        this.pronto = false
        this.ws = null
        this.avisar?.()
        falha(new Error(`fechou (${e.code})`))
      }
    })
  }

  /** O aluno vai falar. Sem conexão pronta, tenta reconectar para o próximo turno. */
  comecar(): void {
    this.texto = ''
    this.ultimoTexto = 0
    if (!this.pronto || !this.ws) {
      this.ouvindo = false
      void this.conectar()
      return
    }
    this.ouvindo = true
    this.ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } }))
  }

  /** Um pedaço do microfone: PCM 16-bit, 16 kHz, mono. */
  enviar(pcm: Int16Array): void {
    if (!this.ouvindo || !this.pronto || !this.ws) return
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: paraBase64(pcm), mimeType: 'audio/pcm;rate=16000' } } }))
  }

  /** Fim da fala: o texto dito, ou `null` se o ao vivo não deu conta (aí vale o áudio gravado). */
  async terminar(): Promise<string | null> {
    if (!this.ouvindo || !this.pronto || !this.ws) {
      this.ouvindo = false
      return null
    }
    this.ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }))
    const fim = Date.now()
    for (;;) {
      const agora = Date.now()
      const completo = this.texto && agora - this.ultimoTexto >= QUIETO_DEPOIS_DO_TEXTO_MS
      const desistiu = (!this.texto && agora - fim >= LIMITE_SEM_TEXTO_MS) || agora - fim >= LIMITE_TOTAL_MS || !this.pronto
      if (completo || desistiu) break
      await new Promise<void>((ok) => {
        this.avisar = ok
        setTimeout(ok, 50)
      })
      this.avisar = null
    }
    this.ouvindo = false
    return this.texto.trim() || null
  }

  /** O turno acabou de outro jeito (ajuda, digitou, pausou): fecha a fala sem esperar texto. */
  cancelar(): void {
    if (this.ouvindo && this.pronto && this.ws) this.ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }))
    this.ouvindo = false
    this.texto = ''
  }

  fechar(): void {
    this.ouvindo = false
    this.pronto = false
    this.ws?.close()
    this.ws = null
  }
}

async function lerMensagem(dado: unknown): Promise<Record<string, any> | null> {
  try {
    const texto = typeof dado === 'string' ? dado : dado instanceof Blob ? await dado.text() : new TextDecoder().decode(dado as ArrayBuffer)
    return JSON.parse(texto)
  } catch {
    return null
  }
}

function paraBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
