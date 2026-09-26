import { useId } from 'react'
import { DoorOpen, Loader2 } from 'lucide-react'
import { useProfessor } from '@/features/planos/api'
import { useSalvarConfiguracoes } from './api'

/**
 * Configurações da plataforma, do professor.
 *
 * Nasceu com um item só — a sala de espera — e é de propósito uma lista de
 * cartões com interruptor: o próximo ajuste entra como mais um cartão, sem
 * redesenhar a página.
 */
export function ConfiguracoesPage() {
  const { data: professor, isLoading } = useProfessor()
  const salvar = useSalvarConfiguracoes()

  if (isLoading || !professor) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold">Configurações</h1>
      <p className="mt-0.5 text-sm text-neutral-500">Como a plataforma funciona para você e seus alunos.</p>

      <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Aulas ao vivo</h2>

      <div className="mt-3 space-y-3">
        <Interruptor
          Icone={DoorOpen}
          titulo="Sala de espera"
          descricao="O aluno só entra na chamada depois que você admitir. Enquanto espera, ele não vê nem ouve a aula — e você recebe um aviso na sala com o nome dele. Vale para todas as suas salas, individuais e de turma."
          ligado={professor.sala_de_espera}
          aoMudar={(ligado) => salvar.mutate({ sala_de_espera: ligado })}
        />
      </div>

      {salvar.isError && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Não consegui salvar. Verifique sua internet e tente de novo.
        </p>
      )}
    </div>
  )
}

function Interruptor({
  Icone,
  titulo,
  descricao,
  ligado,
  aoMudar,
}: {
  Icone: typeof DoorOpen
  titulo: string
  descricao: string
  ligado: boolean
  aoMudar: (ligado: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-4 rounded-3xl bg-white p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
        <Icone className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="font-extrabold">
          {titulo}
        </label>
        <p id={`${id}-descricao`} className="mt-1 text-sm text-neutral-500">
          {descricao}
        </p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={ligado}
        aria-describedby={`${id}-descricao`}
        onClick={() => aoMudar(!ligado)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${
          ligado ? 'bg-neutral-900' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            ligado ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}
