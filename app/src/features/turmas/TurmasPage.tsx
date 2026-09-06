import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, Plus, Users, Video, X } from 'lucide-react'
import { useCriarTurma, useTurmas } from './api'

/**
 * Turmas — a lista.
 *
 * Só lista e cria. Quem entra na turma e qual é o link moram em `TurmaPage`,
 * pelo mesmo motivo que a ficha do aluno não mora dentro de `/alunos`: gestão
 * de membros precisa de espaço, e espremida num acordeão ela vira uma rolagem
 * dentro de outra rolagem assim que o professor passa de uma dúzia de alunos.
 */
export function TurmasPage() {
  const { data: turmas, isLoading, error } = useTurmas()
  const [criando, setCriando] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-neutral-900">
          Turmas {turmas ? <span className="text-neutral-400">· {turmas.length}</span> : null}
        </h1>
        <button
          onClick={() => setCriando(true)}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Nova turma
        </button>
      </div>

      {isLoading && (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      {error && (
        <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não consegui carregar as turmas: {(error as Error).message}
        </p>
      )}

      {turmas && turmas.length === 0 && (
        <div className="mt-6 rounded-3xl bg-white p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
            <Users className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-bold text-neutral-900">Nenhuma turma ainda</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-500">
            Uma turma junta vários alunos numa sala só, com um link que vale para todos. Quem abre o
            link se identifica com o e-mail cadastrado — só entra quem está na turma.
          </p>
          <button
            onClick={() => setCriando(true)}
            className="mx-auto mt-4 flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Criar a primeira turma
          </button>
        </div>
      )}

      {turmas && turmas.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {turmas.map((turma) => (
            <li key={turma.id}>
              <Link
                to={`/turmas/${turma.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-neutral-50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                  <Users className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-neutral-900">
                    {turma.nome}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {turma.alunos === 0
                      ? 'nenhum aluno ainda'
                      : `${turma.alunos} ${turma.alunos === 1 ? 'aluno' : 'alunos'}`}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {criando && <ModalNovaTurma aoFechar={() => setCriando(false)} />}
    </div>
  )
}

/**
 * Criar pede SÓ o nome, e leva direto para a turma.
 *
 * Escolher os alunos aqui dentro seria repetir, num modal apertado, a tela que
 * já existe do outro lado — e obrigaria a decidir tudo antes de a turma
 * existir. Nome, entra, monta.
 */
function ModalNovaTurma({ aoFechar }: { aoFechar: () => void }) {
  const criar = useCriarTurma()
  const navigate = useNavigate()
  const [nome, setNome] = useState('')

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!nome.trim()) return
          criar.mutate(nome, { onSuccess: (turma) => navigate(`/turmas/${turma.id}`) })
        }}
        className="w-full max-w-sm rounded-3xl bg-white p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-neutral-900">Nova turma</h2>
          <button
            type="button"
            onClick={aoFechar}
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-4 block text-xs font-bold text-neutral-500">
          Nome da turma
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Conversação B1 — terças"
            className="mt-1.5 w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-violet-400"
          />
        </label>

        {criar.isError && (
          <p className="mt-3 text-xs font-medium text-rose-600">
            {criar.error instanceof Error ? criar.error.message : 'Não consegui criar a turma.'}
          </p>
        )}

        <button
          type="submit"
          disabled={!nome.trim() || criar.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          Criar e escolher os alunos
        </button>
      </form>
    </div>
  )
}
