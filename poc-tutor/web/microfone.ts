/**
 * O microfone da aula: grava cada turno e percebe quando o aluno terminou.
 *
 * Aberto UMA vez, no toque de "Começar", e reaproveitado a sessão inteira:
 * cada turno só liga e desliga um MediaRecorder sobre o mesmo stream. Pedir o
 * microfone a cada turno repetiria a permissão e, no iPhone, exigiria um toque
 * a cada frase.
 *
 * ── O que aprendemos com a pronúncia no celular (docs/PRONUNCIA-CELULAR.md) ─
 *
 * - O AudioContext tem de nascer DENTRO do toque; criado depois de um `await`,
 *   no iPhone ele fica suspenso e o medidor lê silêncio eterno.
 * - Medidor "mudo" (onda cravada em 128) NÃO é aluno calado. Se o medidor
 *   nunca se mexe, desligamos a parada automática e o silêncio longo: o aluno
 *   toca "Terminei". Cortar a fala dele por um medidor quebrado seria pior.
 * - O formato da gravação é o mesmo do app (webm/opus), que o Gemini já
 *   transcreve bem.
 */

const FORMATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

/** Volume (RMS, 0–1) a partir do qual conta como voz. Ajustável — depende do aparelho e do ambiente. */
const LIMIAR_VOZ = 0.03
/** Silêncio depois de ter falado que encerra o turno. Longo o bastante para uma pausa de planejamento ou autocorreção. */
export const FIM_DA_FALA_MS = 3000
/** Sem dizer nada por este tempo, o tutor oferece uma pista (especificação §6; a análise sugere 5–8 s). */
export const SILENCIO_LONGO_MS = 8000
/** Teto de um turno, como no app. */
const DURACAO_MAXIMA_MS = 30_000
/** Tempo para decidir que o medidor está mudo. */
const TESTE_DO_MEDIDOR_MS = 1500

export type EventosDaGravacao = {
  /** O aluno falou e ficou em silêncio por FIM_DA_FALA_MS: hora de enviar. */
  aoFimDaFala: () => void
  /** Nada foi dito por SILENCIO_LONGO_MS. */
  aoSilencioLongo: () => void
  /** Nível atual (0–1), para a tela mostrar que está ouvindo. */
  aoNivel?: (nivel: number) => void
}

export class Microfone {
  private contexto: AudioContext | null = null
  private analisador: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private gravador: MediaRecorder | null = null
  private pedacos: Blob[] = []
  private relogio: ReturnType<typeof setInterval> | null = null
  private formato: string | null = null

  /** `null` enquanto não testado; `false` quando o medidor não reage — aí só o botão encerra o turno. */
  medidorFunciona: boolean | null = null

  /** Chame no handler do toque, antes de qualquer `await` seu. */
  async abrir(): Promise<void> {
    // Síncrono, dentro do gesto — ver o cabeçalho.
    try {
      this.contexto = new AudioContext()
    } catch {
      this.contexto = null
    }
    this.formato = FORMATOS.find((f) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(f)) ?? null
    if (!this.formato) throw new Error('Este navegador não grava áudio.')

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    if (this.contexto) {
      if (this.contexto.state === 'suspended') await this.contexto.resume().catch(() => {})
      this.analisador = this.contexto.createAnalyser()
      this.analisador.fftSize = 1024
      this.contexto.createMediaStreamSource(this.stream).connect(this.analisador)
    } else {
      this.medidorFunciona = false
    }
  }

  get gravando(): boolean {
    return this.gravador?.state === 'recording'
  }

  gravar(eventos: EventosDaGravacao): void {
    if (!this.stream || !this.formato) throw new Error('Microfone não aberto.')
    this.descartar()

    this.pedacos = []
    const gravador = new MediaRecorder(this.stream, { mimeType: this.formato })
    gravador.ondataavailable = (e) => {
      if (e.data.size > 0) this.pedacos.push(e.data)
    }
    gravador.start()
    this.gravador = gravador

    const inicio = Date.now()
    let falou = false
    let ultimaVoz = 0
    let quadrosDeVoz = 0
    let mexeu = false
    const amostras = this.analisador ? new Uint8Array(this.analisador.fftSize) : null
    let disparou = false
    const disparar = (f: () => void) => {
      if (disparou) return
      disparou = true
      this.pararRelogio()
      f()
    }

    this.relogio = setInterval(() => {
      const agora = Date.now()
      if (agora - inicio > DURACAO_MAXIMA_MS) return disparar(eventos.aoFimDaFala)
      if (!this.analisador || !amostras || this.medidorFunciona === false) return

      this.analisador.getByteTimeDomainData(amostras)
      let soma = 0
      for (const a of amostras) {
        const v = (a - 128) / 128
        soma += v * v
        if (a !== 128) mexeu = true
      }
      const nivel = Math.sqrt(soma / amostras.length)
      eventos.aoNivel?.(nivel)

      if (this.medidorFunciona === null && agora - inicio > TESTE_DO_MEDIDOR_MS) this.medidorFunciona = mexeu
      if (this.medidorFunciona === false) return

      if (nivel > LIMIAR_VOZ) {
        // Dois quadros seguidos (~100 ms): um estalo isolado não é fala.
        quadrosDeVoz++
        if (quadrosDeVoz >= 2) falou = true
        ultimaVoz = agora
      } else {
        quadrosDeVoz = 0
      }

      if (falou && agora - ultimaVoz > FIM_DA_FALA_MS) return disparar(eventos.aoFimDaFala)
      if (!falou && agora - inicio > SILENCIO_LONGO_MS) return disparar(eventos.aoSilencioLongo)
    }, 50)
  }

  /** Encerra o turno e devolve o áudio. `null` se não havia gravação. */
  async parar(): Promise<{ blob: Blob; mimeType: string } | null> {
    this.pararRelogio()
    const gravador = this.gravador
    this.gravador = null
    if (!gravador || gravador.state === 'inactive') return null
    // O último pedaço só chega depois do stop.
    await new Promise<void>((resolve) => {
      gravador.onstop = () => resolve()
      gravador.stop()
    })
    if (this.pedacos.length === 0) return null
    return { blob: new Blob(this.pedacos, { type: gravador.mimeType }), mimeType: gravador.mimeType }
  }

  /** Para sem devolver nada (pedido de ajuda, resposta digitada, silêncio). */
  descartar(): void {
    this.pararRelogio()
    if (this.gravador && this.gravador.state !== 'inactive') {
      this.gravador.ondataavailable = null
      this.gravador.stop()
    }
    this.gravador = null
    this.pedacos = []
  }

  fechar(): void {
    this.descartar()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.contexto?.close().catch(() => {})
    this.stream = null
    this.contexto = null
    this.analisador = null
  }

  private pararRelogio() {
    if (this.relogio) clearInterval(this.relogio)
    this.relogio = null
  }
}

export function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não consegui ler a gravação.'))
    // "data:audio/webm;base64,XXXX" — só a cauda interessa.
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] ?? '')
    leitor.readAsDataURL(blob)
  })
}
