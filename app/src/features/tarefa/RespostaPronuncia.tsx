import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Mic, Square } from 'lucide-react'
import type { FeedbackLocal, QuestaoTarefa } from './tipos'
import { BOTAO_CHUNKY } from './estilo'

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
 * Navegador primeiro, Gemini de reserva — e cada aparelho aprende qual serve.
 *
 * Histórico: em 13/08/2026 o celular deixou de usar o `SpeechRecognition`
 * porque, em parte dos aparelhos, o microfone é exclusivo: reconhecedor e
 * gravação disputam o mesmo mic e um deles recebe silêncio. Só que isso
 * mandava TODA leitura de celular para o Gemini — pago, e lento no 4G.
 *
 * Agora (29/09/2026) todo aparelho começa pelo caminho do computador:
 * reconhecedor e gravação juntos, e o servidor só transcreve quando o
 * navegador não entendeu. Onde os dois convivem, a nota sai na hora e de
 * graça. Onde não convivem, o navegador falha com som entrando no microfone
 * (ou com erro de captura/rede) — e depois de FALHAS_PARA_DESISTIR falhas
 * seguidas o aparelho passa a só gravar, lembrado no localStorage. Um acerto
 * do navegador zera a contagem.
 *
 * A marca vence em VALIDADE_SO_GRAVACAO_MS: cada leitura no modo só gravação
 * é uma chamada paga ao Gemini, e navegador atualizado pode ter passado a dar
 * conta. Vencida, o aparelho volta a tentar o caminho grátis.
 */
/**
 * O celular continua só gravando (decisão de 13/08/2026, reafirmada em
 * 29/09/2026): ligar o reconhecedor junto no celular, para economizar o
 * Gemini, fez o microfone parar de funcionar em produção — a disputa pelo mic
 * que motivou a decisão original. O aprendizado por aparelho abaixo vale para
 * o computador, onde os dois convivem.
 *
 * `maxTouchPoints` em vez de user agent: string de UA mente, número de pontos
 * de toque não.
 */
function ehCelular(): boolean {
  if (typeof navigator === 'undefined') return false
  const toques = navigator.maxTouchPoints ?? 0
  return toques > 1 && window.matchMedia('(pointer: coarse)').matches
}

const CHAVE_SO_GRAVACAO = 'pronuncia:so-gravacao-ate'
const VALIDADE_SO_GRAVACAO_MS = 7 * 24 * 60 * 60 * 1000
const CHAVE_FALHAS = 'pronuncia:falhas-do-navegador'
const FALHAS_PARA_DESISTIR = 2
/** Erros do motor que indicam "este aparelho não serve", não "o aluno não falou". */
const ERROS_DE_APARELHO = new Set(['audio-capture', 'network'])

function lerLocal(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravarLocal(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // Sem storage (aba anônima): o aparelho só não lembra entre visitas.
  }
}

/** Neste aparelho, pular o reconhecedor do navegador e ir direto de gravação? */
function soGravacaoNesteAparelho(): boolean {
  if (ehCelular() || criarReconhecedor() === null) return true
  return Number(lerLocal(CHAVE_SO_GRAVACAO) ?? '0') > Date.now()
}

/** Devolve true quando o aparelho acabou de passar para "só gravação". */
function registrarTentativaDoNavegador(entendeu: boolean, falhaDeAparelho: boolean): boolean {
  if (entendeu) {
    gravarLocal(CHAVE_FALHAS, '0')
    return false
  }
  if (!falhaDeAparelho) return false
  const falhas = Number(lerLocal(CHAVE_FALHAS) ?? '0') + 1
  gravarLocal(CHAVE_FALHAS, String(falhas))
  if (falhas < FALHAS_PARA_DESISTIR) return false
  gravarLocal(CHAVE_SO_GRAVACAO, String(Date.now() + VALIDADE_SO_GRAVACAO_MS))
  gravarLocal(CHAVE_FALHAS, '0')
  return true
}

/** Formatos que o MediaRecorder produz por navegador, em ordem de preferência. */
const FORMATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
/** Teto de segurança — o fim normal é o silêncio, abaixo. */
const DURACAO_MAXIMA_MS = 30_000

/**
 * Fim da fala detectado pelo volume do microfone.
 *
 * No modo só gravação não há reconhecedor para dizer "a frase acabou", e sem
 * isto a gravação ia até o aluno tocar em "Terminei" — ou até o teto de 30s, que
 * somado à transcrição no servidor dava quase um minuto de espera.
 *
 *  - SILENCIO_FIM_MS: pausa depois da fala que encerra. 3s dá folga a quem
 *    lê devagar ou hesita no meio da frase — cortar a leitura no meio custa
 *    mais caro que esperar um pouco mais.
 *  - FALA_MINIMA_MS: um estalo ou uma tosse não conta como "já falou".
 *  - SEM_FALA_MS: ninguém falou — encerra e mostra "não te ouvi" em vez de
 *    esperar os 30s.
 */
