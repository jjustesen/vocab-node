import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { isTrackReference, type TrackReferenceOrPlaceholder } from '@livekit/components-react'
import {
  GraduationCap,
  Loader2,
  PanelLeft,
  PanelRightClose,
  PanelRightOpen,
  PanelTop,
  Presentation,
  Video,
} from 'lucide-react'
import '@livekit/components-styles'
import { useAulasDoAluno } from '@/features/aulas/api'
import { pedeIdentificacao, useAcessoSala, type AcessoSala, type ModoDeEntrada } from './api'
import { useAlunosDaTurma } from '@/features/turmas/api'
import { aulaDeAgora } from './aula-de-agora'
import { useCanal, useSalaConectada } from './canal'
import { BarraDeMidia } from './BarraDeMidia'
import { useLayoutDaSala, type PosicaoDaCamera } from './layout-da-sala'
import { Palco } from './Palco'
import { PainelDaAula } from './PainelDaAula'
import { SeletorDeConteudo } from './SeletorDeConteudo'
import {
  nomeDo,
  PALCO_VAZIO,
  VISTA_PADRAO,
  type MensagemPalco,
  type Palco as EstadoPalco,
  type Vista,
} from './estado-palco'

/**
 * A sala de vídeo, para as três portas de entrada (ver `sala-entrar`).
 *
 * Duas etapas de propósito: antessala e chamada. O navegador do celular só
 * libera câmera e microfone a partir de um gesto do usuário — sem o botão, o
 * iOS Safari abriria a página e falharia sozinho ao pedir a mídia. A antessala
 * também é onde a pessoa confere com quem vai falar antes de aparecer na tela
 * de alguém.
 */
