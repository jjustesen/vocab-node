import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Mic, Square, Volume2 } from 'lucide-react'
import type { FeedbackLocal, QuestaoTarefa } from './tipos'

/**
 * Fala a frase com o sintetizador do próprio navegador.
 *
 * Decisão de 26/07/2026: não geramos nem guardamos áudio. A frase já viaja
 * para o cliente em `resposta_correta` (CONTRATO-QUESTOES.md §7), então o
 * `speechSynthesis` resolve sem bucket, sem TTS pago e sem URL assinada. O
 * preço é a voz variar por aparelho — e, em aparelho sem voz em inglês, não
 * haver voz nenhuma. Daí o caminho de degradação logo abaixo.
 */
function vozEmIngles(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices()
  return vozes.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? null
}

export function BotaoOuvir({ frase }: { frase: string }) {
  const [falando, setFalando] = useState(false)
  const [semVoz, setSemVoz] = useState(false)
  const [revelada, setRevelada] = useState(false)

  // A lista de vozes chega assíncrona no Chrome: na primeira renderização ela
  // costuma vir vazia, e só depois de `voiceschanged` é que dá para saber se
  // existe voz em inglês. Sem esperar por isso, todo aparelho parece "sem voz".
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setSemVoz(true)
      return
    }
    const conferir = () => setSemVoz(window.speechSynthesis.getVoices().length > 0 && !vozEmIngles())
    conferir()
    window.speechSynthesis.addEventListener('voiceschanged', conferir)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', conferir)
      window.speechSynthesis.cancel()
    }
  }, [])

  function falar() {
    if (!('speechSynthesis' in window)) return setSemVoz(true)
    window.speechSynthesis.cancel()

    const fala = new SpeechSynthesisUtterance(frase)
    fala.lang = 'en-US'
    // Um pouco mais devagar que o padrão: é material de estudo, e o aluno
    // precisa distinguir palavra por palavra para conseguir ordenar.
    fala.rate = 0.85
    const voz = vozEmIngles()
    if (voz) fala.voice = voz
    fala.onstart = () => setFalando(true)
    fala.onend = () => setFalando(false)
    fala.onerror = () => {
      setFalando(false)
      setSemVoz(true)
    }
    window.speechSynthesis.speak(fala)
  }

  if (semVoz) {
    return (
      <div className="rounded-2xl bg-amber-50 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Este aparelho não tem voz em inglês instalada.
        </p>
        {/* Sem áudio o exercício seria impossível. Em vez de travar o aluno,
            viramos um "ordenar palavras" com a frase à vista — ele ainda
            pratica a ordem, só perde a parte de escuta. */}
        {revelada ? (
          <p className="mt-2 text-sm font-bold text-amber-900">{frase}</p>
        ) : (
          <button
            onClick={() => setRevelada(true)}
            className="mt-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-extrabold text-white"
          >
            Ler a frase em vez de ouvir
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={falar}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-100 py-4 text-sm font-extrabold text-indigo-900 transition active:scale-[0.99]"
    >
      <Volume2 className={`h-5 w-5 ${falando ? 'animate-pulse' : ''}`} />
      {falando ? 'Falando...' : 'Ouvir a frase'}
    </button>
  )
}

/** Formatos que o MediaRecorder produz por navegador, em ordem de preferência. */
const FORMATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
const DURACAO_MAXIMA_MS = 30_000

function formatoSuportado(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f)) ?? null
}

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não foi possível ler a gravação.'))
    // readAsDataURL devolve "data:audio/webm;base64,XXXX" — só a cauda interessa.
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] ?? '')
    leitor.readAsDataURL(blob)
  })
}

/**
 * Leitura em voz alta. É o ÚNICO tipo em que a tela espera o servidor: a nota
 * vem da IA, com chave de API, então não há como corrigir no navegador como nos
 * outros tipos (CONTRATO-QUESTOES.md §7).
 */
export function RespostaPronuncia({
  questao,
  feedback,
  aoEnviarAudio,
}: {
  questao: QuestaoTarefa
  feedback: FeedbackLocal | null
  aoEnviarAudio: (audioBase64: string, mimeType: string) => Promise<void>
}) {
  const [gravando, setGravando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const gravadorRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const pararTimeoutRef = useRef<number | undefined>(undefined)

  // Soltar o microfone ao desmontar: sem isso o indicador de gravação do
  // navegador fica aceso depois que o aluno passa para a próxima questão.
  useEffect(() => {
    return () => {
      clearTimeout(pararTimeoutRef.current)
      gravadorRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function comecar() {
    setErro(null)
    const formato = formatoSuportado()
    if (!formato) {
      setErro('Este navegador não consegue gravar áudio. Tente pelo Chrome ou Safari atualizado.')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Não distinguimos "negou" de "não tem microfone" porque o navegador não
      // deixa: a mensagem cobre os dois sem chutar qual foi.
      setErro('Não consegui acessar o microfone. Autorize o acesso e tente de novo.')
      return
    }

    const gravador = new MediaRecorder(stream, { mimeType: formato })
    gravadorRef.current = gravador
    pedacosRef.current = []

    gravador.ondataavailable = (e) => {
      if (e.data.size > 0) pedacosRef.current.push(e.data)
    }
    gravador.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      setGravando(false)
      const blob = new Blob(pedacosRef.current, { type: formato })
      if (blob.size === 0) {
        setErro('A gravação saiu vazia. Tente de novo.')
        return
      }
      setEnviando(true)
      try {
        await aoEnviarAudio(await blobParaBase64(blob), formato)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível enviar a gravação.')
      } finally {
        setEnviando(false)
      }
    }

    gravador.start()
    setGravando(true)
    // Trava de duração: o limite de tamanho existe também no servidor, mas
    // cortar aqui evita o aluno gravar 3 minutos e só então levar 413.
    pararTimeoutRef.current = setTimeout(parar, DURACAO_MAXIMA_MS)
  }

  function parar() {
    clearTimeout(pararTimeoutRef.current)
    if (gravadorRef.current?.state === 'recording') gravadorRef.current.stop()
  }

  return (
    <div>
      {/* A frase-alvo é o conteúdo da questão aqui, não gabarito escondido:
          o aluno precisa vê-la para poder lê-la. */}
      <p className="rounded-2xl bg-neutral-100 px-4 py-4 text-center text-lg font-extrabold text-neutral-900">
        {questao.resposta_correta}
      </p>

      {erro && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {erro}
        </p>
      )}

      {!feedback && (
        <>
          {enviando ? (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-full bg-neutral-100 py-4 text-sm font-bold text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Ouvindo sua gravação...
            </p>
          ) : gravando ? (
            <button
              onClick={parar}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-rose-600 py-4 text-sm font-extrabold text-white"
            >
              <Square className="h-4 w-4 fill-current" /> Parar e enviar
            </button>
          ) : (
            <button
              onClick={comecar}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-4 text-sm font-extrabold text-white"
            >
              <Mic className="h-4 w-4" /> Gravar minha leitura
            </button>
          )}
          <p className="mt-2 text-center text-xs text-neutral-400">
            {gravando ? 'Leia a frase em voz alta. Até 30 segundos.' : 'Toque, leia a frase e toque de novo para enviar.'}
          </p>
        </>
      )}
    </div>
  )
}
