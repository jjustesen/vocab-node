import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Hand,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Documento } from './Documento'
import { Lousa } from './Lousa'
import { MaterialNoPalco } from './MaterialNoPalco'
import {
  proporcaoDo,
  superficieDo,
  type Palco as EstadoPalco,
  type ParticipanteId,
  type Vista,
} from './estado-palco'

/** Teto do zoom: acima de 4x uma folha A4 já passa de "ler" para "procurar". */
const ZOOM_MAX = 4
const ZOOM_MIN = 1
const PASSO = 0.25
/**
 * Quantos milissegundos entre dois envios de enquadramento durante o arrasto.
 * ~12 por segundo: acompanha a mão sem parecer travado e deixa o canal livre
 * para os traços da lousa, que dividem o mesmo data channel.
 */
const INTERVALO_ENVIO = 80

/**
 * O centro da sala: o conteúdo, com a camada de anotação por cima.
 *
 * A caixa recebe a PROPORÇÃO do conteúdo (`proporcaoDo`) e não o tamanho da
 * tela. É o detalhe que faz a anotação funcionar: as duas pontas desenham a
 * mesma caixa, com a mesma forma, em tamanhos diferentes — então o traço que
 * o professor fez sobre a terceira linha do exercício cai sobre a terceira
 * linha do exercício no celular do aluno.
 *
 * ── Encaixar, largura, zoom ─────────────────────────────────────────────────
 *
 * "Encaixar" mostra a página inteira e é o padrão: é o estado em que os dois
 * lados veem a mesma coisa sem ninguém precisar mexer em nada. Só que uma
 * folha A4 em pé numa janela deitada encaixa pela ALTURA, e sobra tarja preta
 * dos dois lados enquanto o texto fica pequeno demais para ler. Daí os outros
 * dois: "largura" estica a página até a borda e deixa transbordar para baixo,
 * e a lupa multiplica os dois casos.
 *
 * Nenhum dos três viaja pelo canal: são de QUEM OLHA, não do palco. O palco é
 * compartilhado porque professor e aluno precisam estar na mesma página (ver
 * `estado-palco.ts`); o quanto cada um amplia depende do tamanho da tela de
 * cada um, e sincronizar isso só faria o professor rearranjar, sem querer, o
 * celular do aluno. A anotação continua alinhada porque ela é ancorada em
 * fração da caixa, e a caixa nunca muda de FORMA — só de tamanho.
 */
