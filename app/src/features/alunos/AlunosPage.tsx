import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Loader2, Plus, Search, UserPlus } from 'lucide-react'
import { useAlunos, useAlunosComConta, useCriarAluno } from './api'
import { useUsoDoMes } from '@/features/planos/api'
import { PLANOS } from '@/lib/planos'
import { NIVEIS } from '@/types/questao'
import type { NivelCefr } from '@/types/db'

const CORES = [
  'bg-sky-200 text-sky-800',
  'bg-violet-200 text-violet-800',
  'bg-amber-200 text-amber-800',
  'bg-pink-200 text-pink-800',
  'bg-emerald-200 text-emerald-800',
]

export function AlunosPage() {
  const { data: alunos, isLoading, error } = useAlunos('ativo')
  const { data: uso } = useUsoDoMes()
  const { data: comConta } = useAlunosComConta()
  const [busca, setBusca] = useState('')
  const [abrindoNovo, setAbrindoNovo] = useState(false)

  const filtrados = useMemo(() => {
    if (!alunos) return []
    const termo = busca.trim().toLowerCase()
    if (!termo) return alunos
    return alunos.filter((a) => a.nome.toLowerCase().includes(termo))
  }, [alunos, busca])

  const noLimite = uso?.limiteAlunos !== null && uso !== undefined && uso.alunosAtivos >= (uso.limiteAlunos ?? Infinity)

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">
            Alunos{' '}
            {alunos && <span className="font-normal text-neutral-400">· {alunos.length}</span>}
          </h1>
          {uso && uso.limiteAlunos !== null && (
            <p className="mt-0.5 text-xs font-medium text-neutral-400">
              {uso.alunosAtivos}/{uso.limiteAlunos} alunos · plano {PLANOS[uso.plano].nome.toLowerCase()}
            </p>
          )}
        </div>
        <button
          onClick={() => setAbrindoNovo(true)}
          disabled={noLimite}
          title={noLimite ? 'Limite de alunos do plano atingido' : undefined}
          className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Novo aluno
        </button>
      </div>

      {noLimite && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Você atingiu o limite de {uso!.limiteAlunos} alunos do seu plano.{' '}
          <Link to="/plano" className="font-bold underline">
            Fazer upgrade
          </Link>{' '}
          ou arquive um aluno para adicionar mais.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 rounded-full bg-white px-4 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-neutral-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar aluno…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
      </div>

      {isLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      {error && (
        <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não consegui carregar os alunos: {(error as Error).message}
        </p>
      )}

      {alunos && alunos.length === 0 && <EstadoVazio onNovo={() => setAbrindoNovo(true)} />}

      {filtrados.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {filtrados.map((aluno, i) => (
            <li key={aluno.id}>
              <Link
                to={`/alunos/${aluno.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-neutral-50"
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${CORES[i % CORES.length]}`}
                >
                  {aluno.nome.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-neutral-800">{aluno.nome}</p>
                  <p className="truncate text-xs font-medium text-neutral-400">
                    {aluno.email ?? 'sem e-mail cadastrado'}
                  </p>
                </div>
                {aluno.nivel_cefr && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-extrabold text-indigo-700">
                    {aluno.nivel_cefr}
                  </span>
                )}
                {comConta?.has(aluno.id) ? (
                  <span className="hidden rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 sm:inline">
                    com conta
                  </span>
                ) : (
                  <span className="hidden rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500 sm:inline">
                    sem conta
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {alunos && alunos.length > 0 && filtrados.length === 0 && (
        <p className="mt-6 text-center text-sm text-neutral-500">
          Nenhum aluno encontrado para “{busca}”.
        </p>
      )}

      {abrindoNovo && <ModalNovoAluno aoFechar={() => setAbrindoNovo(false)} />}
    </div>
  )
}

function EstadoVazio({ onNovo }: { onNovo: () => void }) {
  return (
    <div className="mt-4 grid place-items-center rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-neutral-400">
        <UserPlus className="h-5 w-5" />
      </span>
      <p className="mt-3 font-bold text-neutral-700">Nenhum aluno ainda</p>
      <p className="mt-1 max-w-xs text-sm text-neutral-500">
        Comece cadastrando um aluno. Só o nome é obrigatório — o resto você preenche depois.
      </p>
      <button
        onClick={onNovo}
        className="mt-5 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white"
      >
        Cadastrar primeiro aluno
      </button>
    </div>
  )
}

function ModalNovoAluno({ aoFechar }: { aoFechar: () => void }) {
  const criar = useCriarAluno()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [nivel, setNivel] = useState<NivelCefr | ''>('')

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    await criar.mutateAsync({
      nome: nome.trim(),
      email: email.trim() || undefined,
      nivel_cefr: nivel || undefined,
    })
    aoFechar()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4"
      onClick={aoFechar}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={enviar}
        className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      >
        <h2 className="text-lg font-extrabold">Novo aluno</h2>
        <p className="text-sm text-neutral-500">Só o nome é obrigatório.</p>

        <label className="mt-5 block">
          <span className="text-xs font-bold text-neutral-600">Nome</span>
          <input
            required
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Júlia Santos"
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-bold text-neutral-600">
            E-mail <span className="font-normal text-neutral-400">(opcional)</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="julia@email.com"
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <div className="mt-4">
          <span className="text-xs font-bold text-neutral-600">
            Nível <span className="font-normal text-neutral-400">(opcional)</span>
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {NIVEIS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNivel(nivel === n ? '' : n)}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-extrabold transition',
                  nivel === n
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-500',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {criar.error && (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            {(criar.error as Error).message}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="flex-1 rounded-full px-5 py-3 text-sm font-bold text-neutral-500"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={criar.isPending || !nome.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar
          </button>
        </div>
      </form>
    </div>
  )
}
