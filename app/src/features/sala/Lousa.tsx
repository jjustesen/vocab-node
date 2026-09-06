import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, Circle, Eraser, Pen, Square, Trash2, Type, Undo2 } from 'lucide-react'
import { useCanal, useSalaConectada } from './canal'
import {
  CORES,
  ehForma,
  encostou,
  ESPESSURAS,
  formaNova,
  larguraMaxima,
  NORMA,
  TAMANHOS,
  textoNovo,
  textoVazio,
  type Anotacao,
  type Ferramenta,
  type Forma,
  type MensagemAnotacao,
  type Ponto,
  type Texto,
  type Traco,
} from './anotacoes'
import type { ParticipanteId } from './estado-palco'

/**
 * A camada de anotação da sala — o que se deixa POR CIMA do palco.
 *
 * Não é um modo, é uma camada: cobre o que estiver no palco (lousa em branco,
 * PDF do aluno, imagem) sem substituir. Ver o cabeçalho de `estado-palco.ts`
 * para o porquê — é a diferença central entre este modelo e compartilhar tela.
 *
 * Duas ferramentas, e a segunda não é enfeite: a caneta serve para circular e
 * ligar, o teclado serve para o que precisa ser LIDO depois. Numa aula de
 * idioma, a correção feita à mão com trackpad fica ilegível justamente onde
 * ela mais importa — a conjugação certa, a palavra nova. Por isso texto aqui é
 * texto de verdade (DOM, fonte do sistema), e não traço.
 *
 * A sincronia sai pelo DATA CHANNEL do próprio LiveKit, a mesma conexão do
 * vídeo. Nenhum servidor, tabela ou canal novo: se a chamada está de pé, a
 * anotação está.
 *
 * O formato — quadro lógico, tamanho da letra em milésimos da altura, e a
 * regra de a anotação pertencer à PÁGINA — está em `anotacoes.ts`.
 *
 * ── Cada um na sua camada ───────────────────────────────────────────────────
 *
 * `limpar` apaga só o que EU deixei nesta página. Quando os dois estão
 * escrevendo no mesmo exercício, o professor apagar o rascunho do aluno no
 * meio da frase é acidente barato de evitar — e a regra vale para os dois
 * lados igual.
 *
 * A anotação é EFÊMERA: vive na memória das duas pontas enquanto a sala está
 * aberta. O que precisa sobreviver à aula é o documento (`Documento.tsx`), que
 * tem tabela própria.
 */

/** Um lote a cada ~80ms: o traço aparece do outro lado enquanto ainda está sendo feito, sem inundar o canal. */
const INTERVALO_ENVIO_MS = 80
/** Abaixo disto, arrastar um texto conta como clique para editar, e não como mudança de lugar. */
const ARRASTO_MINIMO = 6