export function Palco({
  palco,
  vista,
  aoMudarVista,
  eu,
  podeAnotar,
  ehProfessor,
  contextoDoDocumento,
  aoVirarPagina,
}: {
  palco: EstadoPalco
  /** O enquadramento em vigor — do professor. Ver `Vista` em `estado-palco.ts`. */
  vista: Vista
  aoMudarVista: (vista: Vista) => void
  eu: ParticipanteId
  podeAnotar: boolean
  /** Vira página quem comanda o palco — e quem comanda é o professor. */
  ehProfessor: boolean
  contextoDoDocumento: { alunoId: string; aulaId: string | null } | null
  aoVirarPagina: (pagina: number) => void
}) {
  const [mao, setMao] = useState(false)
  const { ajuste, zoom } = vista
  /**
   * Se a área do palco existe no DOM. É `false` em "só vídeo" — o componente
   * devolve `null` lá embaixo — e é a dependência que faltava no ouvinte de
   * rolagem: sem ela o efeito rodava uma vez, na montagem, com `area.current`
   * ainda nulo (o palco começa vazio), desistia, e nunca mais voltava. O
   * professor rolava, nada saía pelo canal, e o aluno ficava parado no topo.
   */
  const temArea = palco.tipo !== 'nenhum'

  /**
   * A camada que NÃO rola, onde moram todos os controles do palco: setas de
   * página, barra de ampliação e — por portal — os botões da lousa.
   *
   * É estado e não ref porque a `Lousa` precisa do nó para renderizar dentro
   * dele, e uma ref não avisa ninguém quando é preenchida: o portal ficaria
   * pendurado num `null` do primeiro render e nunca mais.
   */
  const [controles, setControles] = useState<HTMLDivElement | null>(null)

  const area = useRef<HTMLDivElement>(null)
  const arrasto = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  /**
   * Enquanto ESTA ponta arrasta, o que chega pelo canal é ignorado.
   *
   * Sem isto o professor briga com o próprio eco: ele rola, a vista sai, volta
   * pelo estado e o efeito abaixo puxa a rolagem de volta para onde ela estava
   * um quadro antes — o conteúdo trava e treme debaixo da mão.
   */
  const mexendo = useRef(false)
  const ultimoEnvio = useRef(0)

  /**
   * Põe o enquadramento recebido na tela.
   *
   * O centro vem em fração do conteúdo, então a conta é a mesma dos dois lados
   * mesmo com telas de tamanhos diferentes: acha o ponto na página e o coloca
   * no meio da janela. O navegador limita sozinho quando o ponto está perto da
   * borda, que é o comportamento certo — melhor mostrar a beirada do que
   * inventar espaço em branco.
   */
  const aplicarCentro = useCallback((cx: number, cy: number) => {
    const el = area.current
    if (!el) return
    el.scrollLeft = cx * el.scrollWidth - el.clientWidth / 2
    el.scrollTop = cy * el.scrollHeight - el.clientHeight / 2
  }, [])

  /**
   * TODO enquadramento do professor sai por aqui — não importa como ele chegou.
   *
   * A primeira versão emitia dentro do arrasto da mão, e por isso a roda do
   * mouse não chegava ao aluno: rolar com a roda, com o trackpad, com as setas
   * do teclado ou pela barra de rolagem são caminhos diferentes que produzem o
   * MESMO evento `scroll`. Ouvir o resultado, em vez de cada gesto que leva a
   * ele, é o que fecha todos de uma vez.
   *
   * Estrangulado com fio de saída: no máximo um envio a cada `INTERVALO_ENVIO`
   * durante o movimento, mais um atrasado ao fim. Sem o atrasado, a turma
   * pararia alguns pixels antes de onde o professor parou; sem o teto, o canal
   * dos traços da lousa levaria uma mensagem por quadro de rolagem.
   */
  const emitirRef = useRef<() => void>(() => {})
  emitirRef.current = () => aoMudarVista({ ajuste, zoom, ...centroAtual() })

  useEffect(() => {
    if (!ehProfessor) return
    const el = area.current
    if (!el) return

    let atrasado: ReturnType<typeof setTimeout> | undefined
    function aoRolar() {
      const desde = Date.now() - ultimoEnvio.current
      if (desde < INTERVALO_ENVIO) {
        clearTimeout(atrasado)
        atrasado = setTimeout(() => {
          ultimoEnvio.current = Date.now()
          emitirRef.current()
        }, INTERVALO_ENVIO - desde)
        return
      }
      ultimoEnvio.current = Date.now()
      emitirRef.current()
    }

    el.addEventListener('scroll', aoRolar, { passive: true })
    return () => {
      el.removeEventListener('scroll', aoRolar)
      clearTimeout(atrasado)
    }
    // `temArea` reata o ouvinte quando o palco sai de "só vídeo" — é quando a
    // `area` passa a existir. Ver o comentário na declaração dela.
  }, [ehProfessor, temArea])

  /**
   * O aluno acompanha. Roda depois da pintura, quando a caixa já foi
   * redimensionada pelo zoom novo — antes disso `scrollWidth` ainda seria o do
   * enquadramento anterior e o centro cairia no lugar errado.
   */
  useEffect(() => {
    if (ehProfessor || mexendo.current) return
    aplicarCentro(vista.cx, vista.cy)
  }, [ehProfessor, vista, aplicarCentro])

  /** Onde esta tela está enquadrada agora, no formato que viaja pelo canal. */
  const centroAtual = useCallback((): { cx: number; cy: number } => {
    const el = area.current
    if (!el || el.scrollWidth === 0 || el.scrollHeight === 0) return { cx: 0.5, cy: 0.5 }
    return {
      cx: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
      cy: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
    }
  }, [])

  if (palco.tipo === 'nenhum') return null

  /**
   * Sobre o documento NÃO se anota, e isso é limite do modelo, não preguiça:
   * o texto rola, e cada lado rola o seu. Um traço ancorado na caixa sairia do
   * lugar assim que alguém descesse a página. Quando o texto precisa virar
   * superfície anotável, o caminho é congelá-lo em material — que é
   * exatamente o botão "Guardar" lá dentro.
   */
  const camadaDisponivel = palco.tipo !== 'documento'

  const proporcao = proporcaoDo(palco)

  /**
   * Ampliar só faz sentido sobre o material: a lousa em branco não tem nada
   * escrito pequeno, e o documento já rola sozinho — dois scrolls aninhados
   * brigariam pelo mesmo gesto.
   */
  const ehMaterial = palco.tipo === 'material'

  /**
   * Quem MEXE no enquadramento é só o professor — separado de `ehMaterial` de
   * propósito.
   *
   * O aluno tem que RENDERIZAR a mesma vista (o mesmo `ajuste`, o mesmo zoom),
   * senão ele não estaria vendo o que o professor está mostrando; o que ele
   * não pode é mudá-la. Amarrar as duas coisas na mesma condição foi o erro
   * óbvio a evitar aqui: bastaria usar "pode comandar" no cálculo da largura
   * para o aluno voltar a "encaixar" enquanto o professor olha a página
   * esticada, e os dois passariam a aula falando de telas diferentes.
   */
  const podeComandar = ehProfessor && ehMaterial

  /*
    Encaixar a caixa na área disponível SEM deformar exige as duas medidas ao
    mesmo tempo, e `max-height` não serve: com a largura definida, o navegador
    calcula a altura pela proporção e o teto de altura só corta o excesso — a
    caixa fica com a forma errada, e a anotação sai do lugar junto com ela.

    `min(100cqw, 100cqh * proporção)` escolhe a dimensão que aperta primeiro e
    deriva o resto da proporção: encaixa por largura em conteúdo deitado, por
    altura em conteúdo em pé, e nunca deforma. "Largura" é a mesma conta sem o
    teto de altura — passa a transbordar para baixo, de propósito.
  */
  const base =
    ehMaterial && ajuste === 'largura' ? '100cqw' : `min(100cqw, calc(100cqh * ${proporcao}))`
  const largura = zoom === 1 ? base : `calc(${base} * ${zoom})`

  function aoPressionar(evento: React.PointerEvent<HTMLDivElement>) {
    const el = area.current
    if (!el) return
    evento.currentTarget.setPointerCapture(evento.pointerId)
    mexendo.current = true
    arrasto.current = {
      x: evento.clientX,
      y: evento.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    }
  }

  function aoMover(evento: React.PointerEvent<HTMLDivElement>) {
    const a = arrasto.current
    const el = area.current
    if (!a || !el) return
    // Arrastar para BAIXO tem que trazer o conteúdo de baixo para cima — daí o
    // sinal invertido. É o gesto do papel sob a mão, não o da barra de rolagem.
    // Não emite nada daqui: mover a rolagem dispara o evento `scroll`, e é o
    // ouvinte lá em cima que manda. Uma porta só de saída.
    el.scrollLeft = a.left - (evento.clientX - a.x)
    el.scrollTop = a.top - (evento.clientY - a.y)
  }

  function aoSoltar() {
    arrasto.current = null
    mexendo.current = false
  }

  function ampliar(delta: number) {
    const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + delta) * 100) / 100))
    // O centro é recalculado DEPOIS de o zoom entrar, num quadro à frente: a
    // caixa acabou de mudar de tamanho e o `scrollWidth` de agora é o antigo.
    aoMudarVista({ ajuste, zoom: novo, cx: vista.cx, cy: vista.cy })
    requestAnimationFrame(() => {
      if (!ehProfessor) return
      aoMudarVista({ ajuste, zoom: novo, ...centroAtual() })
    })
  }

  return (
    // A barra de ampliação fica FORA da área que rola: dentro dela, sumiria
    // para cima assim que a pessoa arrastasse o conteúdo.
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/*
        `containerType: size` transforma esta área nas unidades `cqw`/`cqh` de
        que a caixa precisa — e `overflow-auto` é o que dá para onde
        transbordar quando a caixa passa do tamanho da área.
      */}
      {/*
        `overflow-hidden` para quem não comanda, e não `auto`: a roda do mouse,
        o trackpad, as setas do teclado e a barra de rolagem são quatro portas
        para a mesma coisa, e bloquear uma a uma sempre deixa outra aberta.
        Tirando a rolagem nativa, sobra só o que `aplicarCentro` escreve — que
        é o enquadramento do professor. Rolagem por script continua funcionando
        com `hidden`, que é exatamente o que se quer aqui.
      */}
      <div
        ref={area}
        className={`min-h-0 flex-1 ${podeComandar ? 'overflow-auto' : 'overflow-hidden'}`}
        style={{ containerType: 'size' }}
      >
        {/*
          `m-auto` num item de flex centraliza enquanto sobra espaço e vira
          zero quando falta. É o detalhe que evita o clássico de centralizar
          com `justify-center`: ali o transbordo vai para os DOIS lados e a
          metade de cima do conteúdo fica inalcançável pela rolagem.
        */}
        <div className="flex min-h-full min-w-full">
          <div
            className="relative m-auto shrink-0"
            style={{ aspectRatio: proporcao, width: largura }}
          >
            {palco.tipo === 'branco' && <div className="h-full w-full rounded-2xl bg-white" />}

            {palco.tipo === 'material' && <MaterialNoPalco palco={palco} />}

            {palco.tipo === 'documento' && (
              <div className="absolute inset-0">
                <Documento eu={eu} contexto={contextoDoDocumento} />
              </div>
            )}

            {/* A barra de anotação mora dentro do quadro e se recolhe sozinha —
                não há mais um botão "Anotar" na barra de baixo da sala. */}
            {camadaDisponivel && (
              <Lousa
                superficie={superficieDo(palco)}
                eu={eu}
                podeAnotar={podeAnotar}
                controles={controles}
              />
            )}

            {/*
              A mão vem DEPOIS da lousa de propósito: com as duas ligadas, o
              arrasto tem que mover a página, não riscar por cima dela. É o
              mesmo acordo de qualquer leitor de PDF — a ferramenta escolhida
              ganha o gesto.
            */}
            {mao && (
              <div
                onPointerDown={aoPressionar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                // `touch-none`: sem isso o dedo rolaria a área nativamente E
                // pelo arrasto, andando duas vezes mais rápido que a mão.
                className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
              />
            )}

          </div>
        </div>
      </div>

      {/*
        ── Tudo o que é CONTROLE fica aqui, fora da área que rola ─────────────

        A caixa do conteúdo rola quando o palco está ampliado, e `absolute`
        dentro dela ancora na PÁGINA, não na tela: as setas subiam junto com o
        topo do PDF e o botão de anotar descia para fora de vista. Controle que
        foge com o scroll é controle que não existe na hora em que se precisa
        dele.

        `pointer-events-none` na camada e `auto` em cada botão: no vão entre
        eles o clique tem que atravessar e chegar no conteúdo — senão esta
        camada viraria um vidro por cima do palco inteiro.
      */}
      <div ref={setControles} className="pointer-events-none absolute inset-0">
        {/*
          As páginas do PDF viram slides: o professor vira, e a virada é estado
          da sala — então todo mundo olha para a mesma página, sempre.

          O aluno vê as setas desabilitadas, e não some com elas. Esconder foi
          o primeiro desenho, e estava errado: um controle que desaparece não
          ensina nada — a pessoa procura o botão de virar página, não acha, e
          conclui que o app não faz isso. Desabilitado, com o motivo no title,
          explica de quem é o comando.
        */}
        {palco.tipo === 'material' && palco.paginas > 1 && (
          <div className="pointer-events-auto absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900/90 px-2 py-1 text-xs font-bold text-white shadow-lg backdrop-blur">
            <SetaDePagina
              Icone={ChevronLeft}
              rotulo="Página anterior"
              podeVirar={ehProfessor && palco.pagina > 1}
              ehProfessor={ehProfessor}
              aoClicar={() => aoVirarPagina(palco.pagina - 1)}
            />
            <span className="tabular-nums">
              {palco.pagina} / {palco.paginas}
            </span>
            <SetaDePagina
              Icone={ChevronRight}
              rotulo="Próxima página"
              podeVirar={ehProfessor && palco.pagina < palco.paginas}
              ehProfessor={ehProfessor}
              aoClicar={() => aoVirarPagina(palco.pagina + 1)}
            />
          </div>
        )}
      </div>

      {/*
        Só para o professor. O enquadramento é parte do que ele está ensinando
        — "olha aqui nesta linha" só quer dizer alguma coisa se "aqui" for o
        mesmo lugar nas duas telas —, então o aluno recebe a vista e não tem
        onde mexer nela.
      */}
      {podeComandar && (
        <div className="absolute top-3 right-3 flex items-center gap-0.5 rounded-full bg-neutral-900/90 px-1.5 py-1 text-white shadow-lg backdrop-blur">
          <BotaoDaBarra
            Icone={ajuste === 'largura' ? Minimize2 : Maximize2}
            rotulo={
              ajuste === 'largura'
                ? 'Encaixar a página inteira na tela'
                : 'Ocupar toda a largura (a página passa a rolar)'
            }
            ativo={ajuste === 'largura'}
            aoClicar={() =>
              aoMudarVista({
                ...vista,
                ajuste: ajuste === 'largura' ? 'encaixar' : 'largura',
              })
            }
          />

          <span className="mx-1 h-5 w-px bg-neutral-700" />

          <BotaoDaBarra
            Icone={ZoomOut}
            rotulo="Diminuir"
            desabilitado={zoom <= ZOOM_MIN}
            aoClicar={() => ampliar(-PASSO)}
          />
          <span className="w-10 text-center text-[11px] font-bold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <BotaoDaBarra
            Icone={ZoomIn}
            rotulo="Ampliar"
            desabilitado={zoom >= ZOOM_MAX}
            aoClicar={() => ampliar(PASSO)}
          />

          <span className="mx-1 h-5 w-px bg-neutral-700" />

          <BotaoDaBarra
            Icone={Hand}
            rotulo={mao ? 'Desligar a mão' : 'Arrastar a página com a mão'}
            ativo={mao}
            aoClicar={() => setMao((v) => !v)}
          />
        </div>
      )}
    </div>
  )
}

function BotaoDaBarra({
  Icone,
  rotulo,
  ativo = false,
  desabilitado = false,
  aoClicar,
}: {
  Icone: LucideIcon
  rotulo: string
  ativo?: boolean
  desabilitado?: boolean
  aoClicar: () => void
}) {
  return (
    <button
      onClick={aoClicar}
      disabled={desabilitado}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ativo}
      className={`grid h-8 w-8 place-items-center rounded-full transition disabled:opacity-30 ${
        ativo ? 'bg-violet-300 text-neutral-900' : 'text-neutral-200 hover:bg-neutral-700'
      }`}
    >
      <Icone className="h-4 w-4" />
    </button>
  )
}

function SetaDePagina({
  Icone,
  rotulo,
  podeVirar,
  ehProfessor,
  aoClicar,
}: {
  Icone: typeof ChevronLeft
  rotulo: string
  podeVirar: boolean
  ehProfessor: boolean
  aoClicar: () => void
}) {
  return (
    <button
      onClick={aoClicar}
      disabled={!podeVirar}
      title={ehProfessor ? rotulo : `${rotulo} — quem vira a página é o professor`}
      className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-neutral-700 disabled:opacity-30"
    >
      <Icone className="h-4 w-4" />
    </button>
  )
}
