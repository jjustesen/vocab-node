import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import {
  GraduationCap,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Presentation,
  Video,
} from 'lucide-react'
import '@livekit/components-styles'
import { useAulasDoAluno } from '@/features/aulas/api'
import { pedeIdentificacao, useAcessoSala, type AcessoSala, type ModoDeEntrada } from './api'
import { useAlunosDaTurma } from '@/features/turmas/api'
import { aulaDeAgora } from './aula-de-agora'
import { useCanal, useSalaConectada } from './canal'
import { Palco } from './Palco'
import { PainelDaAula } from './PainelDaAula'
import { SeletorDeConteudo } from './SeletorDeConteudo'
import {
  nomeDo,
  PALCO_VAZIO,
  type MensagemPalco,
  type Palco as EstadoPalco,
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
    const oOutro =
      data.papel === 'professor'
        ? data.contexto.tipo === 'aluno'
          ? data.contexto.alunoNome
          : data.contexto.turmaNome
        : data.professorNome
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-950 px-6">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-violet-300 text-neutral-900">
            <GraduationCap className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-xl font-extrabold text-white">
            {data.contexto.tipo === 'turma' && data.papel === 'professor'
              ? oOutro
              : `Aula com ${oOutro.split(' ')[0]}`}
          </h1>
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
          else if (entrada.modo === 'aluno-logado') navigate('/painel')
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

  const enviar = useCanal<MensagemPalco>('palco', (msg) => {
    if (msg.t === 'pedir-estado') {
      // Só o PROFESSOR responde. Ele é a fonte única do palco; se os alunos
      // também respondessem, quem acabou de entrar veria a resposta que
      // chegasse por último — que pode ser a de alguém desatualizado.
      if (ehProfessor) enviarRef.current?.({ t: 'palco', palco })
      return
    }
    setPalco(msg.palco)
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
      enviar({ t: 'palco', palco: novo })
    },
    [enviar],
  )

  const noPalco = palco.tipo !== 'nenhum'

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* O vídeo nunca sai da tela; só encolhe quando há palco. */}
          <div className={noPalco ? 'h-28 shrink-0 sm:h-36' : 'min-h-0 flex-1'}>
            <GridLayout tracks={tracks} className="h-full">
              <ParticipantTile />
            </GridLayout>
          </div>

          <Palco
            palco={palco}
            eu={eu}
            podeAnotar={ehProfessor}
            ehProfessor={ehProfessor}
            contextoDoDocumento={contextoDoDocumento}
            aoVirarPagina={(pagina) => {
              if (palco.tipo !== 'material') return
              definirPalco({ ...palco, pagina })
            }}
          />
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
        <ControlBar variation="minimal" controls={{ chat: false, leave: true }} />

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

/** /painel/sala — aluno com conta, entrando pelo painel. */
export function SalaAlunoPage() {
  return <SalaPage entrada={{ modo: 'aluno-logado' }} />
}

/** /s/:token — aluno sem conta, pelo link que o professor mandou. */
export function SalaConvidadoPage() {
  const { token } = useParams<{ token: string }>()
  return <SalaPage entrada={{ modo: 'convidado', token: token! }} />
}