export function Lousa({
  superficie,
  eu,
  podeAnotar,
}: {
  /** Em qual conteúdo do palco esta anotação nasce. Ver `superficieDo`. */
  superficie: string
  /** Quem está anotando — identidade, para "apagar o que EU fiz" ser por pessoa. */
  eu: ParticipanteId
  /**
   * Só o professor escreve por cima do palco.
   *
   * Em dupla, deixar os dois anotarem era barato e valia a pena. Em turma vira
   * outra coisa: cinco pessoas rabiscando o mesmo exercício ao mesmo tempo é
   * ruído, e a régua de "cada um na sua camada" só adia a bagunça. Quem não
   * pode anotar continua VENDO tudo, ao vivo — o que muda é quem escreve.
   */
  podeAnotar: boolean
}) {
  /**
   * A barra mora DENTRO do quadro e começa recolhida, como um botão pequeno no
   * canto. Recolhida ela não é só um enfeite escondido: a camada inteira sai do
   * caminho do ponteiro, e é isso que devolve o clique para o que está embaixo
   * — virar a página do PDF, por exemplo. "Minimizar" aqui quer dizer
   * literalmente "sair da frente".
   */
  const [querAberta, setQuerAberta] = useState(false)
  // Sem permissão a barra nem existe, e a camada some do caminho do ponteiro.
  const aberta = querAberta && podeAnotar
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camadaRef = useRef<HTMLDivElement>(null)

  /** TODAS as anotações, de todas as superfícies. O desenho filtra na hora. */
  const anotacoes = useRef<Anotacao[]>([])
  /** Pilha de ids meus, para o desfazer. */
  const meus = useRef<string[]>([])

  const [ferramenta, setFerramenta] = useState<Ferramenta>('caneta')
  const [cor, setCor] = useState<string>(CORES[0])
  const [espessura, setEspessura] = useState<number>(ESPESSURAS[0])
  const [tamanho, setTamanho] = useState<number>(TAMANHOS[0])

  /**
   * Os textos vivem no DOM, então precisam de estado de render — ao contrário
   * dos traços, que são pintados no canvas e podem ficar só na ref.
   */
  const [textos, setTextos] = useState<Texto[]>([])
  const [editando, setEditando] = useState<string | null>(null)

  const tracoAtual = useRef<Traco | null>(null)
  const formaAtual = useRef<Forma | null>(null)
  const apagando = useRef(false)
  const naoEnviados = useRef<Ponto[]>([])
  const ultimoEnvio = useRef(0)
  const arrasto = useRef<{ id: string; de: Ponto; inicial: Ponto; moveu: boolean } | null>(null)

  // A superfície atual numa ref também: o handler do canal é registrado uma
  // vez e precisa saber se a mensagem que chegou é da página que está na tela.
  const superficieRef = useRef(superficie)
  superficieRef.current = superficie

  const sincronizarTextos = useCallback(() => {
    setTextos(anotacoes.current.filter((a): a is Texto => a.tipo === 'texto'))
  }, [])

  // ── desenho dos traços ────────────────────────────────────────────────────

  const contexto = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current
    return canvas ? canvas.getContext('2d') : null
  }, [])

  const desenharTraco = useCallback(
    (ctx: CanvasRenderingContext2D, traco: Traco, apenasDoIndice = 0) => {
      if (traco.pontos.length === 0) return
      const escalaX = ctx.canvas.width / NORMA
      const escalaY = ctx.canvas.height / NORMA
      // A espessura segue a largura: um traço fino tem que continuar fino numa
      // página em pé, e escalar pelos dois eixos deixaria a caneta oval.
      const largura = traco.espessura * escalaX

      ctx.strokeStyle = traco.cor
      ctx.lineWidth = largura
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Um ponto solto vira bolinha — senão tocar a tela sem arrastar não marcaria nada.
      if (traco.pontos.length === 1) {
        const [x, y] = traco.pontos[0]
        ctx.beginPath()
        ctx.arc(x * escalaX, y * escalaY, largura / 2, 0, Math.PI * 2)
        ctx.fillStyle = traco.cor
        ctx.fill()
        return
      }

      const inicio = Math.max(0, apenasDoIndice - 1)
      ctx.beginPath()
      ctx.moveTo(traco.pontos[inicio][0] * escalaX, traco.pontos[inicio][1] * escalaY)
      for (let i = inicio + 1; i < traco.pontos.length; i++) {
        ctx.lineTo(traco.pontos[i][0] * escalaX, traco.pontos[i][1] * escalaY)
      }
      ctx.stroke()
    },
    [],
  )

  /**
   * Retângulo, círculo e seta a partir dos dois pontos do arrasto.
   *
   * A espessura segue a largura (como no traço), mas a GEOMETRIA usa os dois
   * eixos: um retângulo tem que cobrir exatamente a mesma região do exercício
   * nas duas pontas, e escalar só por um eixo o deixaria fora do lugar em
   * conteúdo em pé.
   */
  const desenharForma = useCallback((ctx: CanvasRenderingContext2D, forma: Forma) => {
    const escalaX = ctx.canvas.width / NORMA
    const escalaY = ctx.canvas.height / NORMA
    const x1 = forma.de[0] * escalaX
    const y1 = forma.de[1] * escalaY
    const x2 = forma.ate[0] * escalaX
    const y2 = forma.ate[1] * escalaY

    ctx.strokeStyle = forma.cor
    ctx.lineWidth = forma.espessura * escalaX
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()

    if (forma.forma === 'retangulo') {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
      ctx.stroke()
      return
    }

    if (forma.forma === 'circulo') {
      // Elipse inscrita no arrasto, e não círculo perfeito: circular uma
      // palavra pede uma forma mais larga que alta, e obrigar o professor a
      // acertar um quadrado para conseguir isso seria trabalho à toa.
      ctx.ellipse(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        Math.abs(x2 - x1) / 2,
        Math.abs(y2 - y1) / 2,
        0,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
      return
    }

    // Seta: a haste, e uma ponta calculada JÁ EM PIXEL. O ângulo tem que sair
    // das coordenadas de tela — nas lógicas, com os eixos escalando separados,
    // a ponta abriria torta em conteúdo que não fosse quadrado.
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    const angulo = Math.atan2(y2 - y1, x2 - x1)
    const comprimento = Math.hypot(x2 - x1, y2 - y1)
    if (comprimento < 1) return
    // A ponta cresce com a espessura, mas nunca passa de um terço da haste —
    // senão uma seta curtinha vira só um triângulo.
    const asa = Math.min(comprimento / 3, ctx.lineWidth * 4 + 6)
    const abertura = Math.PI / 7

    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - asa * Math.cos(angulo - abertura), y2 - asa * Math.sin(angulo - abertura))
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - asa * Math.cos(angulo + abertura), y2 - asa * Math.sin(angulo + abertura))
    ctx.stroke()
  }, [])

  const redesenhar = useCallback(() => {
    const ctx = contexto()
    if (!ctx) return
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    for (const a of anotacoes.current) {
      if (a.superficie !== superficieRef.current) continue
      if (a.tipo === 'traco') desenharTraco(ctx, a)
      else if (a.tipo === 'forma') desenharForma(ctx, a)
    }
  }, [contexto, desenharTraco, desenharForma])

  // Trocar de página (ou de conteúdo no palco) troca o que está na tela — nos
  // traços e nos textos ao mesmo tempo.
  useEffect(() => {
    redesenhar()
    setEditando(null)
  }, [superficie, redesenhar])

  // O canvas acompanha o tamanho do contêiner e a densidade da tela; sem isso
  // o traço sai borrado no celular (dpr 2 ou 3).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ajustar = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (width === 0 || height === 0) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      redesenhar()
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)
    return () => observador.disconnect()
  }, [redesenhar])

  // ── canal de dados ────────────────────────────────────────────────────────

  const enviarRef = useRef<((msg: MensagemAnotacao) => void) | null>(null)

  const enviar = useCanal<MensagemAnotacao>('lousa', (msg) => {
    // Quem chega depois pede o que já está escrito; quem tem responde. Sem
    // isso, entrar no meio da aula mostraria uma página limpa enquanto o outro
    // olha para a correção.
    if (msg.t === 'pedir-estado') {
      if (anotacoes.current.length > 0) {
        enviarRef.current?.({ t: 'estado', anotacoes: anotacoes.current })
      }
      return
    }

    const ctx = contexto()
    const naTela = (s: string) => s === superficieRef.current

    switch (msg.t) {
      case 'pontos': {
        const existente = anotacoes.current.find(
          (a): a is Traco => a.id === msg.traco.id && a.tipo === 'traco',
        )
        if (existente) {
          const desde = existente.pontos.length
          existente.pontos.push(...msg.pontos)
          if (ctx && naTela(existente.superficie)) desenharTraco(ctx, existente, desde)
        } else {
          const novo: Traco = { ...msg.traco, pontos: msg.pontos }
          anotacoes.current.push(novo)
          if (ctx && naTela(novo.superficie)) desenharTraco(ctx, novo)
        }
        break
      }
      case 'texto': {
        const indice = anotacoes.current.findIndex((a) => a.id === msg.texto.id)
        if (indice === -1) anotacoes.current.push(msg.texto)
        else anotacoes.current[indice] = msg.texto
        sincronizarTextos()
        break
      }
      case 'forma': {
        const indice = anotacoes.current.findIndex((a) => a.id === msg.forma.id)
        if (indice === -1) anotacoes.current.push(msg.forma)
        else anotacoes.current[indice] = msg.forma
        // Forma redesenha a superfície inteira em vez de pintar só o novo
        // pedaço: ela MUDA a cada quadro do arrasto (o retângulo cresce, a
        // seta gira), então não há "o que falta" para acrescentar — o desenho
        // anterior precisa sair. Traço é diferente: só ganha pontos no fim.
        if (naTela(msg.forma.superficie)) redesenhar()
        break
      }
      case 'remover':
        anotacoes.current = anotacoes.current.filter((a) => a.id !== msg.id)
        meus.current = meus.current.filter((id) => id !== msg.id)
        redesenhar()
        sincronizarTextos()
        break
      case 'limpar':
        anotacoes.current = anotacoes.current.filter(
          (a) => !(a.autor === msg.autor && a.superficie === msg.superficie),
        )
        meus.current = meus.current.filter((id) => anotacoes.current.some((a) => a.id === id))
        redesenhar()
        sincronizarTextos()
        break
      case 'estado':
        anotacoes.current = msg.anotacoes
        redesenhar()
        sincronizarTextos()
        break
    }
  })
  enviarRef.current = enviar

  const conectada = useSalaConectada()
  useEffect(() => {
    if (conectada) enviar({ t: 'pedir-estado' })
  }, [conectada, enviar])

  // ── coordenadas ───────────────────────────────────────────────────────────

  const paraLogico = useCallback((clientX: number, clientY: number): Ponto => {
    const caixa = camadaRef.current?.getBoundingClientRect()
    if (!caixa || caixa.width === 0 || caixa.height === 0) return [0, 0]
    return [
      ((clientX - caixa.left) / caixa.width) * NORMA,
      ((clientY - caixa.top) / caixa.height) * NORMA,
    ]
  }, [])

  // ── caneta ────────────────────────────────────────────────────────────────

  function despejar() {
    const traco = tracoAtual.current
    if (!traco || naoEnviados.current.length === 0) return
    const { pontos: _pontos, ...cabecalho } = traco
    enviar({ t: 'pontos', traco: cabecalho, pontos: naoEnviados.current })
    naoEnviados.current = []
    ultimoEnvio.current = Date.now()
  }

  /** Manda a forma em curso, no máximo a cada lote. `agora` ignora o relógio. */
  function despejarForma(agora = false) {
    const forma = formaAtual.current
    if (!forma) return
    if (!agora && Date.now() - ultimoEnvio.current < INTERVALO_ENVIO_MS) return
    enviar({ t: 'forma', forma })
    ultimoEnvio.current = Date.now()
  }

  /**
   * Apaga a anotação sob o ponteiro — uma só, a de cima.
   *
   * De cima para baixo (`reverse`) porque o que foi desenhado por último está
   * visualmente por cima: a borracha tem que pegar o que a pessoa está vendo,
   * não o que ficou escondido embaixo.
   */
  function apagarSobOPonteiro(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    const caixa = canvas.getBoundingClientRect()
    const dpr = canvas.width / caixa.width
    // Coordenadas do canvas (que está em dpr), não da tela.
    const px = (clientX - caixa.left) * dpr
    const py = (clientY - caixa.top) * dpr
    const escalaX = canvas.width / NORMA
    const escalaY = canvas.height / NORMA

    // Texto primeiro: fica por cima do canvas e tem retângulo próprio, mais
    // exato que qualquer caixa que estimássemos.
    //
    // A medida é feita no retângulo do elemento, e NÃO por `elementsFromPoint`:
    // fora do modo texto esses divs são `pointer-events: none`, e o hit-testing
    // do navegador pula justamente quem tem isso — a borracha nunca acharia um
    // texto. `getBoundingClientRect` não liga para pointer-events.
    const nos = [...(camadaRef.current?.querySelectorAll<HTMLElement>('[data-anotacao]') ?? [])]
    for (const no of nos.reverse()) {
      const r = no.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        removerAnotacao(no.dataset.anotacao!)
        return
      }
    }

    const daPagina = anotacoes.current.filter(
      (a): a is Traco | Forma =>
        a.superficie === superficie && (a.tipo === 'traco' || a.tipo === 'forma'),
    )
    for (const a of [...daPagina].reverse()) {
      if (encostou(a, px, py, escalaX, escalaY)) {
        removerAnotacao(a.id)
        return
      }
    }
  }

  function aoPressionarCanvas(evento: React.PointerEvent<HTMLCanvasElement>) {
    evento.currentTarget.setPointerCapture(evento.pointerId)
    const ponto = paraLogico(evento.clientX, evento.clientY)

    if (ferramenta === 'borracha') {
      apagando.current = true
      apagarSobOPonteiro(evento.clientX, evento.clientY)
      return
    }

    if (ehForma(ferramenta)) {
      const forma = formaNova(eu, superficie, cor, espessura, ferramenta, ponto)
      formaAtual.current = forma
      anotacoes.current.push(forma)
      meus.current.push(forma.id)
      redesenhar()
      despejarForma(true)
      return
    }

    const traco: Traco = {
      tipo: 'traco',
      id: crypto.randomUUID(),
      autor: eu,
      superficie,
      cor,
      espessura,
      pontos: [ponto],
    }
    tracoAtual.current = traco
    anotacoes.current.push(traco)
    meus.current.push(traco.id)
    naoEnviados.current = [ponto]
    const ctx = contexto()
    if (ctx) desenharTraco(ctx, traco)
    despejar()
  }

  function aoMoverCanvas(evento: React.PointerEvent<HTMLCanvasElement>) {
    // Arrastar a borracha varre: dá para passar por cima de três setas seguidas
    // sem soltar o botão.
    if (apagando.current) {
      apagarSobOPonteiro(evento.clientX, evento.clientY)
      return
    }

    const forma = formaAtual.current
    if (forma) {
      forma.ate = paraLogico(evento.clientX, evento.clientY)
      redesenhar()
      despejarForma()
      return
    }

    const traco = tracoAtual.current
    if (!traco) return
    const ponto = paraLogico(evento.clientX, evento.clientY)
    const desde = traco.pontos.length
    traco.pontos.push(ponto)
    naoEnviados.current.push(ponto)
    const ctx = contexto()
    if (ctx) desenharTraco(ctx, traco, desde)
    if (Date.now() - ultimoEnvio.current >= INTERVALO_ENVIO_MS) despejar()
  }

  function aoSoltarCanvas() {
    apagando.current = false

    if (formaAtual.current) {
      // Um clique sem arrastar não deixa forma nenhuma: seria um ponto
      // invisível que só apareceria no "desfazer" de alguém.
      const { de, ate } = formaAtual.current
      if (Math.hypot(ate[0] - de[0], ate[1] - de[1]) < ARRASTO_MINIMO) {
        removerAnotacao(formaAtual.current.id)
      } else {
        despejarForma(true)
      }
      formaAtual.current = null
      return
    }

    if (!tracoAtual.current) return
    // Despeja o resto SEM olhar o relógio: o fim do traço não pode ficar preso
    // esperando o próximo lote que nunca vem.
    despejar()
    tracoAtual.current = null
  }

  // ── texto ─────────────────────────────────────────────────────────────────

  const guardarTexto = useCallback(
    (texto: Texto) => {
      const indice = anotacoes.current.findIndex((a) => a.id === texto.id)
      if (indice === -1) {
        anotacoes.current.push(texto)
        meus.current.push(texto.id)
      } else {
        anotacoes.current[indice] = texto
      }
      sincronizarTextos()
      enviarRef.current?.({ t: 'texto', texto })
    },
    [sincronizarTextos],
  )

  const removerAnotacao = useCallback(
    (id: string) => {
      anotacoes.current = anotacoes.current.filter((a) => a.id !== id)
      meus.current = meus.current.filter((outro) => outro !== id)
      redesenhar()
      sincronizarTextos()
      enviarRef.current?.({ t: 'remover', id })
    },
    [redesenhar, sincronizarTextos],
  )

  /** Sair da edição descarta o que ficou vazio — caixa em branco é lixo na tela. */
  const encerrarEdicao = useCallback(() => {
    setEditando((atual) => {
      if (!atual) return null
      const anotacao = anotacoes.current.find((a) => a.id === atual)
      if (anotacao && textoVazio(anotacao)) {
        anotacoes.current = anotacoes.current.filter((a) => a.id !== atual)
        meus.current = meus.current.filter((id) => id !== atual)
        sincronizarTextos()
        enviarRef.current?.({ t: 'remover', id: atual })
      }
      return null
    })
  }, [sincronizarTextos])

  /** Clique no vazio com a ferramenta de texto: nasce uma caixa ali mesmo. */
  function aoPressionarCamada(evento: React.PointerEvent<HTMLDivElement>) {
    if (ferramenta !== 'texto' || evento.target !== evento.currentTarget) return
    // `preventDefault` aqui não é detalhe: o navegador move o foco no MOUSEDOWN,
    // e a caixa que estamos criando só existe um render depois. Sem isto, o
    // clique cria a caixa, o `mouseup` seguinte joga o foco para o corpo da
    // página, o `onBlur` roda e a caixa — ainda vazia — é descartada antes de
    // a pessoa digitar a primeira letra.
    evento.preventDefault()
    encerrarEdicao()
    const [x, y] = paraLogico(evento.clientX, evento.clientY)
    const novo = textoNovo(eu, superficie, cor, tamanho, x, y)
    guardarTexto(novo)
    setEditando(novo.id)
  }

  function aoPressionarTexto(evento: React.PointerEvent<HTMLDivElement>, texto: Texto) {
    if (ferramenta !== 'texto' || editando === texto.id) return
    evento.stopPropagation()
    // Mesmo motivo do `aoPressionarCamada`: sem isto, clicar num texto para
    // corrigir abriria o campo e o perderia no mesmo gesto.
    evento.preventDefault()
    evento.currentTarget.setPointerCapture(evento.pointerId)
    arrasto.current = {
      id: texto.id,
      de: paraLogico(evento.clientX, evento.clientY),
      inicial: [texto.x, texto.y],
      moveu: false,
    }
  }

  function aoMoverTexto(evento: React.PointerEvent<HTMLDivElement>) {
    const a = arrasto.current
    if (!a) return
    const [x, y] = paraLogico(evento.clientX, evento.clientY)
    const dx = x - a.de[0]
    const dy = y - a.de[1]
    if (!a.moveu && Math.hypot(dx, dy) < ARRASTO_MINIMO) return
    a.moveu = true
    const atual = anotacoes.current.find((o): o is Texto => o.id === a.id && o.tipo === 'texto')
    if (!atual) return
    guardarTexto({
      ...atual,
      x: Math.min(NORMA, Math.max(0, a.inicial[0] + dx)),
      y: Math.min(NORMA, Math.max(0, a.inicial[1] + dy)),
    })
  }

  function aoSoltarTexto() {
    const a = arrasto.current
    arrasto.current = null
    // Soltou sem ter arrastado? Era clique — abre para editar.
    if (a && !a.moveu) {
      encerrarEdicao()
      setEditando(a.id)
    }
  }

  // ── barra ─────────────────────────────────────────────────────────────────

  function desfazer() {
    const id = meus.current.pop()
    if (!id) return
    anotacoes.current = anotacoes.current.filter((a) => a.id !== id)
    redesenhar()
    sincronizarTextos()
    enviar({ t: 'remover', id })
  }

  function limparMinhaCamada() {
    anotacoes.current = anotacoes.current.filter(
      (a) => !(a.autor === eu && a.superficie === superficie),
    )
    meus.current = meus.current.filter((id) => anotacoes.current.some((a) => a.id === id))
    setEditando(null)
    redesenhar()
    sincronizarTextos()
    enviar({ t: 'limpar', autor: eu, superficie })
  }

  const daPagina = textos.filter((t) => t.superficie === superficie)
  // Espessura vale para a caneta e para as formas; tamanho, só para o texto.
  const escrevendo = ferramenta === 'texto'
  const grossuras = escrevendo ? TAMANHOS : ESPESSURAS
  const grossuraAtual = escrevendo ? tamanho : espessura
  const trocarGrossura = escrevendo ? setTamanho : setEspessura

  return (
    // `containerType: size` é o que dá as unidades `cqw`/`cqh` usadas para
    // posicionar e dimensionar os textos: assim eles acompanham a caixa do
    // conteúdo sem nenhuma conta em JavaScript, e chegam do mesmo tamanho
    // relativo nos dois lados.
    <div
      ref={camadaRef}
      onPointerDown={aoPressionarCamada}
      className={`absolute inset-0 ${
        aberta && ferramenta === 'texto' ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      style={{ containerType: 'size' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={aoPressionarCanvas}
        onPointerMove={aoMoverCanvas}
        onPointerUp={aoSoltarCanvas}
        onPointerCancel={aoSoltarCanvas}
        // `touch-none`: sem isso, arrastar o dedo rola a página em vez de desenhar.
        // `pointer-events` é HERDADO: sem `auto` explícito, o canvas herdaria
        // o `none` da camada e a caneta não receberia clique nenhum.
        className={`absolute inset-0 h-full w-full touch-none ${
          aberta && ferramenta !== 'texto' ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      />

      {daPagina.map((texto) => (
        <CaixaDeTexto
          key={texto.id}
          texto={texto}
          editavel={aberta && ferramenta === 'texto'}
          editando={editando === texto.id}
          aoPressionar={(e) => aoPressionarTexto(e, texto)}
          aoMover={aoMoverTexto}
          aoSoltar={aoSoltarTexto}
          aoEscrever={(valor) => guardarTexto({ ...texto, texto: valor })}
          aoEncerrar={encerrarEdicao}
          aoApagar={() => removerAnotacao(texto.id)}
        />
      ))}

      {!aberta && podeAnotar && (
        // Recolhida: um botão só, no canto, sem tapar o conteúdo nem os
        // controles de página. Clicar aqui é o gesto de "quero escrever".
        <button
          onClick={() => setQuerAberta(true)}
          title="Anotar por cima"
          className="pointer-events-auto absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur transition hover:bg-neutral-900"
        >
          <Pen className="h-4 w-4" /> Anotar
        </button>
      )}

      {aberta && (
        // `flex-wrap` e o teto de largura: com cinco ferramentas a barra não
        // cabe mais numa linha no celular, e sem quebrar ela vazaria para fora
        // do quadro levando junto os botões da ponta.
        <div className="pointer-events-auto absolute bottom-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-3xl bg-neutral-900/90 px-3 py-2 shadow-lg backdrop-blur">
          {(
            [
              ['caneta', Pen, 'Desenhar à mão'],
              ['texto', Type, 'Escrever — clique onde o texto deve começar'],
              ['retangulo', Square, 'Retângulo — arraste para enquadrar'],
              ['circulo', Circle, 'Círculo — arraste para circular'],
              ['seta', ArrowUpRight, 'Seta — arraste do início para a ponta'],
              ['borracha', Eraser, 'Borracha — passe por cima do que quer apagar'],
            ] as const
          ).map(([chave, Icone, dica]) => (
            <button
              key={chave}
              onClick={() => {
                encerrarEdicao()
                setFerramenta(chave)
              }}
              title={dica}
              className={`grid h-8 w-8 place-items-center rounded-full transition ${
                ferramenta === chave
                  ? 'bg-violet-300 text-neutral-900'
                  : 'text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              <Icone className="h-4 w-4" />
            </button>
          ))}

          {/* Cor e espessura não dizem nada sobre a borracha — escondê-las é
              menos ruído do que deixá-las ali sem efeito. */}
          {ferramenta !== 'borracha' && <span className="mx-1 h-6 w-px bg-neutral-700" />}

          {ferramenta !== 'borracha' &&
            CORES.map((c) => (
              <button
                key={c}
                onClick={() => setCor(c)}
                title="Escolher cor"
                style={{ backgroundColor: c }}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  cor === c ? 'border-white' : 'border-transparent opacity-60'
                }`}
              />
            ))}

          {ferramenta !== 'borracha' && <span className="mx-1 h-6 w-px bg-neutral-700" />}

          {/* Os dois botões trocam de significado junto com a ferramenta:
              fino/grosso na caneta e nas formas, pequeno/grande no texto. */}
          {ferramenta !== 'borracha' &&
            grossuras.map((valor, i) => (
              <button
                key={valor}
                onClick={() => trocarGrossura(valor)}
                title={
                  escrevendo
                    ? i === 0
                      ? 'Letra pequena'
                      : 'Letra grande'
                    : i === 0
                      ? 'Traço fino'
                      : 'Traço grosso'
                }
                className={`grid h-7 w-7 place-items-center rounded-full transition ${
                  grossuraAtual === valor ? 'bg-neutral-700' : 'hover:bg-neutral-800'
                }`}
              >
                {escrevendo ? (
                  <span className="font-bold text-white" style={{ fontSize: i === 0 ? 11 : 16 }}>
                    A
                  </span>
                ) : (
                  <span
                    className="rounded-full bg-white"
                    style={{ width: valor + 2, height: valor + 2 }}
                  />
                )}
              </button>
            ))}

          <span className="mx-1 h-6 w-px bg-neutral-700" />

          <button
            onClick={desfazer}
            title="Desfazer o que eu fiz por último"
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={limparMinhaCamada}
            title="Limpar a página — apaga tudo o que EU deixei aqui"
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <span className="mx-1 h-6 w-px bg-neutral-700" />

          <button
            onClick={() => {
              encerrarEdicao()
              setQuerAberta(false)
            }}
            title="Minimizar — devolve o clique para o conteúdo"
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Um texto no palco. Em edição vira `textarea`, fora dela vira `div` — e os
 * dois usam exatamente o mesmo estilo, senão o texto pularia de lugar no
 * instante em que a pessoa clica para corrigir uma letra.
 *
 * Posição e tamanho saem em `cqw`/`cqh` do contêiner da camada: é o que faz o
 * texto acompanhar a caixa do conteúdo nos dois lados sem conta em JS.
 */
function CaixaDeTexto({
  texto,
  editavel,
  editando,
  aoPressionar,
  aoMover,
  aoSoltar,
  aoEscrever,
  aoEncerrar,
  aoApagar,
}: {
  texto: Texto
  editavel: boolean
  editando: boolean
  aoPressionar: (e: React.PointerEvent<HTMLDivElement>) => void
  aoMover: (e: React.PointerEvent<HTMLDivElement>) => void
  aoSoltar: () => void
  aoEscrever: (valor: string) => void
  aoEncerrar: () => void
  aoApagar: () => void
}) {
  const campoRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editando) return
    const campo = campoRef.current
    if (!campo) return
    campo.focus()
    campo.setSelectionRange(campo.value.length, campo.value.length)
  }, [editando])

  // Textarea não cresce sozinho: sem isto, um texto de duas linhas viraria uma
  // caixinha com barra de rolagem em cima do exercício.
  useEffect(() => {
    const campo = campoRef.current
    if (!campo) return
    campo.style.height = 'auto'
    campo.style.height = `${campo.scrollHeight}px`
  }, [texto.texto, editando])

  const estilo: React.CSSProperties = {
    left: `${texto.x / 10}cqw`,
    top: `${texto.y / 10}cqh`,
    maxWidth: `${larguraMaxima(texto.x) / 10}cqw`,
    fontSize: `${texto.tamanho / 10}cqh`,
    color: texto.cor,
    lineHeight: 1.25,
  }

  if (editando) {
    return (
      <textarea
        ref={campoRef}
        rows={1}
        value={texto.texto}
        onChange={(e) => aoEscrever(e.target.value)}
        onBlur={aoEncerrar}
        onKeyDown={(e) => {
          // Escape fecha; Enter quebra linha — isto é anotação, não formulário.
          if (e.key === 'Escape') {
            e.preventDefault()
            campoRef.current?.blur()
          }
          if (e.key === 'Backspace' && texto.texto === '') {
            e.preventDefault()
            aoApagar()
          }
        }}
        placeholder="escreva…"
        style={{ ...estilo, minWidth: '12cqw' }}
        className="pointer-events-auto absolute resize-none overflow-hidden rounded bg-white/85 px-1 font-bold shadow-sm outline-2 outline-violet-400 placeholder:font-normal placeholder:text-neutral-400"
      />
    )
  }

  return (
    <div
      data-anotacao={texto.id}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      style={estilo}
      className={`absolute touch-none rounded px-1 font-bold whitespace-pre-wrap ${
        editavel ? 'pointer-events-auto cursor-move hover:bg-white/40' : 'pointer-events-none'
      }`}
    >
      {texto.texto}
    </div>
  )
}
