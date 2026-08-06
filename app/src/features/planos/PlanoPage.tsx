import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, CheckCircle2, CreditCard, Loader2, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAbrirPortal, useAssinatura, useIniciarCheckout, useProfessor, useUsoDoMes } from './api'
import { PLANOS } from '@/lib/planos'
import type { PlanoTipo } from '@/types/db'

const ORDEM: PlanoTipo[] = ['gratuito', 'pro', 'ilimitado']

/** Assinatura que ainda vale (mesmo em retentativa de cobrança). */
const STATUS_ATIVOS = ['active', 'trialing', 'past_due']

export function PlanoPage() {
  const { data: professor } = useProfessor()
  const { data: uso } = useUsoDoMes()
  const { data: assinatura } = useAssinatura()
  const checkout = useIniciarCheckout()
  const portal = useAbrirPortal()
  const [params] = useSearchParams()
  const qc = useQueryClient()

  const voltouDoCheckout = params.get('checkout') === 'sucesso'
  const assinaturaAtiva = Boolean(assinatura && STATUS_ATIVOS.includes(assinatura.status))

  // Voltou do Stripe mas o webhook pode ainda não ter chegado: refaz as
  // queries a cada 3 s até o plano refletir o pagamento (ou desistir em 30 s).
  useEffect(() => {
    if (!voltouDoCheckout || professor?.plano !== 'gratuito') return
    let tentativas = 0
    const intervalo = setInterval(() => {
      tentativas += 1
      qc.invalidateQueries({ queryKey: ['professor'] })
      qc.invalidateQueries({ queryKey: ['assinatura'] })
      qc.invalidateQueries({ queryKey: ['uso-do-mes'] })
      if (tentativas >= 10) clearInterval(intervalo)
    }, 3000)
    return () => clearInterval(intervalo)
  }, [voltouDoCheckout, professor?.plano, qc])

  const ocupado = checkout.isPending || portal.isPending
  const erro = (checkout.error ?? portal.error) as Error | null

  if (!professor || !uso) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const planoAtual = professor.plano

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold">Plano e cobrança</h1>
      <p className="mt-0.5 text-sm text-neutral-500">
        Você está no plano <strong className="text-neutral-900">{PLANOS[planoAtual].nome}</strong>.
      </p>

      {voltouDoCheckout && planoAtual !== 'gratuito' && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Pagamento confirmado — bem-vindo ao plano{' '}
          {PLANOS[planoAtual].nome}!
        </p>
      )}
      {voltouDoCheckout && planoAtual === 'gratuito' && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> Confirmando seu pagamento… isso leva
          alguns segundos.
        </p>
      )}
      {assinatura?.status === 'past_due' && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Não conseguimos cobrar seu cartão. Atualize o
          pagamento em &ldquo;Gerenciar assinatura&rdquo; para não perder o plano.
        </p>
      )}
      {assinatura?.cancela_no_fim && assinatura.periodo_fim && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Sua assinatura foi cancelada e vale até{' '}
          {new Date(assinatura.periodo_fim).toLocaleDateString('pt-BR')}. Depois disso você volta ao
          plano Gratuito — sem perder nenhum dado.
        </p>
      )}
      {erro && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {erro.message}
        </p>
      )}

      {/* uso atual */}
      <div className="mt-5 rounded-3xl bg-white p-5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          <h2 className="text-sm font-bold">Uso neste mês</h2>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <BarraDeUso
            rotulo="Alunos ativos"
            usado={uso.alunosAtivos}
            limite={uso.limiteAlunos}
          />
          <BarraDeUso
            rotulo="Gerações por IA"
            usado={uso.geracoesDoMes}
            limite={uso.limiteGeracoes}
          />
        </div>
      </div>

      {/* cards de plano */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {ORDEM.map((chave) => {
          const info = PLANOS[chave]
          const atual = chave === planoAtual
          const escuro = chave === 'ilimitado'
          return (
            <div
              key={chave}
              className={[
                'flex flex-col rounded-3xl p-5',
                escuro ? 'bg-neutral-950 text-white' : 'bg-white',
                atual ? 'ring-2 ring-violet-400' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <p className="font-extrabold">{info.nome}</p>
                {atual && (
                  <span className="rounded-full bg-violet-200 px-2.5 py-0.5 text-[11px] font-extrabold text-violet-900">
                    atual
                  </span>
                )}
              </div>
              <p className={`mt-0.5 text-xs ${escuro ? 'text-neutral-400' : 'text-neutral-500'}`}>
                {info.descricao}
              </p>
              <p className="mt-3">
                <span className="text-2xl font-extrabold">
                  {info.precoMensal === 0 ? 'R$ 0' : `R$ ${info.precoMensal}`}
                </span>
                <span className={`text-xs font-semibold ${escuro ? 'text-neutral-400' : 'text-neutral-400'}`}>
                  {' '}
                  /mês
                </span>
              </p>
              <ul className={`mt-3 flex-1 space-y-1.5 text-xs font-medium ${escuro ? 'text-neutral-200' : 'text-neutral-700'}`}>
                <Item escuro={escuro}>
                  {info.limiteAlunos === null ? 'Alunos sem limite' : `Até ${info.limiteAlunos} alunos ativos`}
                </Item>
                <Item escuro={escuro}>{info.limiteGeracoes} gerações por IA / mês</Item>
                <Item escuro={escuro}>Envio por WhatsApp e correção automática</Item>
                {chave !== 'gratuito' && <Item escuro={escuro}>Trilhas, lote e biblioteca completa</Item>}
              </ul>
              <BotaoDoPlano
                chave={chave}
                atual={atual}
                escuro={escuro}
                assinaturaAtiva={assinaturaAtiva}
                ocupado={ocupado}
                assinar={() => checkout.mutate(chave as 'pro' | 'ilimitado')}
                abrirPortal={() => portal.mutate()}
              />
            </div>
          )
        })}
      </div>

      {assinaturaAtiva && (
        <button
          onClick={() => portal.mutate()}
          disabled={ocupado}
          className="mt-5 flex items-center gap-2 rounded-full border-2 border-neutral-200 bg-white px-5 py-3 text-sm font-bold disabled:opacity-40"
        >
          {portal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Gerenciar assinatura
        </button>
      )}
      <p className="mt-3 text-xs text-neutral-400">
        Pagamento processado pelo Stripe. Trocar de plano, atualizar o cartão, baixar faturas e
        cancelar ficam em &ldquo;Gerenciar assinatura&rdquo; — cancelando, você volta ao Gratuito no fim
        do período já pago, sem perder nenhum dado.
      </p>
    </div>
  )
}

function Item({ children, escuro }: { children: React.ReactNode; escuro: boolean }) {
  return (
    <li className="flex items-start gap-1.5">
      <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${escuro ? 'text-violet-400' : 'text-emerald-600'}`} />
      <span>{children}</span>
    </li>
  )
}

function BotaoDoPlano({
  chave,
  atual,
  escuro,
  assinaturaAtiva,
  ocupado,
  assinar,
  abrirPortal,
}: {
  chave: PlanoTipo
  atual: boolean
  escuro: boolean
  assinaturaAtiva: boolean
  ocupado: boolean
  assinar: () => void
  abrirPortal: () => void
}) {
  const base = 'mt-4 flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold transition disabled:opacity-40'

  if (atual) {
    return (
      <button disabled className={`${base} ${escuro ? 'bg-white/10 text-neutral-400' : 'bg-neutral-100 text-neutral-400'}`}>
        Seu plano atual
      </button>
    )
  }

  // Downgrade para o gratuito = cancelar a assinatura, que vive no portal.
  if (chave === 'gratuito') {
    return (
      <button onClick={abrirPortal} disabled={ocupado || !assinaturaAtiva} className={`${base} bg-neutral-100 text-neutral-600`}>
        Cancelar no portal
      </button>
    )
  }

  // Já paga outro plano? Trocar também é no portal — um segundo checkout
  // criaria duas assinaturas cobrando em paralelo.
  if (assinaturaAtiva) {
    return (
      <button onClick={abrirPortal} disabled={ocupado} className={`${base} ${escuro ? 'bg-violet-300 text-neutral-900' : 'bg-neutral-900 text-white'}`}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Trocar no portal
      </button>
    )
  }

  return (
    <button onClick={assinar} disabled={ocupado} className={`${base} ${escuro ? 'bg-violet-300 text-neutral-900' : 'bg-neutral-900 text-white'}`}>
      {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Assinar {PLANOS[chave].nome}
    </button>
  )
}

function BarraDeUso({ rotulo, usado, limite }: { rotulo: string; usado: number; limite: number | null }) {
  const proporcao = limite === null ? 0 : Math.min(usado / limite, 1)
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-neutral-600">{rotulo}</span>
        <span className="font-bold text-neutral-900">
          {usado}
          {limite !== null && <span className="font-medium text-neutral-400"> / {limite}</span>}
          {limite === null && <span className="font-medium text-neutral-400"> · sem limite</span>}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${proporcao >= 1 ? 'bg-rose-400' : proporcao >= 0.8 ? 'bg-amber-400' : 'bg-violet-400'}`}
          style={{ width: `${limite === null ? 4 : proporcao * 100}%` }}
        />
      </div>
    </div>
  )
}
