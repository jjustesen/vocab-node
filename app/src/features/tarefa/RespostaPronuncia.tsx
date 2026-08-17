import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Mic, Square } from 'lucide-react'
import type { FeedbackLocal, QuestaoTarefa } from './tipos'

/**
 * `SpeechRecognition` não está na lib DOM do TypeScript — o tipo mínimo que
 * usamos fica aqui, em vez de um `any` solto.
 */
type Reconhecedor = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function criarReconhecedor(): Reconhecedor | null {
  const janela = window as unknown as {
    SpeechRecognition?: new () => Reconhecedor
    webkitSpeechRecognition?: new () => Reconhecedor
  }
  const Classe = janela.SpeechRecognition ?? janela.webkitSpeechRecognition
  if (!Classe) return null
  const rec = new Classe()
  rec.lang = 'en-US'
  // `continuous` false encerra sozinho na pausa do fim da frase — como a tarefa
  // é ler UMA frase, isso poupa o aluno de ter que parar manualmente.
  rec.continuous = false
  rec.interimResults = false
  rec.maxAlternatives = 1
  return rec
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
 * Leitura em voz alta, avaliada NO NAVEGADOR.
 *
 * Duas coisas rodam ao mesmo tempo sobre o mesmo microfone, de propósito:
 *  - `SpeechRecognition` transcreve — é dela que sai a nota (decisão de
 *    26/07/2026: custo zero no lugar de uma chamada paga por gravação);
 *  - `MediaRecorder` grava — é dele que sai o áudio que o professor ouve
 *    depois, porque a API de reconhecimento devolve texto e nunca o áudio.
 *
 * O que isto mede é se o reconhecedor ENTENDEU o aluno, não a qualidade
 * fonética dele: o motor tem modelo de linguagem e puxa para o inglês
 * plausível. Trocamos precisão por custo zero de olhos abertos — ver README.
 */
export function RespostaPronuncia({
  questao,
  feedback,
  aoFalar,
  aoTentarNovamente,
}: {
  questao: QuestaoTarefa
  feedback: FeedbackLocal | null
  aoFalar: (transcricao: string, audioBase64: string | null, mimeType: string | null) => void
  /** Limpa o feedback no pai para que a leitura possa recomeçar. */
  aoTentarNovamente: () => void
}) {
  const [gravando, setGravando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [semSuporte] = useState(() => criarReconhecedor() === null)
  /**
   * Reconhecedor não devolveu palavra nenhuma. Estado à parte de propósito:
   * antes isso virava transcrição vazia → nota 0, indistinguível de quem leu
   * tudo errado, e o aluno via "0/100" sem uma palavra de explicação. Silêncio
   * não é resposta: não grava nada e não queima a questão.
   */
  const [naoOuvi, setNaoOuvi] = useState(false)

  const recRef = useRef<Reconhecedor | null>(null)
  const gravadorRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const transcricaoRef = useRef('')
  const finalizadoRef = useRef(false)
  const pararTimeoutRef = useRef<number | undefined>(undefined)

  // Soltar microfone e reconhecedor ao desmontar: sem isto o indicador de
  // gravação do navegador fica aceso depois que o aluno passa de questão.
  useEffect(() => {
    return () => {
      clearTimeout(pararTimeoutRef.current)
      recRef.current?.abort()
      gravadorRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function comecar() {
    setErro(null)
    setNaoOuvi(false)
    transcricaoRef.current = ''
    finalizadoRef.current = false
    pedacosRef.current = []

    const rec = criarReconhecedor()
    if (!rec) {
      setErro('Este navegador não avalia fala. Tente pelo Chrome, Edge ou Safari.')
      return
    }

    // O MediaRecorder é OPCIONAL: sem ele o professor perde a gravação, mas o
    // aluno ainda responde — a nota depende só da transcrição.
    const formato = formatoSuportado()
    if (formato) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const gravador = new MediaRecorder(stream, { mimeType: formato })
        gravadorRef.current = gravador
        gravador.ondataavailable = (e) => {
          if (e.data.size > 0) pedacosRef.current.push(e.data)
        }
        gravador.start()
      } catch {
        // Microfone negado derruba os dois caminhos — o reconhecedor também
        // precisa dele. Melhor falhar aqui, com mensagem, do que na metade.
        setErro('Não consegui acessar o microfone. Autorize o acesso e tente de novo.')
        return
      }
    }

    recRef.current = rec
    rec.onresult = (e) => {
      transcricaoRef.current = e.results?.[0]?.[0]?.transcript ?? ''
    }
    rec.onerror = (e) => {
      // `no-speech` é o caso comum de gravar silêncio: vira nota 0 pelo caminho
      // normal, não erro de tela. Os demais viram mensagem.
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setErro('O reconhecimento de fala falhou. Tente de novo.')
      }
    }
    rec.onend = () => void finalizar()

    rec.start()
    setGravando(true)
    pararTimeoutRef.current = setTimeout(parar, DURACAO_MAXIMA_MS)
  }

  function parar() {
    clearTimeout(pararTimeoutRef.current)
    // `stop()` dispara `onend`, que chama finalizar() — não duplicamos aqui.
    recRef.current?.stop()
  }

  async function finalizar() {
    // `onend` pode disparar mais de uma vez (fim natural + stop manual); sem
    // esta trava a resposta seria enviada duas vezes.
    if (finalizadoRef.current) return
    finalizadoRef.current = true

    clearTimeout(pararTimeoutRef.current)
    setGravando(false)
    setProcessando(true)

    const gravador = gravadorRef.current
    const formato = gravador?.mimeType ?? null
    let audioBase64: string | null = null

    if (gravador && gravador.state !== 'inactive') {
      // O último pedaço do áudio só chega depois do stop, então esperamos o
      // evento em vez de montar o Blob na hora (sairia truncado).
      await new Promise<void>((resolve) => {
        gravador.onstop = () => resolve()
        gravador.stop()
      })
    }
    gravador?.stream.getTracks().forEach((t) => t.stop())

    if (pedacosRef.current.length > 0 && formato) {
      try {
        audioBase64 = await blobParaBase64(new Blob(pedacosRef.current, { type: formato }))
      } catch {
        // Perder o áudio não pode custar a resposta do aluno.
        audioBase64 = null
      }
    }

    setProcessando(false)

    // Nada reconhecido: microfone mudo, ruído, `no-speech`, rede caída. Não
    // enviamos — sem isto o aluno leva 0/100 por um problema que não é dele.
    if (transcricaoRef.current.trim() === '') {
      setNaoOuvi(true)
      return
    }

    aoFalar(transcricaoRef.current, audioBase64, formato)
  }

  /** Regravar: o servidor faz upsert da resposta e do áudio, então repetir é seguro. */
  async function tentarDeNovo() {
    aoTentarNovamente()
    await comecar()
  }

  /**
   * Saída de emergência para quem não consegue ser ouvido de jeito nenhum
   * (microfone quebrado, navegador sem motor). Sem ela a atividade fica
   * impossível de concluir — o servidor exige resposta para toda questão.
   */
  function seguirSemGravar() {
    setNaoOuvi(false)
    aoFalar('', null, null)
  }

  return (
    <div>
      {/* A frase-alvo é o conteúdo da questão aqui, não gabarito escondido:
          o aluno precisa vê-la para poder lê-la. */}
      <p className="rounded-2xl bg-neutral-100 px-4 py-4 text-center text-lg font-extrabold text-neutral-900">
        {questao.resposta_correta}
      </p>

      {semSuporte && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Este navegador não avalia fala. Abra a tarefa pelo Chrome, Edge ou Safari para responder esta questão.
        </p>
      )}

      {erro && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {erro}
        </p>
      )}

      {naoOuvi && (
        <>
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-100 px-4 py-3 text-xs font-medium text-amber-900">
            <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <b className="block text-sm font-extrabold">Não consegui te ouvir</b>
              Nada chegou no microfone. Confira se ele está liberado para o site e tente de novo — isto
              não conta como erro.
            </span>
          </p>
          <button
            onClick={comecar}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-4 text-sm font-extrabold text-white"
          >
            <Mic className="h-4 w-4" /> Tentar de novo
          </button>
          <button onClick={seguirSemGravar} className="mt-3 w-full text-center text-xs font-bold text-neutral-400">
            Não estou conseguindo — seguir mesmo assim
          </button>
        </>
      )}

      {!feedback && !semSuporte && !naoOuvi && (
        <>
          {processando ? (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-full bg-neutral-100 py-4 text-sm font-bold text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o que você falou...
            </p>
          ) : gravando ? (
            <button
              onClick={parar}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-rose-600 py-4 text-sm font-extrabold text-white"
            >
              <Square className="h-4 w-4 fill-current" /> Terminei de ler
            </button>
          ) : (
            <button
              onClick={comecar}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-4 text-sm font-extrabold text-white"
            >
              <Mic className="h-4 w-4" /> Ler em voz alta
            </button>
          )}
          <p className="mt-2 text-center text-xs text-neutral-400">
            {gravando ? 'Leia a frase. Paro sozinho quando você terminar.' : 'Toque e leia a frase em inglês.'}
          </p>
        </>
      )}

      {/* Ler em voz alta é treino: repetir É o exercício. O servidor já grava
          por upsert (tarefa-pronuncia), então a última leitura simplesmente
          substitui a anterior, áudio incluído. */}
      {feedback && !semSuporte && (
        <button
          onClick={tentarDeNovo}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-neutral-200 bg-white py-3.5 text-sm font-extrabold text-neutral-900"
        >
          <Mic className="h-4 w-4" /> Tentar de novo
        </button>
      )}
    </div>
  )
}
