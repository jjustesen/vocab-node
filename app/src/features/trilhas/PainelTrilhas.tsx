import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Milestone, X } from 'lucide-react'
import { useCriarTrilha, useTrilhas, type ProgressoAluno, type TrilhaComProgresso } from './api'
import { Chip } from '@/components/Chip'
import { minutosEstimados } from '@/features/tarefa/formato'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { NIVEIS } from '@/types/questao'
import type { NivelCefr } from '@/types/db'

/** "~48 min" ou "~1h10" — o total da trilha, para o professor calibrar o tamanho. */
function duracaoTotal(questoes: number): string {
  const minutos = minutosEstimados(questoes)
  if (minutos < 60) return `~${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `~${horas}h` : `~${horas}h${String(resto).padStart(2, '0')}`
}

/**
 * Aba "Trilhas" da biblioteca (mockup P11). Vive dentro de Atividades porque
 * uma trilha é uma sequência de atividades que já existem — não é um tipo de
 * conteúdo à parte, é uma forma de organizar o que o professor já tem.
 */
export function PainelTrilhas({ modalAberto, aoFecharModal }: { modalAberto: boolean; aoFecharModal: () => void }) {
  const { data: trilhas, isLoading, error } = useTrilhas()

  return (
    <div>
      {isLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não consegui carregar as trilhas: {(error as Error).message}
        </p>
      )}

      {trilhas && trilhas.length === 0 && (
        <div className="mt-4 grid place-items-center rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-neutral-400">
            <Milestone className="h-5 w-5" />
          </span>
          <p className="mt-3 font-bold text-neutral-700">Nenhuma trilha ainda</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">
            Junte atividades que você já tem numa sequência — o aluno recebe todas de uma vez e não fica
            esperando você liberar a próxima.
          </p>
        </div>
      )}

      {trilhas && trilhas.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {trilhas.map((t) => (
            <CartaoTrilha key={t.id} trilha={t} />
          ))}
        </div>
      )}

      {modalAberto && <ModalNovaTrilha aoFechar={aoFecharModal} />}
    </div>
  )
}

function CartaoTrilha({ trilha }: { trilha: TrilhaComProgresso }) {
  return (
    <div className="flex flex-col rounded-3xl bg-violet-200 p-6">
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-violet-700">
          <Milestone className="h-5 w-5" />
        </span>
        <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs font-extrabold text-violet-900">
          {trilha.nivel}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-extrabold leading-snug text-neutral-900">{trilha.nome}</h3>
      <p className="text-sm font-medium text-violet-900/70">
        {trilha.etapas} {trilha.etapas === 1 ? 'etapa' : 'etapas'}
        {trilha.questoes > 0 && ` · ${duracaoTotal(trilha.questoes)} no total`}
      </p>

      {trilha.progresso.length > 0 ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex -space-x-2">
              {trilha.progresso.slice(0, 5).map((p) => (
                <span
                  key={p.alunoId}
                  title={p.alunoNome}
                  className={`grid h-7 w-7 place-items-center rounded-full border-2 border-violet-200 text-[10px] font-extrabold ${corDoAvatar(p.alunoId)}`}
                >
                  {inicial(p.alunoNome)}
                </span>
              ))}
            </div>
            <span className="text-xs font-bold text-violet-900">
              {trilha.progresso.length} {trilha.progresso.length === 1 ? 'aluno' : 'alunos'} nesta trilha
            </span>
          </div>

          <div className="mt-4 space-y-2 rounded-2xl bg-white/60 p-3">
            {trilha.progresso.slice(0, 4).map((p) => (
              <BarraProgresso key={p.alunoId} progresso={p} />
            ))}
            {trilha.progresso.length > 4 && (
              <p className="text-xs font-bold text-violet-900/60">e mais {trilha.progresso.length - 4}</p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-2xl bg-white/60 px-3 py-2.5 text-xs font-medium text-violet-900/70">
          Nenhum aluno nesta trilha ainda.
        </p>
      )}

      <Link
        to={`/trilhas/${trilha.id}`}
        className="mt-4 w-fit rounded-full bg-neutral-900 px-5 py-2.5 text-xs font-bold text-white"
      >
        Abrir trilha
      </Link>
    </div>
  )
}

function BarraProgresso({ progresso }: { progresso: ProgressoAluno }) {
  const percentual = progresso.total > 0 ? (progresso.concluidas / progresso.total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 truncate font-bold text-violet-900">
        {progresso.alunoNome.split(' ')[0]}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
        <div
          className={`h-full rounded-full ${progresso.status === 'pausada' ? 'bg-neutral-400' : 'bg-violet-600'}`}
          style={{ width: `${percentual}%` }}
        />
      </div>
      <span className="shrink-0 font-extrabold text-violet-900">
        {progresso.concluidas}/{progresso.total}
      </span>
    </div>
  )
}

function ModalNovaTrilha({ aoFechar }: { aoFechar: () => void }) {
  const criar = useCriarTrilha()
  const [nome, setNome] = useState('')
  const [nivel, setNivel] = useState<NivelCefr>('B1')
  const [descricao, setDescricao] = useState('')

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    await criar.mutateAsync({ nome, nivel, descricao })
    aoFechar()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={salvar}
        className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-extrabold">Nova trilha</h2>
          <button type="button" onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-bold text-neutral-600">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Inglês para viagem"
            className="mt-1.5 w-full rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm outline-none ring-neutral-900 focus:ring-2"
          />
        </label>

        <div className="mt-3">
          <span className="text-xs font-bold text-neutral-600">Nível</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {NIVEIS.map((n) => (
              <Chip key={n} ativo={nivel === n} aoClicar={() => setNivel(n)}>
                {n}
              </Chip>
            ))}
          </div>
        </div>

        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">
            Descrição <span className="font-medium text-neutral-400">(opcional)</span>
          </span>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            placeholder="O que o aluno vai treinar nesta sequência."
            className="mt-1.5 w-full resize-none rounded-2xl bg-neutral-100 px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2"
          />
        </label>

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
            disabled={!nome.trim() || criar.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-40"
          >
            {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </button>
        </div>
      </form>
    </div>
  )
}
