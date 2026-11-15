import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, X } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import { useSaldoDeCreditos } from '@/features/creditos/api'
import { reais, reaisDeCentavos, taxaDaPlataformaCentavos } from '@/lib/custo-ia'
import { usePlanosAluno } from './planosAluno'
import { type Assinante, useAssinantes, useCancelarContratada, useContratarPlano, useDarPraticas } from './vendas'

const MOTIVOS: Record<string, string> = {
  caro: 'ficou caro',
  sem_tempo: 'sem tempo',
  terminei: 'terminou a trilha',
  nao_gostei: 'não gostou',
  outro: 'outro motivo',
  professor: 'cancelado por você',
}
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/**
 * Aba Assinantes (docs/TUTOR-TRILHAS.md §8.4): quem assina, quanto já usou do
 * tutor no mês, cancelamentos e o motivo. Dá para somar práticas e contratar
 * um plano para um aluno pagando com os créditos (§5.4).
 */
export function AbaAssinantes() {
  const { data: assinantes, isLoading } = useAssinantes()
  const [contratando, setContratando] = useState(false)
  // Quem pagou e foi recusado sai da lista (§5): mostra só as ativas e as que
  // o próprio aluno ou o professor cancelou.
  const lista = (assinantes ?? []).filter((a) => a.status === 'ativa' || a.motivo_encerramento === 'cancelada' || a.motivo_encerramento === 'professor')

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {assinantes ? `${assinantes.filter((a) => a.status === 'ativa').length} assinaturas ativas` : ' '}
        </p>
        <button
          type="button"
          onClick={() => setContratando(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" /> Contratar para um aluno
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : lista.length === 0 ? (
        <p className="mt-4 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">
          Ninguém assina ainda. Mande o link de venda de um plano para seus alunos, ou contrate um plano para um deles.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {lista.map((a) => (
            <LinhaAssinante key={a.id} a={a} />
          ))}
        </ul>
      )}

      {contratando && <ContratarPlano aoFechar={() => setContratando(false)} />}
    </div>
  )
}

function LinhaAssinante({ a }: { a: Assinante }) {
  const dar = useDarPraticas()
  const cancelar = useCancelarContratada()
  const total = a.praticas_mes + a.praticas_extra
  const encerrada = a.status === 'encerrada'
  const situacao = encerrada
    ? `Encerrada em ${data(a.encerrada_em ?? a.periodo_fim)}`
    : a.cancela_no_fim
      ? `Termina em ${data(a.periodo_fim)}${a.motivo_cancelamento ? ` · ${MOTIVOS[a.motivo_cancelamento] ?? a.motivo_cancelamento}` : ''}`
      : `Renova em ${data(a.periodo_fim)}`

  return (
    <li className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${encerrada ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <Link to={`/alunos/${a.aluno_id}`} className="font-bold hover:underline">
          {a.alunoNome}
        </Link>
        <p className="text-xs text-neutral-500">
          {a.planoNome} · {reaisDeCentavos(a.preco_centavos)}
          {a.pago_por === 'professor' && ' · contratada por você'}
        </p>
        <p className={`text-xs font-semibold ${a.cancela_no_fim || encerrada ? 'text-amber-700' : 'text-neutral-400'}`}>{situacao}</p>
      </div>
      {!encerrada && (
        <div className="text-right">
          <p className="text-sm font-extrabold">
            {a.praticasUsadas}/{total}
          </p>
          <p className="text-[11px] text-neutral-400">práticas no mês</p>
        </div>
      )}
      {!encerrada && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => dar.mutate({ assinaturaId: a.id, quantidade: 5 })}
            disabled={dar.isPending}
            title="Somar 5 práticas neste mês. A IA delas sai do repasse deste aluno."
            className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
          >
            +5 práticas
          </button>
          {a.pago_por === 'professor' && !a.cancela_no_fim && (
            <button
              type="button"
              onClick={() => cancelar.mutate(a.id)}
              disabled={cancelar.isPending}
              className="rounded-full px-3 py-1.5 text-xs font-bold text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
            >
              Não renovar
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function ContratarPlano({ aoFechar }: { aoFechar: () => void }) {
  const { data: alunos } = useAlunos('ativo')
  const { data: planos } = usePlanosAluno()
  const { data: saldo } = useSaldoDeCreditos()
  const contratar = useContratarPlano()
  const [alunoId, setAlunoId] = useState('')
  const [planoId, setPlanoId] = useState('')
  const plano = planos?.find((p) => p.id === planoId)
  const taxa = plano ? taxaDaPlataformaCentavos(plano.preco_centavos) : 0
  const semSaldo = plano && saldo !== undefined && saldo < plano.preco_centavos / 100

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="contratar" className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/40 p-4" onClick={aoFechar}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 id="contratar" className="text-lg font-extrabold">
            Contratar para um aluno
          </h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Para o aluno que te paga por fora, ou que ganha o plano. Ele não cadastra cartão.</p>

        <label className="mt-4 block text-sm font-bold">
          Aluno
          <select value={alunoId} onChange={(e) => setAlunoId(e.target.value)} className="mt-1 block w-full rounded-xl border border-neutral-200 px-3 py-2 font-normal">
            <option value="">Escolha…</option>
            {(alunos ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-bold">
          Plano
          <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} className="mt-1 block w-full rounded-xl border border-neutral-200 px-3 py-2 font-normal">
            <option value="">Escolha…</option>
            {(planos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {reaisDeCentavos(p.preco_centavos)}
              </option>
            ))}
          </select>
        </label>

        {plano && (
          <div className="mt-3 space-y-1 rounded-2xl bg-neutral-50 p-3 text-sm">
            <p className="flex justify-between">
              <span className="text-neutral-500">Sai dos seus créditos agora</span>
              <strong>{reaisDeCentavos(plano.preco_centavos)}</strong>
            </p>
            <p className="flex justify-between">
              <span className="text-neutral-500">Volta no repasse, daqui a um mês</span>
              <strong>{reaisDeCentavos(plano.preco_centavos - taxa)} − IA do aluno</strong>
            </p>
            <p className="text-xs text-neutral-500">
              Na prática você paga a taxa ({reaisDeCentavos(taxa)}) e a IA que o aluno usar. Renova todo mês no mesmo dia, pelos créditos.
            </p>
            {saldo !== undefined && (
              <p className={`text-xs font-bold ${semSaldo ? 'text-rose-600' : 'text-neutral-500'}`}>
                Seu saldo: {reais(saldo)}
                {semSaldo && (
                  <>
                    {' · '}
                    <Link to="/creditos" className="underline">
                      Adicionar créditos
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {contratar.error && <p className="mt-3 text-sm font-medium text-rose-600">{contratar.error.message}</p>}
        <button
          type="button"
          disabled={!alunoId || !plano || Boolean(semSaldo) || contratar.isPending}
          onClick={() => contratar.mutate({ alunoId, planoId }, { onSuccess: aoFechar })}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {contratar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Contratar
        </button>
      </div>
    </div>
  )
}