export function SalaPage({ entrada }: { entrada: ModoDeEntrada }) {
  const navigate = useNavigate()
  /**
   * Quem a pessoa diz que e — so existe na porta de TURMA.
   *
   * Na sala 1:1 o token ja identifica quem entrou, entao pedir e-mail ali
   * seria fricção sem informacao nova (e travaria todo aluno cadastrado sem
   * e-mail, que hoje e a maioria). Ver o cabecalho de 0015.
   */
  const [identificacao, setIdentificacao] = useState<{ nome: string; email: string } | null>(null)

  const entradaComNome: ModoDeEntrada =
    entrada.modo === 'convidado' && identificacao ? { ...entrada, ...identificacao } : entrada

  const { data, isLoading, error } = useAcessoSala(entradaComNome)
  const [conectar, setConectar] = useState(false)
  /**
   * `onDisconnected` do LiveKit dispara nos DOIS casos: quando a pessoa
   * desliga e quando a conexão nunca chegou a subir (servidor fora do ar, URL
   * errada, rede bloqueando UDP). Sem separar os dois, uma falha de conexão
   * jogaria o professor de volta na ficha do aluno sem dizer nada — parece que
   * o botão "Entrar" simplesmente não funcionou.
   */
  const [entrou, setEntrou] = useState(false)
  const [caiuAntesDeEntrar, setCaiuAntesDeEntrar] = useState(false)

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-950">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
      </div>
    )
  }

  /**
   * A porta de turma respondeu "quem e voce?". Recusa de e-mail desconhecido
   * volta como erro DEPOIS de a pessoa ter tentado — os dois casos caem na
   * mesma tela, um com a caixa em branco e o outro com o motivo à vista.
   */
  const precisaSeIdentificar = Boolean(data && pedeIdentificacao(data))
  const recusado = Boolean(error && identificacao)

  if (precisaSeIdentificar || recusado) {
    return (
      <Identificacao
        turmaNome={data && pedeIdentificacao(data) ? data.turmaNome : null}
        erro={recusado && error instanceof Error ? error.message : null}
        inicial={identificacao}
        aoEnviar={setIdentificacao}
      />
    )
  }

  if (error || !data || pedeIdentificacao(data)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-950 px-6 text-center">
        <div className="max-w-sm">
          <p className="font-bold text-white">Não consegui abrir a sala.</p>
          <p className="mt-2 text-sm text-neutral-400">
            {error instanceof Error ? error.message : 'Tente novamente em instantes.'}
          </p>
        </div>
      </div>
    )
  }

  if (!conectar) {
    /**
     * O que dá nome à antessala. Numa TURMA é sempre o nome da turma, para os
     * dois lados: desde que o aluno pode ter várias salas na lista do painel,
     * "Aula com a Ana" deixou de responder à única pergunta que importa aqui —
     * em qual das aulas dele ele está entrando.
     */
    const titulo =
      data.contexto.tipo === 'turma'
        ? data.contexto.turmaNome
        : data.papel === 'professor'
          ? data.contexto.alunoNome
          : `Aula com ${data.professorNome.split(' ')[0]}`
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-950 px-6">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-violet-300 text-neutral-900">
            <GraduationCap className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-xl font-extrabold text-white">{titulo}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Você vai entrar como <span className="font-bold text-neutral-300">{data.nomeExibido}</span>.
          </p>

          {caiuAntesDeEntrar && (
            <p className="mt-5 rounded-2xl bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-300">
              Não consegui conectar à sala. Verifique sua internet e tente de novo — se persistir, pode ser
              a rede bloqueando a chamada.
            </p>
          )}

          <button
            onClick={() => {
              setCaiuAntesDeEntrar(false)
              setConectar(true)
            }}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-violet-300 px-6 py-4 text-sm font-extrabold text-neutral-900"
          >
            <Video className="h-4 w-4" /> {caiuAntesDeEntrar ? 'Tentar de novo' : 'Entrar na sala'}
          </button>
          <p className="mt-4 text-xs text-neutral-500">
            O navegador vai pedir acesso à câmera e ao microfone.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh bg-neutral-950" data-lk-theme="default">
      <LiveKitRoom
        serverUrl={data.url}
        token={data.token}
        connect
        video
        audio
        onConnected={() => setEntrou(true)}
        // Sair da chamada não pode deixar a pessoa numa tela preta: o professor
        // volta para a ficha do aluno, o aluno para o painel, e o convidado sem
        // conta para a antessala — que é o único lugar que ele conhece.
        //
        // Mas só quando houve chamada: se a conexão nunca subiu, o caminho é
        // voltar para a antessala com o motivo à vista, e não sair da tela.
        onDisconnected={() => {
          if (!entrou) {
            setCaiuAntesDeEntrar(true)
            setConectar(false)
            return
          }
          setEntrou(false)
          if (entrada.modo === 'professor') navigate(`/alunos/${entrada.alunoId}`)
          else if (entrada.modo === 'professor-turma') navigate('/turmas')
          // O aluno com conta volta para a LISTA de aulas ao vivo, não para o
          // painel: é de lá que ele veio, e é lá que estão as outras salas
          // dele — voltar para a raiz do painel o obrigaria a navegar de novo.
          else if (entrada.modo === 'aluno-logado' || entrada.modo === 'aluno-logado-turma')
            navigate('/painel/sala')
          else setConectar(false)
        }}
        className="h-full"
      >
        <SalaAberta acesso={data} />
      </LiveKitRoom>
    </div>
  )
}

/**
 * O miolo da sala — precisa ser um componente à parte porque os hooks do
 * LiveKit (`useTracks`, `useDataChannel`) só funcionam DENTRO de `LiveKitRoom`.
 *
 * ── O palco ─────────────────────────────────────────────────────────────────
 *
 * A sala tem UM palco, e ele não é a tela de ninguém — é estado compartilhado
 * (ver `estado-palco.ts` para o modelo inteiro e por que ele difere de compartilhar
 * tela). O vídeo nunca some: numa aula de idioma, ver a boca de quem fala é
 * parte do conteúdo. Quando algo sobe ao palco, o vídeo vira tira fina no topo
 * em vez de dar lugar.
 *
 * ── Quem comanda ────────────────────────────────────────────────────────────
 *
 * O professor, e só ele: o que sobe ao palco, qual página do PDF está aberta e
 * o que se escreve por cima. O aluno recebe tudo ao vivo e participa pelo
 * DOCUMENTO, que continua sendo de todos — é lá que ele escreve, e é de lá que
 * sai o material que ele leva da aula.
 */