const SILENCIO_FIM_MS = 3_000
const FALA_MINIMA_MS = 300
const SEM_FALA_MS = 7_000
/** Se o reconhecedor do navegador não fechar depois do `stop()`, fechamos nós. */
const ESPERA_RECONHECEDOR_MS = 3_000

/**
 * O contexto de áudio precisa nascer DENTRO do toque do aluno. Criado depois
 * de um `await` (a permissão do microfone), o Safari do iPhone o deixa
 * suspenso — e o medidor de volume leria silêncio para sempre.
 */
function criarContextoDeAudio(): AudioContext | null {
  const janela = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Classe = janela.AudioContext ?? janela.webkitAudioContext
  if (!Classe) return null
  try {
    const contexto = new Classe()
    void contexto.resume()
    return contexto
  } catch {
    return null
  }
}

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
  const [soGravacao, setSoGravacao] = useState(soGravacaoNesteAparelho)
  // Sem reconhecedor E sem gravação não há o que fazer; com um dos dois, há.
  const [semSuporte] = useState(() => criarReconhecedor() === null && formatoSuportado() === null)
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
  /**
   * O medidor está VIVO — já leu alguma variação na onda? Microfone de verdade
   * nunca dá silêncio perfeito (há sempre ruído de fundo); onda cravada em 128
   * é medidor sem sinal (contexto suspenso no iPhone, mic tomado por outro).
   * Sem medidor vivo, `houveSomRef` não prova nada, e nem o fim automático
   * nem a trava de silêncio podem agir.
   */
  const medidorAtivoRef = useRef(false)
  const erroDoMotorRef = useRef<string | null>(null)
  const finalizadoRef = useRef(false)
  const pararTimeoutRef = useRef<number | undefined>(undefined)
  const forcarFimRef = useRef<number | undefined>(undefined)
  const contextoRef = useRef<AudioContext | null>(null)

  // Soltar microfone e reconhecedor ao desmontar: sem isto o indicador de
  // gravação do navegador fica aceso depois que o aluno passa de questão.
  useEffect(() => {
    return () => {
      clearTimeout(pararTimeoutRef.current)
      clearTimeout(forcarFimRef.current)
      recRef.current?.abort()
      gravadorRef.current?.stream.getTracks().forEach((t) => t.stop())
      void contextoRef.current?.close()
    }
  }, [])

  function comecar() {
    setErro(null)
    setNaoOuvi(false)
    transcricaoRef.current = ''
    parcialRef.current = ''
    erroDoMotorRef.current = null
    houveSomRef.current = false
    medidorAtivoRef.current = false
    finalizadoRef.current = false
    pedacosRef.current = []
    // Síncrono, ainda dentro do toque — ver criarContextoDeAudio().
    void contextoRef.current?.close()
    contextoRef.current = criarContextoDeAudio()

    // Aparelho onde o navegador não dá conta: nada de reconhecedor. Gravamos
    // com o microfone só para nós e o servidor transcreve — ver
    // soGravacaoNesteAparelho() para o porquê.
    if (soGravacao) {
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
      // Configuração padrão de propósito: forçar mono/redução de ruído/bitrate
      // baixo (29/09/2026) coincidiu com o celular passar a mandar áudio que o
      // Gemini não transcrevia. O áudio de uma frase já é pequeno sem isso.
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
   * Escuta o nível do microfone para duas coisas:
   *
   *  - saber se ENTROU SOM — o que separa "você ficou em silêncio" de "ouvi
   *    você falar, mas não transcrevi", dois problemas com soluções opostas;
   *  - perceber que a fala ACABOU e parar sozinho (ver SILENCIO_FIM_MS).
   *
   * "Voz" é volume acima do ruído de fundo, que vai sendo aprendido enquanto
   * ninguém fala: um limiar fixo cortaria quem fala baixo numa sala silenciosa
   * e nunca pararia numa sala barulhenta.
   */
  function monitorarNivel(stream: MediaStream) {
    const contexto = contextoRef.current
    if (!contexto) return
    try {
      const analisador = contexto.createAnalyser()
      analisador.fftSize = 512
      contexto.createMediaStreamSource(stream).connect(analisador)

      const amostras = new Uint8Array(analisador.fftSize)
      const inicio = performance.now()
      // De novo agora que o microfone abriu: no iPhone o contexto pode ter
      // sido interrompido na troca para o modo de gravação.
      void contexto.resume()
      let piso = 0.01
      let vozDesde = 0
      let ultimaVoz = 0

      const medir = () => {
        if (finalizadoRef.current) return
        analisador.getByteTimeDomainData(amostras)

        let soma = 0
        let pico = 0
        for (const amostra of amostras) {
          const desvio = amostra - 128
          if (desvio !== 0) medidorAtivoRef.current = true
          soma += desvio * desvio
          pico = Math.max(pico, Math.abs(desvio))
        }
        // 128 é o silêncio na onda; pico acima de 6 já é som, não ruído elétrico.
        if (pico > 6) houveSomRef.current = true

        const nivel = Math.sqrt(soma / amostras.length) / 128
        const agora = performance.now()
        if (nivel > Math.max(0.02, piso * 3)) {
          if (!vozDesde) vozDesde = agora
          ultimaVoz = agora
        } else {
          piso = piso * 0.95 + nivel * 0.05
        }

        const falou = vozDesde > 0 && ultimaVoz - vozDesde >= FALA_MINIMA_MS
        if (falou && agora - ultimaVoz > SILENCIO_FIM_MS) return parar()
        // Só com medidor vivo: medidor mudo não é aluno calado, e parar aqui
        // cortaria quem está lendo.
        if (!falou && medidorAtivoRef.current && agora - inicio > SEM_FALA_MS) return parar()

        requestAnimationFrame(medir)
      }
      requestAnimationFrame(medir)
    } catch {
      // Sem Web Audio perdemos o diagnóstico e o fim automático — sobra o
      // botão "Terminei" e o teto de 30s. A resposta não se perde.
    }
  }

  function parar() {
    clearTimeout(pararTimeoutRef.current)
    // Sem reconhecedor não há `onend` para disparar, então fechamos na mão.
    if (soGravacao) {
      void finalizar()
      return
    }
    // `stop()` dispara `onend`, que chama finalizar() — não duplicamos aqui.
    recRef.current?.stop()
    // ...a não ser que o `onend` não venha: o motor do Chrome depende dos
    // servidores do Google e às vezes fica pendurado depois do stop. Aí
    // fechamos com o que houver (parcial ou áudio para o servidor).
    forcarFimRef.current = setTimeout(() => void finalizar(), ESPERA_RECONHECEDOR_MS)
  }

  async function finalizar() {
    // `onend` pode disparar mais de uma vez (fim natural + stop manual); sem
    // esta trava a resposta seria enviada duas vezes.
    if (finalizadoRef.current) return
    finalizadoRef.current = true

    clearTimeout(pararTimeoutRef.current)
    clearTimeout(forcarFimRef.current)
    recRef.current?.abort()
    void contextoRef.current?.close()
    contextoRef.current = null
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

    if (!soGravacao) {
      // Silêncio de verdade não pesa contra o aparelho; som que entrou e não
      // virou texto, ou erro de captura/rede, pesa.
      const falhaDeAparelho =
        houveSomRef.current || ERROS_DE_APARELHO.has(erroDoMotorRef.current ?? '')
      if (registrarTentativaDoNavegador(ouvido !== '', falhaDeAparelho)) setSoGravacao(true)
    }

    // Nada entrou no microfone (e o medidor estava de pé para saber): mandar o
    // áudio para o servidor seria pagar o Gemini para transcrever silêncio.
    if (ouvido === '' && medidorAtivoRef.current && !houveSomRef.current) {
      setProcessando(false)
      setNaoOuvi(true)
      return
    }

    // Sem transcrição E sem áudio não sobra nada nem para o servidor tentar.
    // (No modo só gravação `ouvido` é sempre vazio de propósito: quem
    // transcreve é o servidor, a partir do áudio.)
    if (ouvido === '' && !audioBase64) {
      setProcessando(false)
      setNaoOuvi(true)
      return
    }

    // Segue processando enquanto o servidor transcreve — quando o navegador
    // não entendeu, leva alguns segundos.
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
      <p className="rounded-2xl border-2 border-neutral-200 bg-white px-5 py-5 text-center text-xl font-extrabold leading-relaxed text-neutral-900 md:text-2xl">
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
            className={`${BOTAO_CHUNKY} mt-3 w-full border-neutral-950 bg-neutral-900 py-4 text-base text-white`}
          >
            <Mic className="h-4 w-4" /> Tentar de novo
          </button>
          {/* Saída secundária, mas visível: quem chega aqui já tentou e
              falhou, e um link cinza-claro no rodapé passava batido. */}
          <button
            onClick={seguirSemGravar}
            className={`${BOTAO_CHUNKY} mt-3 w-full border-neutral-200 bg-white py-3 text-sm text-neutral-600 hover:bg-neutral-50`}
          >
            Não estou conseguindo — seguir mesmo assim
          </button>
        </>
      )}

      {!feedback && !semSuporte && !naoOuvi && (
        <>
          {processando ? (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-neutral-100 py-4 text-base font-bold text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o que você falou...
            </p>
          ) : gravando ? (
            <button
              onClick={parar}
              className={`${BOTAO_CHUNKY} mt-4 w-full border-rose-800 bg-rose-600 py-4 text-base text-white`}
            >
              <Square className="h-4 w-4 fill-current" /> Terminei de ler
            </button>
          ) : (
            <button
              onClick={comecar}
              className={`${BOTAO_CHUNKY} mt-4 w-full border-neutral-950 bg-neutral-900 py-4 text-base text-white`}
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
          className={`${BOTAO_CHUNKY} mt-4 w-full border-neutral-200 bg-white py-3.5 text-base text-neutral-800 hover:bg-neutral-50`}
        >
          <Mic className="h-4 w-4" /> Tentar de novo
        </button>
      )}
    </div>
  )
}
