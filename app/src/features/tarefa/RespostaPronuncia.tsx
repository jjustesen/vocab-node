import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Mic, Square } from 'lucide-react'
import type { FeedbackLocal, QuestaoTarefa } from './tipos'

/**
 * `SpeechRecognition` não está na lib DOM do TypeScript — o tipo mínimo que
 * usamos fica aqui, em vez de um `any` solto.
 */
type ResultadoFala = ArrayLike<{ transcript: string }> & { isFinal: boolean }

type Reconhecedor = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { results: ArrayLike<ResultadoFala> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

/**
 * Só os erros que o aluno consegue resolver viram mensagem. `no-speech` e
 * `aborted` ficam de fora de propósito: viram o estado "não te ouvi", que já
 * explica melhor e oferece o botão de tentar de novo.
 */
const MENSAGEM_POR_ERRO: Record<string, string> = {
  'not-allowed': 'O microfone está bloqueado para este site. Libere nas permissões do navegador e tente de novo.',
  'service-not-allowed':
    'O microfone está bloqueado para este site. Libere nas permissões do navegador e tente de novo.',
  'audio-capture': 'Não encontrei um microfone disponível. Feche outros apps que possam estar usando o microfone.',
  network: 'A conexão caiu durante a leitura — o reconhecimento de fala precisa de internet. Tente de novo.',
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
  // Parciais ligados como REDE: em celular é comum o motor entregar o que
  // entendeu aos pedaços e nunca fechar o resultado final (a leitura acaba, o
  // aluno toca em "terminei", a rede oscila). Sem guardar o parcial, tudo isso
  // virava transcrição vazia mesmo com o aluno tendo lido certo.
  rec.interimResults = true
  rec.maxAlternatives = 1
  return rec
}

/**
 * No celular NÃO usamos o `SpeechRecognition` (decisão de 13/08/2026).
 *
 * Dois motivos, os dois medidos em uso real: o microfone costuma ser recurso
 * exclusivo no aparelho, então a gravação e o reconhecedor disputam o mesmo
 * mic e o segundo recebe silêncio; e o motor do Chrome depende de mandar áudio
 * para servidores do Google, o que 4G instável derruba. Gravar é confiável em
 * qualquer aparelho — então gravamos e o servidor transcreve
 * (_shared/ia/transcricao.ts). Custa uma chamada de IA por leitura no celular,
 * e é o preço de a nota parar de depender da sorte.
 *
 * `maxTouchPoints` em vez de user agent: string de UA mente, número de pontos
 * de toque não.
 */
function ehCelular(): boolean {
  if (typeof navigator === 'undefined') return false
  const toques = navigator.maxTouchPoints ?? 0
  return toques > 1 && window.matchMedia('(pointer: coarse)').matches
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
  /** Devolve `ouviu: false` quando nem o navegador nem o servidor entenderam nada. */
  aoFalar: (
    transcricao: string,
    audioBase64: string | null,
    mimeType: string | null,
    desistiu?: boolean,
  ) => Promise<{ ouviu: boolean }>
  /** Limpa o feedback no pai para que a leitura possa recomeçar. */
  aoTentarNovamente: () => void
}) {
  const [gravando, setGravando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [noCelular] = useState(ehCelular)
  // No celular o motor do navegador nem entra em campo, então "sem suporte"
  // passa a significar só "não dá para gravar" — aí sim não há o que fazer.
  const [semSuporte] = useState(() => (ehCelular() ? formatoSuportado() === null : criarReconhecedor() === null))
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
  /** Último resultado PARCIAL — vale como resposta quando o final nunca chega. */
  const parcialRef = useRef('')
  /** Entrou som no microfone? Separa silêncio real de falha do motor. */
  const houveSomRef = useRef(false)
  const erroDoMotorRef = useRef<string | null>(null)
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

  function comecar() {
    setErro(null)
    setNaoOuvi(false)
    transcricaoRef.current = ''
    parcialRef.current = ''
    erroDoMotorRef.current = null
    houveSomRef.current = false
    finalizadoRef.current = false
    pedacosRef.current = []

    // Celular: nada de reconhecedor. Gravamos com o microfone só para nós e o
    // servidor transcreve — ver ehCelular() para o porquê.
    if (noCelular) {
      setGravando(true)
      pararTimeoutRef.current = setTimeout(parar, DURACAO_MAXIMA_MS)
      void iniciarGravacao()
      return
    }

    const rec = criarReconhecedor()
    if (!rec) {
      setErro('Este navegador não avalia fala. Tente pelo Chrome, Edge ou Safari.')
      return
    }

    recRef.current = rec
    rec.onresult = (e) => {
      // Percorre TODOS os segmentos: o motor pode quebrar a leitura em vários
      // pedaços, e ler só `results[0]` jogava fora o resto da frase — nota
      // baixa em leitura correta.
      let finais = ''
      for (let i = 0; i < e.results.length; i++) {
        const resultado = e.results[i]
        const texto = resultado[0]?.transcript ?? ''
        if (resultado.isFinal) finais += `${texto} `
        else if (texto.trim()) parcialRef.current = texto.trim()
      }
      if (finais.trim()) transcricaoRef.current = finais.trim()
    }
    rec.onerror = (e) => {
      erroDoMotorRef.current = e.error
      const mensagem = MENSAGEM_POR_ERRO[e.error]
      if (mensagem) setErro(mensagem)
    }
    rec.onend = () => void finalizar()

    // `start()` SÍNCRONO, ainda dentro do toque que chamou esta função. Antes
    // ele vinha depois de um `await getUserMedia`, e é aí que quebrava no
    // celular: a permissão de microfone vale enquanto dura a "ativação por
    // gesto", que o await já tinha consumido. No iOS isso derruba a leitura
    // inteira sem erro visível.
    try {
      rec.start()
    } catch {
      setErro('Não consegui iniciar o microfone. Tente de novo.')
      return
    }
    setGravando(true)
    pararTimeoutRef.current = setTimeout(parar, DURACAO_MAXIMA_MS)

    // A gravação corre por fora e nunca derruba o reconhecimento: ela existe
    // para o professor ouvir depois, a nota depende só da transcrição.
    void iniciarGravacao()
  }

  /** MediaRecorder em paralelo — opcional, e falha em silêncio de propósito. */
  async function iniciarGravacao() {
    const formato = formatoSuportado()
    if (!formato) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // O aluno pode ter terminado de ler enquanto a permissão era resolvida.
      if (finalizadoRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      monitorarNivel(stream)

      const gravador = new MediaRecorder(stream, { mimeType: formato })
      gravadorRef.current = gravador
      gravador.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data)
      }
      gravador.start()
    } catch {
      // Sem gravação seguimos só com a transcrição — o professor perde o
      // áudio, o aluno não perde a resposta.
    }
  }

  /**
   * Escuta o nível do microfone só para saber se ENTROU SOM. É o que separa
   * "você ficou em silêncio" de "ouvi você falar, mas o motor não transcreveu"
   * — dois problemas com soluções opostas, e até agora indistinguíveis na tela.
   */
  function monitorarNivel(stream: MediaStream) {
    try {
      const contexto = new AudioContext()
      const analisador = contexto.createAnalyser()
      analisador.fftSize = 512
      contexto.createMediaStreamSource(stream).connect(analisador)

      const amostras = new Uint8Array(analisador.fftSize)
      const medir = () => {
        if (finalizadoRef.current) {
          void contexto.close()
          return
        }
        analisador.getByteTimeDomainData(amostras)
        // 128 é o silêncio na onda; desvio acima de 6 já é voz, não ruído de fundo.
        for (const amostra of amostras) {
          if (Math.abs(amostra - 128) > 6) {
            houveSomRef.current = true
            break
          }
        }
        requestAnimationFrame(medir)
      }
      requestAnimationFrame(medir)
    } catch {
      // Sem Web Audio perdemos só o diagnóstico, não a resposta.
    }
  }

  function parar() {
    clearTimeout(pararTimeoutRef.current)
    // No celular não há reconhecedor para disparar `onend`, então fechamos na mão.
    if (noCelular) {
      void finalizar()
      return
    }
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

    // Sem resultado final, vale o parcial: o motor entendeu alguma coisa e só
    // não fechou — jogar isso fora era transformar leitura boa em nota zero.
    const ouvido = transcricaoRef.current.trim() || parcialRef.current.trim()

    // Sem transcrição E sem áudio não sobra nada nem para o servidor tentar.
    // (No celular `ouvido` é sempre vazio de propósito: quem transcreve é o
    // servidor, a partir do áudio.)
    if (ouvido === '' && !audioBase64) {
      setProcessando(false)
      setNaoOuvi(true)
      return
    }

    // Segue processando enquanto o servidor transcreve — no celular esse é o
    // caminho normal e leva alguns segundos.
    const { ouviu } = await aoFalar(ouvido, audioBase64, formato)
    setProcessando(false)
    if (!ouviu) setNaoOuvi(true)
  }

  /** Regravar: o servidor faz upsert da resposta e do áudio, então repetir é seguro. */
  function tentarDeNovo() {
    aoTentarNovamente()
    comecar()
  }

  /**
   * Saída de emergência para quem não consegue ser ouvido de jeito nenhum
   * (microfone quebrado, navegador sem motor). Sem ela a atividade fica
   * impossível de concluir — o servidor exige resposta para toda questão.
   */
  function seguirSemGravar() {
    setNaoOuvi(false)
    // `desistiu` é o que impede isto de virar laço: sem a flag, o pai devolveria
    // "não ouvi" de novo e a tela voltaria para o mesmo aviso, sem saída.
    void aoFalar('', null, null, true)
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
              {houveSomRef.current ? (
                <>
                  <b className="block text-sm font-extrabold">Ouvi você, mas não entendi as palavras</b>
                  O som chegou, só não deu para transcrever — costuma ser conexão instável ou ruído em
                  volta. Tente num lugar mais silencioso; isto não conta como erro.
                </>
              ) : (
                <>
                  <b className="block text-sm font-extrabold">Não consegui te ouvir</b>
                  Nada chegou no microfone. Confira se ele está liberado para o site e se nenhum outro app
                  está usando — isto não conta como erro.
                </>
              )}
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
