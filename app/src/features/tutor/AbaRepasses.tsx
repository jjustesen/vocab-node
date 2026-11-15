import { Banknote, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { reaisDeCentavos, taxaDaPlataformaCentavos } from '@/lib/custo-ia'
import { type Repasse, useAbrirStripeConnect, useContaDeRecebimento, useRepasses } from './vendas'

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

/**
 * Aba Repasses (docs/TUTOR-TRILHAS.md §5.1, §8.5): a conta de recebimento no
 * Stripe e o extrato. Cada cobrança vira um repasse um mês depois, no fim do
 * período que ela pagou, com cartão, taxa e a IA real do aluno descontados.
 */
export function AbaRepasses() {
  const { data: conta, isLoading: carregandoConta } = useContaDeRecebimento()
  const { data: repasses, isLoading } = useRepasses()
  const abrir = useAbrirStripeConnect()

  const proximos = (repasses ?? []).filter((r) => r.status === 'aguardando' || r.status === 'sem_conta').reverse()
  const feitos = (repasses ?? []).filter((r) => r.status !== 'aguardando' && r.status !== 'sem_conta')
  const em30dias = proximos
    .filter((r) => new Date(r.periodo_fim).getTime() - Date.now() < 30 * 86_400_000)
    .reduce((t, r) => t + r.valor_centavos - taxaDaPlataformaCentavos(r.valor_centavos), 0)

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-3xl bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-100 text-violet-700">
              <Banknote className="h-5 w-5" />
            </span>
            <div>
              <p className="font-extrabold">Conta de recebimento</p>
              <p className="text-xs text-neutral-500">
                {carregandoConta
                  ? 'Conferindo…'
                  : conta?.pronta
                    ? 'Pronta. Os repasses caem nela.'
                    : conta?.existe
                      ? 'Cadastro incompleto no Stripe. Os repasses esperam até ele terminar.'
                      : 'Cadastre seus dados bancários no Stripe para receber os repasses.'}
              </p>
            </div>
          </div>
          {conta?.pronta ? (
            <button
              type="button"
              onClick={() => abrir.mutate('painel')}
              disabled={abrir.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2 text-sm font-bold text-neutral-800 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Ver no Stripe <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => abrir.mutate('cadastro')}
              disabled={abrir.isPending || carregandoConta}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {abrir.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {conta?.existe ? 'Continuar cadastro' : 'Conectar conta'}
            </button>
          )}
        </div>
        {abrir.error && <p className="mt-2 text-sm text-rose-600">{abrir.error.message}</p>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-neutral-950 p-5 text-white">
            <p className="text-xs font-bold text-neutral-400">A receber nos próximos 30 dias</p>
            <p className="mt-1 text-3xl font-extrabold">~{reaisDeCentavos(em30dias)}</p>
            <p className="mt-1 text-xs text-neutral-400">Antes da tarifa do cartão e da IA de cada aluno, que só fecham no fim do período.</p>
          </div>

          <Secao titulo="Próximos repasses" vazio="Nenhum repasse previsto.">
            {proximos.map((r) => (
              <LinhaRepasse key={r.id} r={r} />
            ))}
          </Secao>
          <Secao titulo="Repasses feitos" vazio="Nenhum repasse feito ainda.">
            {feitos.map((r) => (
              <LinhaRepasse key={r.id} r={r} />
            ))}
          </Secao>
        </>
      )}
    </div>
  )
}

function Secao({ titulo, vazio, children }: { titulo: string; vazio: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-neutral-500">{titulo}</h2>
      {children.length === 0 ? (
        <p className="rounded-3xl bg-white px-5 py-6 text-center text-sm text-neutral-400">{vazio}</p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">{children}</ul>
      )}
    </div>
  )
}

const ROTULO: Record<Repasse['status'], string> = {
  aguardando: 'previsto',
  sem_conta: 'esperando a conta de recebimento',
  transferido: 'transferido',
  negativo: 'IA acima do valor: debitado dos créditos',
  estornado: 'estornado',
}

function LinhaRepasse({ r }: { r: Repasse }) {
  const calculado = r.repasse_centavos !== null
  const taxa = r.taxa_centavos ?? taxaDaPlataformaCentavos(r.valor_centavos)
  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{r.alunoNome}</p>
          <p className="text-xs text-neutral-500">
            Período {data(r.periodo_inicio)} a {data(r.periodo_fim)} · {ROTULO[r.status]}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-extrabold">{calculado ? reaisDeCentavos(r.repasse_centavos!) : `~${reaisDeCentavos(r.valor_centavos - taxa)}`}</p>
          <p className="text-[11px] text-neutral-400">em {data(r.repassado_em ?? r.periodo_fim)}</p>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-neutral-400">
        {reaisDeCentavos(r.valor_centavos)} − taxa {reaisDeCentavos(taxa)}
        {calculado
          ? ` − cartão ${reaisDeCentavos(r.tarifa_centavos ?? 0)} − IA ${reaisDeCentavos(r.custo_ia_centavos ?? 0)}${r.estorno_centavos ? ` − estorno ${reaisDeCentavos(r.estorno_centavos)}` : ''}`
          : ' − cartão − IA do período (fecham no fim)'}
      </p>
    </li>
  )
}
