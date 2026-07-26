import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { mesReferenciaISO, usePagamentosDoMes, useAlternarPagamento } from './api'

function tituloDoMes(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/** RF-100/101/102: registrar mensalidade, marcar pago/pendente, ver pendências do mês. */
export function FinanceiroPage() {
  const [deslocamento, setDeslocamento] = useState(0)
  const mesReferencia = useMemo(() => {
    const base = new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + deslocamento)
    return mesReferenciaISO(base)
  }, [deslocamento])

  const { data: pagamentos, isLoading } = usePagamentosDoMes(mesReferencia)
  const alternar = useAlternarPagamento()

  const pendentes = pagamentos?.filter((p) => p.status === 'pendente') ?? []
  const totalPendente = pendentes.reduce((soma, p) => soma + p.valorMensal, 0)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Financeiro</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeslocamento((d) => d - 1)}
            className="grid h-9 w-9 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDeslocamento(0)}
            className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold capitalize text-neutral-700"
          >
            {tituloDoMes(mesReferencia)}
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

      {pagamentos && (
        <div className="mt-5 rounded-3xl bg-amber-100 p-5">
          <p className="text-xs font-bold text-amber-900">Pendente no mês</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-900">
            R$ {totalPendente.toFixed(2)} <span className="text-sm font-bold">· {pendentes.length} aluno(s)</span>
          </p>
        </div>
      )}

      {pagamentos && pagamentos.length === 0 && (
        <div className="mt-4 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-14 text-center">
          <p className="font-bold text-neutral-700">Nenhum aluno com mensalidade cadastrada</p>
          <p className="mt-1 text-sm text-neutral-500">
            Defina o valor da mensalidade na ficha de cada aluno (botão de editar) para aparecer aqui.
          </p>
        </div>
      )}

      {pagamentos && pagamentos.length > 0 && (
        <div className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {pagamentos.map((p) => (
            <div key={p.alunoId} className="flex items-center gap-3 px-5 py-3.5 text-sm">
              <Link to={`/alunos/${p.alunoId}`} className="flex-1 truncate font-bold text-neutral-800 hover:underline">
                {p.alunoNome}
              </Link>
              <span className="text-neutral-500">R$ {p.valorMensal.toFixed(2)}</span>
              <button
                onClick={() =>
                  alternar.mutate({
                    alunoId: p.alunoId,
                    pagamentoId: p.pagamentoId,
                    mesReferencia,
                    valor: p.valorMensal,
                    novoStatus: p.status === 'pago' ? 'pendente' : 'pago',
                  })
                }
                disabled={alternar.isPending}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold transition disabled:opacity-50 ${
                  p.status === 'pago' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {p.status === 'pago' && <Check className="h-3 w-3" />}
                {p.status === 'pago' ? 'Pago' : 'Pendente'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
