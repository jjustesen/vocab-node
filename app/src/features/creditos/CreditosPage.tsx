import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Coins, Loader2 } from 'lucide-react'
import { COTACAO_DOLAR, reais, REAIS_POR_DOLAR, TETO_POR_SESSAO_USD } from '@/lib/custo-ia'
import type { CreditoMovimento } from '@/types/db'
import { chavesCreditos, useComprarCreditos, useExtratoDeCreditos, useSaldoDeCreditos } from './api'

const VALORES = [20, 50, 100, 200]
const MINIMO = 20
const MAXIMO = 2000

/**
 * /creditos — o saldo que paga a IA do tutor (docs/TUTOR-TRILHAS.md §5.3):
 * colocar créditos, ver o que cada ação custa e o extrato. Os créditos não
 * expiram.
 */
export function CreditosPage() {
  const { data: saldo, isLoading } = useSaldoDeCreditos()
  const { data: extrato } = useExtratoDeCreditos()
  const comprar = useComprarCreditos()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const [escolhido, setEscolhido] = useState<number | 'outro'>(50)
  const [outro, setOutro] = useState('')

  const voltouDaCompra = params.get('compra') === 'ok'
  // Entrou se há uma compra nos últimos 15 min: o saldo antes da volta não é confiável (a página recarregou).
  const compraEntrou =
    voltouDaCompra &&
    Boolean(extrato?.some((m) => m.tipo === 'compra' && Date.now() - new Date(m.criado_em).getTime() < 15 * 60_000))

  // O crédito entra pelo webhook, segundos depois (no Pix, às vezes mais):
  // relê a cada 3 s por um minuto.
  useEffect(() => {
    if (!voltouDaCompra || compraEntrou) return
    let vezes = 0
    const intervalo = setInterval(() => {
      vezes += 1
      qc.invalidateQueries({ queryKey: chavesCreditos.todos })
      if (vezes >= 20) clearInterval(intervalo)
    }, 3000)
    return () => clearInterval(intervalo)
  }, [voltouDaCompra, compraEntrou, qc])

  const valor = escolhido === 'outro' ? Number(outro.replace(',', '.')) : escolhido
  const valorValido = Number.isInteger(valor) && valor >= MINIMO && valor <= MAXIMO

  if (isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const teto = TETO_POR_SESSAO_USD * REAIS_POR_DOLAR

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold">Créditos</h1>
      <p className="mt-0.5 text-sm text-neutral-500">
        Pagam a IA do tutor: gravar falas, testar e gerar lições, e a prática dos seus alunos particulares. Não expiram.
      </p>

      {voltouDaCompra && (
        <p
          className={`mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${
            compraEntrou ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {compraEntrou ? (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Pagamento confirmado. Os créditos já estão no seu saldo.
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> Confirmando o pagamento… No Pix, pode levar um
              minuto.
            </>
          )}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col justify-between rounded-3xl bg-neutral-950 p-5 text-white">
          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-400">
            <Coins className="h-3.5 w-3.5" /> Saldo
          </div>
          <p className="mt-3 text-4xl font-extrabold tracking-tight">{reais(saldo ?? 0)}</p>
          <p className="mt-2 text-xs text-neutral-400">
            {(saldo ?? 0) < 10
              ? 'Saldo baixo. Sem créditos, você não grava, não testa e não gera, e o tutor dos alunos particulares pausa.'
              : 'Inclui o que está reservado para sessões em andamento.'}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-5">
          <h2 className="text-sm font-bold">Adicionar créditos</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {VALORES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setEscolhido(v)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  escolhido === v ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                R$ {v}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setEscolhido('outro')}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                escolhido === 'outro' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Outro valor
            </button>
          </div>
          {escolhido === 'outro' && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <span className="font-bold text-neutral-500">R$</span>
              <input
                autoFocus
                inputMode="numeric"
                value={outro}
                onChange={(e) => setOutro(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={String(MINIMO)}
                aria-label="Valor em reais"
                className="w-28 rounded-xl bg-neutral-100 px-3 py-2 font-bold outline-none focus:ring-2 focus:ring-violet-300"
              />
              <span className="text-xs text-neutral-400">
                de R$ {MINIMO} a R$ {MAXIMO.toLocaleString('pt-BR')}
              </span>
            </label>
          )}
          <button
            type="button"
            disabled={!valorValido || comprar.isPending}
            onClick={() => comprar.mutate(valor)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-violet-700 disabled:opacity-40"
          >
            {comprar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Pagar {valorValido ? reais(valor) : ''} com Pix ou cartão
          </button>
          {comprar.error && <p className="mt-2 text-sm font-medium text-rose-600">{comprar.error.message}</p>}
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-white p-5">
        <h2 className="text-sm font-bold">Quanto custa cada coisa</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Você paga o custo real da IA. Antes de começar, o valor máximo fica reservado; ao terminar, o que sobrou volta
          ao saldo.
        </p>
        <ul className="mt-3 divide-y divide-neutral-100 text-sm">
          <LinhaDeCusto acao="Testar uma lição (Experimentar como aluno)" custo={`~R$ 0,44 · reserva ${reais(teto)}`} />
          <LinhaDeCusto acao="Prática de um aluno particular" custo={`~R$ 0,44 · reserva ${reais(teto)}`} />
          <LinhaDeCusto acao="Gerar uma lição com IA" custo={`~R$ 0,22 · reserva ${reais(0.15 * REAIS_POR_DOLAR)}`} />
          <LinhaDeCusto acao="Gravar as falas de uma lição" custo="~R$ 0,01 por fala" />
        </ul>
        <p className="mt-2 text-xs text-neutral-400">
          Valores típicos, com o dólar a {reais(COTACAO_DOLAR)} mais 10% da taxa do pagamento. Alunos que assinam uma trilha não usam seus créditos: a
          IA deles sai do repasse.
        </p>
      </div>

      <div className="mt-4 rounded-3xl bg-white p-5">
        <h2 className="text-sm font-bold">Extrato</h2>
        {!extrato?.length ? (
          <p className="mt-3 text-sm text-neutral-400">Nenhum movimento ainda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {extrato.map((m) => (
              <Movimento key={m.id} m={m} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function LinhaDeCusto({ acao, custo }: { acao: string; custo: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="text-neutral-700">{acao}</span>
      <span className="shrink-0 text-xs font-bold text-neutral-500">{custo}</span>
    </li>
  )
}

function Movimento({ m }: { m: CreditoMovimento }) {
  const emAndamento = m.tipo === 'reserva'
  const entrada = m.valor > 0
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-neutral-800">{m.descricao}</p>
        <p className="text-xs text-neutral-400">
          {new Date(m.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          {emAndamento && ' · em andamento, o que sobrar volta ao saldo'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-extrabold ${entrada ? 'text-emerald-600' : emAndamento ? 'text-amber-600' : 'text-neutral-800'}`}>
          {entrada ? '+' : '−'} {reais(Math.abs(m.valor))}
        </p>
        <p className="text-[11px] text-neutral-400">saldo {reais(m.saldo_depois)}</p>
      </div>
    </li>
  )
}
