import { Check, Loader2 } from 'lucide-react'
import { mesReferenciaISO, useAlternarPagamento, usePagamentosDoAluno } from './api'

function tituloDoMes(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function AbaPagamentos({ alunoId, valorMensal }: { alunoId: string; valorMensal: number | null }) {
  const { data: pagamentos, isLoading } = usePagamentosDoAluno(alunoId)
  const alternar = useAlternarPagamento()

  if (!valorMensal) {
    return (
      <div className="mt-4 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
        <p className="font-bold text-neutral-700">Sem mensalidade definida</p>
        <p className="mt-1 text-sm text-neutral-500">
          Clique no lápis ao lado do nome do aluno para definir o valor da mensalidade.
        </p>
      </div>
    )
  }

  const mesAtual = mesReferenciaISO()
  const pagamentoAtual = pagamentos?.find((p) => p.referencia_mes === mesAtual) ?? null
  const statusAtual = pagamentoAtual?.status ?? 'pendente'
  const historico = pagamentos?.filter((p) => p.referencia_mes !== mesAtual) ?? []

  return (
    <div className="mt-4">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-3xl bg-white p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">{tituloDoMes(mesAtual)}</p>
              <p className="mt-1 text-lg font-extrabold text-neutral-900">R$ {valorMensal.toFixed(2)}</p>
            </div>
            <button
              onClick={() =>
                alternar.mutate({
                  alunoId,
                  pagamentoId: pagamentoAtual?.id ?? null,
                  mesReferencia: mesAtual,
                  valor: valorMensal,
                  novoStatus: statusAtual === 'pago' ? 'pendente' : 'pago',
                })
              }
              disabled={alternar.isPending}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-extrabold transition disabled:opacity-50 ${
                statusAtual === 'pago' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              {statusAtual === 'pago' && <Check className="h-3.5 w-3.5" />}
              {statusAtual === 'pago' ? 'Pago' : 'Marcar como pago'}
            </button>
          </div>

          {historico.length > 0 && (
            <div className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
              {historico.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-bold capitalize text-neutral-700">{tituloDoMes(p.referencia_mes)}</span>
                  <span className="text-neutral-400">R$ {p.valor.toFixed(2)}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                      p.status === 'pago' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {p.status === 'pago' ? 'Pago' : 'Pendente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
