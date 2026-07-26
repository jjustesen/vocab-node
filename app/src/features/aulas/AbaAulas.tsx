import { useState } from 'react'
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAtualizarAula, useAulasDoAluno, useCriarAula, useExcluirAula, ROTULO_STATUS_AULA } from './api'
import type { Aula, AulaStatus } from '@/types/db'

const COR_STATUS: Record<AulaStatus, string> = {
  agendada: 'bg-indigo-50 text-indigo-700',
  realizada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-neutral-100 text-neutral-500',
  falta: 'bg-rose-100 text-rose-700',
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AbaAulas({ alunoId, alunoNome }: { alunoId: string; alunoNome: string }) {
  const { data: aulas, isLoading } = useAulasDoAluno(alunoId)
  const [modalNovaAberto, setModalNovaAberto] = useState(false)
  const [aulaEditando, setAulaEditando] = useState<Aula | null>(null)

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-neutral-900">Aulas</h2>
        <button
          onClick={() => setModalNovaAberto(true)}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Nova aula
        </button>
      </div>

      {isLoading && (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      {aulas && aulas.length === 0 && (
        <div className="mt-4 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="font-bold text-neutral-700">Nenhuma aula registrada</p>
          <p className="mt-1 text-sm text-neutral-500">Registre a primeira aula de {alunoNome.split(' ')[0]}.</p>
        </div>
      )}

      {aulas && aulas.length > 0 && (
        <div className="mt-4 space-y-2">
          {aulas.map((aula) => (
            <div key={aula.id} className="rounded-2xl bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold capitalize text-neutral-800">{formatarDataHora(aula.data_hora)}</p>
                  <p className="text-xs text-neutral-400">{aula.duracao_min} min</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${COR_STATUS[aula.status]}`}>
                    {ROTULO_STATUS_AULA[aula.status]}
                  </span>
                  <button
                    onClick={() => setAulaEditando(aula)}
                    className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {aula.anotacao && (
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
                  {aula.anotacao}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {modalNovaAberto && (
        <ModalAula alunoId={alunoId} aoFechar={() => setModalNovaAberto(false)} />
      )}
      {aulaEditando && <ModalAula aula={aulaEditando} alunoId={alunoId} aoFechar={() => setAulaEditando(null)} />}
    </div>
  )
}

function paraDatetimeLocal(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Exportado para o botão "Anotar aula" da home abrir o mesmo formulário. */
export function ModalAula({
  aula,
  alunoId,
  aoFechar,
}: {
  aula?: Aula
  alunoId: string
  aoFechar: () => void
}) {
  const criar = useCriarAula()
  const atualizar = useAtualizarAula()
  const excluir = useExcluirAula()
  const editando = Boolean(aula)

  const [dataHora, setDataHora] = useState(paraDatetimeLocal(aula?.data_hora))
  const [duracao, setDuracao] = useState(aula?.duracao_min ?? 60)
  const [status, setStatus] = useState<AulaStatus>(aula?.status ?? 'agendada')
  const [anotacao, setAnotacao] = useState(aula?.anotacao ?? '')
  const [repetirSemanas, setRepetirSemanas] = useState(0)

  const emAndamento = criar.isPending || atualizar.isPending || excluir.isPending
  const erro = (criar.error as Error | null)?.message ?? (atualizar.error as Error | null)?.message

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    const dataHoraISO = new Date(dataHora).toISOString()

    if (editando) {
      await atualizar.mutateAsync({
        id: aula!.id,
        campos: { data_hora: dataHoraISO, duracao_min: duracao, status, anotacao: anotacao.trim() || null },
      })
    } else {
      await criar.mutateAsync({
        alunoId,
        dataHoraISO,
        duracaoMin: duracao,
        status,
        anotacao,
        repetirSemanas: repetirSemanas || undefined,
      })
    }
    aoFechar()
  }

  async function excluirAula() {
    if (!aula) return
    await excluir.mutateAsync(aula.id)
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
          <h2 className="text-lg font-extrabold">{editando ? 'Editar aula' : 'Nova aula'}</h2>
          <button type="button" onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold text-neutral-600">Data e hora</span>
            <input
              type="datetime-local"
              required
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-neutral-600">Duração (min)</span>
            <input
              type="number"
              min={15}
              step={15}
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
            />
          </label>
        </div>

        <div className="mt-3">
          <span className="text-xs font-bold text-neutral-600">Status</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(Object.keys(ROTULO_STATUS_AULA) as AulaStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                  status === s ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-500'
                }`}
              >
                {ROTULO_STATUS_AULA[s]}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">Anotação (o que foi dado, o que revisar)</span>
          <textarea
            value={anotacao}
            onChange={(e) => setAnotacao(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        {!editando && (
          <label className="mt-3 block">
            <span className="text-xs font-bold text-neutral-600">Repetir semanalmente (semanas extras)</span>
            <input
              type="number"
              min={0}
              max={26}
              value={repetirSemanas}
              onChange={(e) => setRepetirSemanas(Number(e.target.value))}
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
            />
            <span className="mt-1 block text-xs text-neutral-400">
              Ex.: 3 cria mais 3 aulas, uma por semana, no mesmo dia e horário.
            </span>
          </label>
        )}

        {erro && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{erro}</p>}

        <div className="mt-6 flex gap-2">
          {editando && (
            <button
              type="button"
              onClick={excluirAula}
              disabled={emAndamento}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-rose-200 text-rose-600 disabled:opacity-50"
              title="Excluir aula"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={aoFechar}
            className="flex-1 rounded-full px-5 py-3 text-sm font-bold text-neutral-500"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={emAndamento}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {emAndamento && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
