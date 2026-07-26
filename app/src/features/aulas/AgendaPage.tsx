import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock, Loader2 } from 'lucide-react'
import { useAulasEntre, ROTULO_STATUS_AULA } from './api'
import type { AulaStatus } from '@/types/db'

const COR_STATUS: Record<AulaStatus, string> = {
  agendada: 'bg-indigo-50 text-indigo-700',
  realizada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-neutral-100 text-neutral-500',
  falta: 'bg-rose-100 text-rose-700',
}

function inicioDaSemana(data: Date): Date {
  const d = new Date(data)
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDias(data: Date, dias: number): Date {
  const d = new Date(data)
  d.setDate(d.getDate() + dias)
  return d
}

/** RF-43: agenda da semana em uma tela. */
export function AgendaPage() {
  const [deslocamento, setDeslocamento] = useState(0)

  const inicioSemana = useMemo(() => addDias(inicioDaSemana(new Date()), deslocamento * 7), [deslocamento])
  const fimSemana = useMemo(() => addDias(inicioSemana, 7), [inicioSemana])
  const { data: aulas, isLoading } = useAulasEntre(inicioSemana.toISOString(), fimSemana.toISOString())

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDias(inicioSemana, i)), [inicioSemana])
  const hoje = new Date()

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Agenda</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeslocamento((d) => d - 1)}
            className="grid h-9 w-9 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDeslocamento(0)}
            className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-700"
          >
            {inicioSemana.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} –{' '}
            {addDias(inicioSemana, 6).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </button>
          <button
            onClick={() => setDeslocamento((d) => d + 1)}
            className="grid h-9 w-9 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {dias.map((dia) => {
          const éHoje = dia.toDateString() === hoje.toDateString()
          const aulasDoDia = (aulas ?? []).filter((a) => new Date(a.data_hora).toDateString() === dia.toDateString())
          return (
            <div key={dia.toISOString()} className={`rounded-3xl p-3 ${éHoje ? 'bg-violet-200' : 'bg-white'}`}>
              <p
                className={`text-xs font-extrabold uppercase tracking-wide ${éHoje ? 'text-violet-900' : 'text-neutral-400'}`}
              >
                {dia.toLocaleDateString('pt-BR', { weekday: 'short' })} · {dia.getDate()}
              </p>
              <div className="mt-2 space-y-2">
                {aulasDoDia.length === 0 && <p className="text-xs text-neutral-400">Sem aulas</p>}
                {aulasDoDia.map((a) => (
                  <Link
                    key={a.id}
                    to={`/alunos/${a.aluno_id}`}
                    className="block rounded-2xl bg-neutral-50 p-2.5 transition hover:bg-neutral-100"
                  >
                    <p className="truncate text-xs font-bold text-neutral-800">{a.alunoNome}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400">
                      <Clock className="h-3 w-3" />
                      {new Date(a.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <span
                      className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${COR_STATUS[a.status]}`}
                    >
                      {ROTULO_STATUS_AULA[a.status]}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
