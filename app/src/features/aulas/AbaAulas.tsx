import { useState } from 'react'
import { AlertTriangle, Loader2, Pencil, Plus, Repeat, Trash2, X } from 'lucide-react'
import {
  useAtualizarAula,
  useAulasDaSerie,
  useAulasDoAluno,
  useCriarAula,
  useExcluirAula,
  rotuloRecorrencia,
  ROTULO_STATUS_AULA,
  type EscopoSerie,
} from './api'
import type { Aula, AulaStatus } from '@/types/db'

const COR_STATUS: Record<AulaStatus, string> = {
  agendada: 'bg-indigo-50 text-indigo-700',
  realizada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-neutral-100 text-neutral-500',
  falta: 'bg-rose-100 text-rose-700',
}

const OPCOES_ESCOPO: { valor: EscopoSerie; rotulo: string }[] = [
  { valor: 'uma', rotulo: 'Só esta aula' },
  { valor: 'futuras', rotulo: 'Esta e as próximas' },
  { valor: 'todas', rotulo: 'Todas da série' },
]

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
                  {aula.serie_id && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                      <Repeat className="h-3 w-3" /> {rotuloRecorrencia(aula.data_hora)}
                    </span>
                  )}
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
  const [escopo, setEscopo] = useState<EscopoSerie>('uma')
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  // Só busca quando a aula veio de uma repetição; serve para dizer quantas
  // aulas cada escopo afeta antes do professor confirmar.
  const { data: aulasDaSerie } = useAulasDaSerie(aula?.serie_id)
  const emSerie = Boolean(aula?.serie_id)
  const totalNaSerie = aulasDaSerie?.length ?? 0
  const totalFuturas = aula
    ? (aulasDaSerie ?? []).filter((a) => new Date(a.data_hora) >= new Date(aula.data_hora)).length
    : 0
  const afetadas = escopo === 'todas' ? totalNaSerie : escopo === 'futuras' ? totalFuturas : 1

  const emAndamento = criar.isPending || atualizar.isPending || excluir.isPending
  const erro =
    (criar.error as Error | null)?.message ??
    (atualizar.error as Error | null)?.message ??
    (excluir.error as Error | null)?.message

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    const dataHoraISO = new Date(dataHora).toISOString()

    if (editando) {
      await atualizar.mutateAsync({
        aula: aula!,
        campos: { data_hora: dataHoraISO, duracao_min: duracao, status, anotacao: anotacao.trim() || null },
        escopo,
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
    // Apagar a série inteira por engano é irreversível — só o escopo de uma
    // aula (o comportamento antigo do botão) segue direto.
    if (emSerie && escopo !== 'uma' && !confirmandoExclusao) {
      setConfirmandoExclusao(true)
      return
    }
    await excluir.mutateAsync({ aula, escopo })
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
            {/* Passo de 1: aula de 50, 45 ou 20 min é comum e o passo de 15
                barrava o envio do formulário. O teto de 1440 (um dia) não é
                regra de negócio, só evita que um dedo escorregado vire uma
                aula de 9999 min na agenda. */}
            <input
              type="number"
              min={1}
              max={1440}
              step={1}
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

        {editando && emSerie && (
          <div className="mt-4 rounded-2xl bg-violet-50 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-violet-900">
              <Repeat className="h-3.5 w-3.5 shrink-0" /> Aula em série · {rotuloRecorrencia(aula!.data_hora)}
            </p>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-violet-700/70">
              Aplicar horário e duração a
            </p>
            <div className="mt-1.5 space-y-1">
              {OPCOES_ESCOPO.map((o) => {
                const marcado = escopo === o.valor
                const contagem = o.valor === 'todas' ? totalNaSerie : o.valor === 'futuras' ? totalFuturas : 1
                return (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => {
                      setEscopo(o.valor)
                      setConfirmandoExclusao(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                      marcado ? 'bg-violet-700 text-white' : 'bg-white text-violet-900 hover:bg-violet-100'
                    }`}
                  >
                    <span
                      className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2 ${
                        marcado ? 'border-white' : 'border-violet-300'
                      }`}
                    >
                      {marcado && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    {o.rotulo}
                    <span className={marcado ? 'ml-auto text-violet-200' : 'ml-auto text-violet-400'}>
                      {contagem} {contagem === 1 ? 'aula' : 'aulas'}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-violet-700/70">
              Status e anotação valem só para esta aula.
            </p>
          </div>
        )}

        {confirmandoExclusao && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-rose-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Excluir {afetadas} {afetadas === 1 ? 'aula' : 'aulas'} desta série?
            </p>
            <p className="mt-0.5 text-[11px] text-rose-700">
              O histórico dessas aulas some junto e não dá para desfazer.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(false)}
                className="flex-1 rounded-full bg-white py-2 text-xs font-bold text-neutral-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={excluirAula}
                disabled={emAndamento}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-rose-600 py-2 text-xs font-extrabold text-white disabled:opacity-50"
              >
                {emAndamento && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Excluir {afetadas}
              </button>
            </div>
          </div>
        )}

        {erro && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{erro}</p>}

        <div className="mt-6 flex gap-2">
          {editando && (
            <button
              type="button"
              onClick={excluirAula}
              disabled={emAndamento}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-rose-200 text-rose-600 disabled:opacity-50"
              title={
                emSerie && escopo !== 'uma'
                  ? `Excluir ${afetadas} ${afetadas === 1 ? 'aula' : 'aulas'} da série`
                  : 'Excluir aula'
              }
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
            {emSerie && escopo !== 'uma' ? `Salvar ${afetadas} aulas` : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
