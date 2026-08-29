import { useState } from 'react'
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
import { GraduationCap, Loader2, PanelRightClose, PanelRightOpen, Pencil, Video } from 'lucide-react'
import '@livekit/components-styles'
import { useAcessoSala, type AcessoSala, type ModoDeEntrada } from './api'
import { Lousa } from './Lousa'
import { PainelDaAula } from './PainelDaAula'

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
  const { data, isLoading, error } = useAcessoSala(entrada)
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

  if (error || !data) {
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
    const oOutro = data.papel === 'professor' ? data.alunoNome : data.professorNome
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-950 px-6">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-violet-300 text-neutral-900">
            <GraduationCap className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-xl font-extrabold text-white">Aula com {oOutro.split(' ')[0]}</h1>
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
          else if (entrada.modo === 'aluno-logado') navigate('/painel')
          else setConectar(false)
        }}
        className="h-full"
      >
        <SalaAberta entrada={entrada} acesso={data} />
      </LiveKitRoom>
    </div>
  )
}

/**
 * O miolo da sala — precisa ser um componente à parte porque os hooks do
 * LiveKit (`useTracks`, `useDataChannel`) só funcionam DENTRO de `LiveKitRoom`.
 *
 * Três zonas: vídeo, lousa e painel. A lousa não substitui a chamada, ela
 * divide a tela com uma tira de vídeo — numa aula de idioma ver a boca de quem
 * fala é parte do conteúdo, então esconder o vídeo para escrever seria perder
 * justamente o que a videochamada traz.
 */
function SalaAberta({ entrada, acesso }: { entrada: ModoDeEntrada; acesso: AcessoSala }) {
  const [lousaAberta, setLousaAberta] = useState(false)
  const [painelAberto, setPainelAberto] = useState(true)

  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  })

  // O painel só existe para o professor, e só quando a rota diz de qual aluno
  // é a sala — nas outras portas de entrada esse id nem chega ao cliente.
  const podeVerPainel = entrada.modo === 'professor' && acesso.papel === 'professor'

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {lousaAberta ? (
            <>
              {/* Vídeo vira tira fina no topo; a lousa fica com o resto. */}
              <div className="h-28 shrink-0 sm:h-36">
                <GridLayout tracks={tracks} className="h-full">
                  <ParticipantTile />
                </GridLayout>
              </div>
              <div className="min-h-0 flex-1">
                <Lousa />
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1">
              <GridLayout tracks={tracks} className="h-full">
                <ParticipantTile />
              </GridLayout>
            </div>
          )}
        </div>

        {podeVerPainel && painelAberto && (
          <aside className="hidden w-80 shrink-0 lg:block">
            <PainelDaAula alunoId={entrada.alunoId} alunoNome={acesso.alunoNome} />
          </aside>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <ControlBar variation="minimal" controls={{ chat: false, leave: true }} />

        <button
          onClick={() => setLousaAberta((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${
            lousaAberta ? 'bg-violet-300 text-neutral-900' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
          }`}
        >
          <Pencil className="h-4 w-4" /> Lousa
        </button>

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

      {/* Sem isto ninguém ouve ninguém: `GridLayout` só renderiza o vídeo. */}
      <RoomAudioRenderer />
    </div>
  )
}

/** /sala/:alunoId — professor, dentro da sessão dele. */
export function SalaProfessorPage() {
  const { alunoId } = useParams<{ alunoId: string }>()
  return <SalaPage entrada={{ modo: 'professor', alunoId: alunoId! }} />
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