function SalaAberta({ acesso }: { acesso: AcessoSala }) {
  const eu = acesso.participanteId
  const ehProfessor = acesso.papel === 'professor'

  const [palco, setPalco] = useState<EstadoPalco>(PALCO_VAZIO)
  const [vista, setVista] = useState<Vista>(VISTA_PADRAO)
  const { posicao, fracao, alternarPosicao, definirFracao } = useLayoutDaSala()
  /** A área que a tira e o palco dividem — a régua do divisor. */
  const areaRef = useRef<HTMLDivElement>(null)
  const [arrastandoDivisor, setArrastandoDivisor] = useState(false)
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [painelAberto, setPainelAberto] = useState(true)
  /** Qual aluno o painel esta mostrando. Numa turma, o professor escolhe. */
  const [alunoNoPainel, setAlunoNoPainel] = useState<string | null>(null)

  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  })

  // O painel e do professor. Numa turma ele lista a turma inteira; no 1:1, o
  // unico aluno. Os dois casos passam pela mesma tela.
  const contexto = acesso.contexto
  const { data: alunosDaTurma } = useAlunosDaTurma(
    ehProfessor && contexto.tipo === 'turma' ? contexto.turmaId : undefined,
  )

  const alunosDoPainel = useMemo(() => {
    if (!ehProfessor) return []
    if (contexto.tipo === 'aluno') return [{ id: contexto.alunoId, nome: contexto.alunoNome }]
    return (alunosDaTurma ?? []).map((a) => ({ id: a.id, nome: a.nome }))
  }, [ehProfessor, contexto, alunosDaTurma])

  const podeVerPainel = ehProfessor && alunosDoPainel.length > 0
  const alunoSelecionado =
    alunosDoPainel.find((a) => a.id === alunoNoPainel) ?? alunosDoPainel[0] ?? null

  /**
   * Qual aula recebe o documento.
   *
   * No 1:1 e a aula daquele aluno. Numa TURMA o documento e um so para a sala
   * inteira, entao ele e carimbado na aula do aluno que esta aberto no painel
   * — que e onde o professor ja esta trabalhando. Nao e a modelagem final (o
   * certo seria um "encontro" com N aulas penduradas, ver o cabecalho de
   * 0015), mas e previsivel e nao inventa dado: o texto vai para uma aula que
   * existe.
   */
  const { data: aulas } = useAulasDoAluno(alunoSelecionado?.id)
  const contextoDoDocumento = useMemo(
    () =>
      alunoSelecionado
        ? { alunoId: alunoSelecionado.id, aulaId: aulaDeAgora(aulas)?.id ?? null }
        : null,
    [alunoSelecionado, aulas],
  )


  // ── palco pelo canal ──────────────────────────────────────────────────────

  const enviarRef = useRef<((m: MensagemPalco) => void) | null>(null)

  // O palco e a vista mudam juntos numa referência só para o handler abaixo
  // não precisar entrar nas dependências do canal — ele é recriado a cada
  // render e leria valores velhos.
  const atualRef = useRef({ palco, vista })
  atualRef.current = { palco, vista }

  const enviar = useCanal<MensagemPalco>('palco', (msg) => {
    if (msg.t === 'pedir-estado') {
      // Só o PROFESSOR responde. Ele é a fonte única do palco; se os alunos
      // também respondessem, quem acabou de entrar veria a resposta que
      // chegasse por último — que pode ser a de alguém desatualizado.
      //
      // Palco e vista vão juntos: quem entra no meio da aula precisa cair no
      // mesmo pedaço do exercício que o resto da turma está olhando, não na
      // página inteira reduzida.
      if (ehProfessor) enviarRef.current?.({ t: 'palco', ...atualRef.current })
      return
    }
    if (msg.t === 'vista') {
      setVista(msg.vista)
      return
    }
    setPalco(msg.palco)
    setVista(msg.vista)
  })
  enviarRef.current = enviar

  // Quem chega depois pergunta o que está no ar; o professor responde. Sem
  // isso, entrar no meio da aula mostraria uma sala vazia enquanto o outro
  // olha para o exercício. Só depois de conectar — ver `useSalaConectada`.
  const conectada = useSalaConectada()
  useEffect(() => {
    if (conectada) enviar({ t: 'pedir-estado' })
  }, [conectada, enviar])

  const definirPalco = useCallback(
    (novo: EstadoPalco) => {
      setPalco(novo)
      // Conteúdo novo começa enquadrado do zero — herdar 3x de zoom do PDF
      // anterior abriria o próximo num pedaço aleatório do canto, e o aluno
      // veria isso antes de o professor perceber.
      setVista(VISTA_PADRAO)
      enviar({ t: 'palco', palco: novo, vista: VISTA_PADRAO })
    },
    [enviar],
  )

  /**
   * Só o professor emite. O aluno também chama isto (os controles dele são os
   * mesmos), mas o `ehProfessor` corta o envio: o ajuste local dele vale para
   * a tela dele e não arrasta a turma junto.
   */
  const definirVista = useCallback(
    (nova: Vista) => {
      setVista(nova)
      if (ehProfessor) enviar({ t: 'vista', vista: nova })
    },
    [enviar, ehProfessor],
  )

  const noPalco = palco.tipo !== 'nenhum'

  /**
   * A tela compartilhada é SEMPRE o destaque.
   *
   * `useTracks` devolve câmeras e telas na mesma lista, e a primeira versão
   * jogava tudo na tira quando havia palco: a tela que alguém acabou de
   * compartilhar aparecia num ladrilho de 120px ao lado do rosto dele, e o
   * palco continuava ocupando o centro com o PDF de antes. Ninguém compartilha
   * a tela para ela ficar pequena — se há uma, ela é o centro, o palco espera
   * e as câmeras vão para a tira.
   *
   * `isTrackReference` porque `useTracks` também devolve MARCADORES (a câmera
   * de quem está sem câmera). Tela compartilhada só existe quando publicada,
   * então um marcador dela nunca chega aqui — mas o filtro deixa isso
   * explícito em vez de depender de um detalhe do pacote.
   */
  const telaCompartilhada = tracks.find(
    (t) => t.source === Track.Source.ScreenShare && isTrackReference(t),
  )
  const cameras = useMemo(() => tracks.filter((t) => t.source === Track.Source.Camera), [tracks])

  /** Há algo no centro — palco OU tela — e as câmeras vão para a tira. */
  const temDestaque = noPalco || Boolean(telaCompartilhada)

  /**
   * O divisor não move nada de tamanho fixo: ele só decide quanto do eixo cabe
   * a cada um. Tira e palco continuam desenhando o que já desenhavam —
   * ladrilhos 16:9 e a caixa na proporção do material — então nenhum dos dois
   * deforma em nenhuma posição da linha. O que muda é o quanto sobra.
   */
  function aoPressionarDivisor(evento: React.PointerEvent<HTMLDivElement>) {
    // Sem `preventDefault` o navegador começa a selecionar texto no arrasto, e
    // o ponteiro passa a arrastar uma seleção fantasma por cima do vídeo.
    evento.preventDefault()
    evento.currentTarget.setPointerCapture(evento.pointerId)
    setArrastandoDivisor(true)
  }

  function aoMoverDivisor(evento: React.PointerEvent<HTMLDivElement>) {
    if (!arrastandoDivisor) return
    const regua = areaRef.current?.getBoundingClientRect()
    if (!regua || regua.width === 0 || regua.height === 0) return
    definirFracao(
      posicao === 'lateral'
        ? (evento.clientX - regua.left) / regua.width
        : (evento.clientY - regua.top) / regua.height,
    )
  }

  function aoSoltarDivisor() {
    if (!arrastandoDivisor) return
    setArrastandoDivisor(false)
    definirFracao(fracao, true)
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex min-h-0 flex-1 gap-2">
        <div
          ref={areaRef}
          className={`flex min-w-0 flex-1 ${
            temDestaque && posicao === 'lateral' ? 'flex-row' : 'flex-col'
          } ${temDestaque ? '' : 'gap-2'}`}
        >
          {/*
            O vídeo nunca sai da tela; só encolhe quando há destaque — e ao
            encolher vira TIRA, não uma faixa esticada. Ver `TiraDeVideo`.
          */}
          {temDestaque ? (
            <>
              <TiraDeVideo tracks={cameras} posicao={posicao} fracao={fracao} />
              <Divisor
                posicao={posicao}
                arrastando={arrastandoDivisor}
                aoPressionar={aoPressionarDivisor}
                aoMover={aoMoverDivisor}
                aoSoltar={aoSoltarDivisor}
              />
            </>
          ) : (
            <div className="min-h-0 flex-1">
              <GridLayout tracks={tracks} className="h-full">
                <ParticipantTile />
              </GridLayout>
            </div>
          )}

          {telaCompartilhada ? (
            // A tela no lugar do palco, inteira e sem cortar: `contain` vem do
            // próprio pacote para `screen_share` — é o único tipo de vídeo em
            // que ele não usa `cover`, porque cortar a borda de uma tela é
            // cortar conteúdo.
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl bg-black">
              <ParticipantTile trackRef={telaCompartilhada} className="h-full w-full" />
            </div>
          ) : (
            <Palco
              palco={palco}
              vista={vista}
              aoMudarVista={definirVista}
              eu={eu}
              podeAnotar={ehProfessor}
              ehProfessor={ehProfessor}
              contextoDoDocumento={contextoDoDocumento}
              aoVirarPagina={(pagina) => {
                if (palco.tipo !== 'material') return
                definirPalco({ ...palco, pagina })
              }}
            />
          )}
        </div>

        {podeVerPainel && painelAberto && alunoSelecionado && (
          <aside className="hidden w-80 shrink-0 lg:block">
            <PainelDaAula
              alunos={alunosDoPainel}
              alunoId={alunoSelecionado.id}
              aoTrocarAluno={setAlunoNoPainel}
              turmaId={contexto.tipo === 'turma' ? contexto.turmaId : null}
            />
          </aside>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <BarraDeMidia />

        {ehProfessor ? (
          <button
            onClick={() => setSeletorAberto(true)}
            title="Escolher o que fica no centro da tela"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${
              noPalco ? 'bg-violet-300 text-neutral-900' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
            }`}
          >
            <Presentation className="h-4 w-4" /> {nomeDo(palco)}
          </button>
        ) : (
          <span className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-bold text-neutral-500">
            {nomeDo(palco)}
          </span>
        )}

        {/*
          Só aparece quando há palco: sem nada no centro da tela o vídeo ocupa
          tudo, e o botão não teria efeito nenhum — controle morto confunde
          mais do que ajuda.
        */}
        {ehProfessor && temDestaque && (
          <button
            onClick={alternarPosicao}
            title={posicao === 'topo' ? 'Mover as câmeras para a lateral' : 'Mover as câmeras para o topo'}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-2 text-sm font-bold text-neutral-200 transition hover:bg-neutral-700"
          >
            {posicao === 'topo' ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelTop className="h-4 w-4" />
            )}
            Câmeras
          </button>
        )}

        {podeVerPainel && (
          <button
            onClick={() => setPainelAberto((v) => !v)}
            title="Anotações e ficha do aluno"
            className="hidden items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-2 text-sm font-bold text-neutral-200 transition hover:bg-neutral-700 lg:flex"
          >
            {painelAberto ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            Painel
          </button>
        )}
      </div>

      {/*
        A turma INTEIRA, e não só o aluno aberto no painel: o material que sobe
        na sala de grupo é do grupo, e a lista mostra a união das fichas
        dizendo quem já tem o quê.
      */}
      {seletorAberto && (
        <SeletorDeConteudo
          alunos={alunosDoPainel}
          aoEscolher={definirPalco}
          aoFechar={() => setSeletorAberto(false)}
        />
      )}

      {/* Sem isto ninguém ouve ninguém: `GridLayout` só renderiza o vídeo. */}
      <RoomAudioRenderer />
    </div>
  )
}

/**
 * A linha entre a câmera e o palco.
 *
 * Invisível até o ponteiro chegar perto: numa aula, o que tem que estar à
 * vista é a pessoa e o exercício — uma barra cinza permanente no meio da tela
 * seria mais um elemento de interface disputando atenção com o conteúdo. Ela
 * aparece quando a mão vai atrás dela, que é o único momento em que serve para
 * alguma coisa, e continua visível durante o arrasto (senão sumiria justo
 * enquanto está sendo usada).
 *
 * A área de clique é bem maior que o traço — 12px contra 2px. Mirar num fio de
 * cabelo é o defeito clássico deste controle, e o alvo grande não custa nada
 * porque só a linha é pintada.
 */
function Divisor({
  posicao,
  arrastando,
  aoPressionar,
  aoMover,
  aoSoltar,
}: {
  posicao: PosicaoDaCamera
  arrastando: boolean
  aoPressionar: (e: React.PointerEvent<HTMLDivElement>) => void
  aoMover: (e: React.PointerEvent<HTMLDivElement>) => void
  aoSoltar: () => void
}) {
  const lateral = posicao === 'lateral'

  return (
    <div
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      role="separator"
      aria-orientation={lateral ? 'vertical' : 'horizontal'}
      aria-label="Ajustar o espaço entre a câmera e a apresentação"
      title="Arraste para ajustar o espaço entre a câmera e a apresentação"
      className={`group flex shrink-0 touch-none items-center justify-center ${
        lateral ? 'w-3 cursor-col-resize' : 'h-3 cursor-row-resize'
      }`}
    >
      <span
        className={`rounded-full transition-colors ${
          lateral ? 'h-16 w-0.5' : 'h-0.5 w-16'
        } ${arrastando ? 'bg-violet-300' : 'bg-transparent group-hover:bg-neutral-600'}`}
      />
    </div>
  )
}

/**
 * O vídeo quando há algo no palco.
 *
 * ── Por que não é o `GridLayout` encolhido ──────────────────────────────────
 *
 * Era: uma faixa de altura fixa e largura inteira com o `GridLayout` dentro.
 * O grid estica os ladrilhos para preencher o que recebe, e o vídeo do LiveKit
 * é `object-fit: cover` — numa faixa de 112px de altura por 1200px de largura,
 * a câmera 16:9 de cada um virava uma tira em que só sobrava a testa. Era o
 * enquadramento que se perdia, não a resolução.
 *
 * Agora cada ladrilho tem proporção 16:9 fixa (`aspect-video`) e a lista rola
 * quando não cabe, como no Meet: o tamanho cai, o enquadramento não. O
 * `object-fit: contain` vem do CSS em index.css — a regra do pacote de estilos
 * do LiveKit força `cover` até em vídeo landscape, então tem que ser
 * sobrescrita por fora.
 */
function TiraDeVideo({
  tracks,
  posicao,
  fracao,
}: {
  tracks: TrackReferenceOrPlaceholder[]
  posicao: PosicaoDaCamera
  /** Quanto do eixo a tira ocupa — o que o divisor ajusta. */
  fracao: number
}) {
  const lateral = posicao === 'lateral'

  return (
    <div
      data-tira-de-video
      // Percentual, e não pixels: a tira acompanha a janela sem precisar de
      // conta em JS a cada resize. Ver `layout-da-sala.ts`.
      style={lateral ? { width: `${fracao * 100}%` } : { height: `${fracao * 100}%` }}
      className={lateral ? 'shrink-0 overflow-y-auto' : 'shrink-0 overflow-x-auto'}
    >
      {/*
        `justify-center` para uma câmera só não ficar encostada no canto, e
        `min-w-max`/`min-h-max` para que, quando NÃO couber, a lista cresça e
        role em vez de espremer os ladrilhos de volta.
      */}
      <div
        className={`flex gap-2 ${
          lateral ? 'min-h-max flex-col justify-center' : 'h-full min-w-max justify-center'
        }`}
      >
        {tracks.map((track) => (
          <div
            key={`${track.participant.identity}:${track.source}`}
            className={`aspect-video shrink-0 overflow-hidden rounded-lg bg-black ${
              lateral ? 'w-full' : 'h-full'
            }`}
          >
            <ParticipantTile trackRef={track} className="h-full w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A porta da turma: nome e e-mail.
 *
 * O e-mail e a chave — ele precisa ja estar cadastrado entre os alunos da
 * turma, e e isso que impede o link encaminhado de virar porta aberta (0015).
 * O nome e pedido porque e o que a pessoa espera preencher, mas o nome EXIBIDO
 * na sala sai do cadastro, nao daqui: senao bastaria escrever "Professor" para
 * aparecer como ele na lista de participantes.
 */
function Identificacao({
  turmaNome,
  erro,
  inicial,
  aoEnviar,
}: {
  turmaNome: string | null
  erro: string | null
  inicial: { nome: string; email: string } | null
  aoEnviar: (dados: { nome: string; email: string }) => void
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [email, setEmail] = useState(inicial?.email ?? '')

  const podeEntrar = nome.trim().length > 1 && /.+@.+\..+/.test(email.trim())

  return (
    <div className="grid min-h-dvh place-items-center bg-neutral-950 px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (podeEntrar) aoEnviar({ nome: nome.trim(), email: email.trim() })
        }}
        className="w-full max-w-sm"
      >
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-violet-300 text-neutral-900">
          <GraduationCap className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-center text-xl font-extrabold text-white">
          {turmaNome ?? 'Entrar na aula'}
        </h1>
        <p className="mt-1 text-center text-sm text-neutral-400">
          Diga quem é você para entrar nesta aula em grupo.
        </p>

        <label className="mt-6 block text-xs font-bold text-neutral-300">
          Seu nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            placeholder="Como te chamam"
            className="mt-1.5 w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white outline-none placeholder:text-neutral-600 focus:ring-2 focus:ring-violet-400"
          />
        </label>

        <label className="mt-4 block text-xs font-bold text-neutral-300">
          Seu e-mail
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="voce@email.com"
            className="mt-1.5 w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white outline-none placeholder:text-neutral-600 focus:ring-2 focus:ring-violet-400"
          />
          <span className="mt-1.5 block font-medium text-neutral-500">
            Precisa ser o e-mail que o professor cadastrou.
          </span>
        </label>

        {erro && (
          <p className="mt-5 rounded-2xl bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-300">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={!podeEntrar}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-violet-300 px-6 py-4 text-sm font-extrabold text-neutral-900 transition disabled:opacity-40"
        >
          <Video className="h-4 w-4" /> Continuar
        </button>
      </form>
    </div>
  )
}

/** /sala/:alunoId — professor, dentro da sessão dele. */
export function SalaProfessorPage() {
  const { alunoId } = useParams<{ alunoId: string }>()
  return <SalaPage entrada={{ modo: 'professor', alunoId: alunoId! }} />
}

/** /sala/turma/:turmaId — professor, na sala da turma. */
export function SalaProfessorTurmaPage() {
  const { turmaId } = useParams<{ turmaId: string }>()
  return <SalaPage entrada={{ modo: 'professor-turma', turmaId: turmaId! }} />
}

/** /painel/sala/individual — aluno com conta, na sala 1:1 dele. */
export function SalaAlunoPage() {
  return <SalaPage entrada={{ modo: 'aluno-logado' }} />
}

/**
 * /painel/sala/turma/:turmaId — aluno com conta, na sala de uma turma dele.
 *
 * Espelha `/sala/turma/:turmaId` do professor de propósito: os dois lados
 * mandam o mesmo `turmaId` para `sala-entrar`, que acha a MESMA linha de
 * `salas` e devolve o mesmo nome de sala no LiveKit. É essa simetria que
 * garante que os dois caiam na mesma conversa.
 */
export function SalaAlunoTurmaPage() {
  const { turmaId } = useParams<{ turmaId: string }>()
  return <SalaPage entrada={{ modo: 'aluno-logado-turma', turmaId: turmaId! }} />
}

/** /s/:token — aluno sem conta, pelo link que o professor mandou. */
export function SalaConvidadoPage() {
  const { token } = useParams<{ token: string }>()
  return <SalaPage entrada={{ modo: 'convidado', token: token! }} />
}
