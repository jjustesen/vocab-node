import { useState } from 'react'
import { Loader2, Plus, Route, X } from 'lucide-react'
import { BotaoApagar } from '@/components/BotaoApagar'
import { useTrilhas } from '@/features/trilhas/api'
import {
  REAIS_POR_DOLAR,
  precoMinimoCentavos,
  reais,
  reaisDeCentavos,
  sobraPorAlunoCentavos,
  taxaDaPlataformaCentavos,
} from '@/lib/custo-ia'
import {
  type PlanoComTrilhas,
  useCustoMedioPorPratica,
  useExcluirPlanoAluno,
  usePlanosAluno,
  useSalvarPlanoAluno,
} from './planosAluno'

/**
 * Aba Planos do tutor (docs/TUTOR-TRILHAS.md §5): o que o aluno vai assinar.
 * Preço, práticas do tutor por mês e as trilhas incluídas, com o preço mínimo
 * ao lado. A venda pelo link é a próxima etapa.
 */
export function AbaPlanos() {
  const { data: planos, isLoading } = usePlanosAluno()
  const { data: trilhas } = useTrilhas()
  const [editando, setEditando] = useState<PlanoComTrilhas | 'novo' | null>(null)
  const nomeDaTrilha = new Map((trilhas ?? []).map((t) => [t.id, t.nome]))

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-neutral-500">
          O que o aluno assina: as trilhas, quantas práticas com o tutor por mês e o preço. A venda pelo link começa na
          próxima etapa.
        </p>
        <button
          type="button"
          onClick={() => setEditando('novo')}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" /> Novo plano
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : !planos?.length ? (
        <p className="mt-4 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">
          Nenhum plano ainda. Comece por uma trilha que use o tutor.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {planos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setEditando(p)}
                className="block h-full w-full rounded-3xl bg-white p-5 text-left transition hover:ring-2 hover:ring-violet-200"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-extrabold">{p.nome}</span>
                  {!p.aceitando && (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-500">
                      pausado
                    </span>
                  )}
                </span>
                <span className="mt-2 block text-2xl font-extrabold">
                  {reaisDeCentavos(p.preco_centavos)}
                  <span className="text-xs font-semibold text-neutral-400"> /mês</span>
                </span>
                <span className="mt-1 block text-xs text-neutral-500">
                  {p.praticas_mes} práticas com o tutor por mês
                </span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {p.trilhaIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800">
                      <Route className="h-3 w-3" /> {nomeDaTrilha.get(id) ?? 'Trilha'}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <EditorDePlano plano={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />
      )}
    </div>
  )
}

function EditorDePlano({ plano, aoFechar }: { plano: PlanoComTrilhas | null; aoFechar: () => void }) {
  const { data: trilhas } = useTrilhas()
  const salvar = useSalvarPlanoAluno()
  const excluir = useExcluirPlanoAluno()
  const [nome, setNome] = useState(plano?.nome ?? '')
  const [descricao, setDescricao] = useState(plano?.descricao ?? '')
  const [trilhaIds, setTrilhaIds] = useState<string[]>(plano?.trilhaIds ?? [])
  const [praticas, setPraticas] = useState(plano?.praticas_mes ?? 20)
  const [preco, setPreco] = useState(plano ? String(plano.preco_centavos / 100) : '')
  const [aceitando, setAceitando] = useState(plano?.aceitando ?? true)
  const { data: custoUsd, isFetching } = useCustoMedioPorPratica(trilhaIds)

  const iaMaxima = praticas * (custoUsd ?? 0) * REAIS_POR_DOLAR
  const minimo = precoMinimoCentavos(iaMaxima)
  const precoCentavos = Math.round(Number(preco.replace(',', '.')) * 100) || 0
  const abaixo = precoCentavos < minimo
  const taxa = taxaDaPlataformaCentavos(precoCentavos)
  const podeSalvar = nome.trim() && precoCentavos > 0 && !abaixo && custoUsd !== undefined && !isFetching

  function alternar(id: string) {
    setTrilhaIds((atual) => (atual.includes(id) ? atual.filter((t) => t !== id) : [...atual, id]))
  }

  async function aoSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!podeSalvar) return
    await salvar
      .mutateAsync({ id: plano?.id ?? null, nome, descricao, precoCentavos, praticasMes: praticas, aceitando, trilhaIds })
      .then(aoFechar)
      .catch(() => undefined)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-de-plano"
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/40 p-4"
      onClick={aoFechar}
    >
      <form
        onSubmit={(e) => void aoSalvar(e)}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="editor-de-plano" className="text-lg font-extrabold">
            {plano ? 'Editar plano' : 'Novo plano'}
          </h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-4 block text-sm font-bold">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            placeholder="Conversação com o tutor"
            className="mt-1 block w-full rounded-xl border border-neutral-200 px-3 py-2 font-normal"
          />
        </label>
        <label className="mt-3 block text-sm font-bold">
          Descrição <span className="font-normal text-neutral-400">(opcional)</span>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={500}
            rows={2}
            className="mt-1 block w-full resize-none rounded-xl border border-neutral-200 px-3 py-2 font-normal"
          />
        </label>

        <fieldset className="mt-3">
          <legend className="text-sm font-bold">Trilhas incluídas</legend>
          {!trilhas?.length ? (
            <p className="mt-1 text-sm text-neutral-400">Crie uma trilha em Atividades → Trilhas.</p>
          ) : (
            <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
              {trilhas.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-neutral-50">
                  <input type="checkbox" checked={trilhaIds.includes(t.id)} onChange={() => alternar(t.id)} className="accent-violet-600" />
                  <span className="font-medium">{t.nome}</span>
                  <span className="text-xs text-neutral-400">{t.nivel}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">
            Práticas por mês
            <input
              type="number"
              min={0}
              max={500}
              value={praticas}
              onChange={(e) => setPraticas(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
              className="mt-1 block w-full rounded-xl border border-neutral-200 px-3 py-2 font-normal"
            />
          </label>
          <label className="block text-sm font-bold">
            Preço por mês
            <span className="mt-1 flex items-center rounded-xl border border-neutral-200 px-3">
              <span className="text-neutral-400">R$</span>
              <input
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value.replace(/[^\d,.]/g, ''))}
                placeholder={String(minimo / 100)}
                className="w-full bg-transparent px-2 py-2 font-normal outline-none"
              />
            </span>
          </label>
        </div>

        <div className="mt-3 rounded-2xl bg-neutral-50 p-3 text-sm">
          <Conta rotulo="IA máxima por aluno (usando tudo)" valor={isFetching ? '…' : reais(iaMaxima)} />
          <Conta rotulo="Taxa da plataforma" valor={precoCentavos ? `− ${reaisDeCentavos(taxa)}` : '10%, mínimo R$ 6'} />
          <Conta
            rotulo="Sobra por aluno no pior caso"
            valor={precoCentavos ? reaisDeCentavos(sobraPorAlunoCentavos(precoCentavos, iaMaxima)) : '—'}
          />
          <p className={`mt-2 text-xs font-bold ${abaixo && precoCentavos ? 'text-rose-600' : 'text-violet-700'}`}>
            Preço mínimo: {reaisDeCentavos(minimo)}
            {abaixo && precoCentavos ? '. Suba o preço ou diminua as práticas.' : ''}
          </p>
          {precoCentavos > 0 && precoCentavos < 6000 && !abaixo && (
            <p className="mt-1 text-[11px] text-neutral-500">Abaixo de R$ 60 a taxa é o mínimo de R$ 6 por aluno.</p>
          )}
          <p className="mt-1 text-[11px] text-neutral-400">A tarifa do cartão (3,99% + R$ 0,39) sai do repasse e não entra no mínimo.</p>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={aceitando} onChange={(e) => setAceitando(e.target.checked)} className="accent-violet-600" />
          Aceitando novas assinaturas
        </label>

        {salvar.error && <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{salvar.error.message}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          {plano ? (
            <BotaoApagar
              titulo="Apagar plano"
              confirmacao="Apagar?"
              pendente={excluir.isPending}
              aoConfirmar={() => excluir.mutate(plano.id, { onSuccess: aoFechar })}
            />
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={!podeSalvar || salvar.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar plano
          </button>
        </div>
      </form>
    </div>
  )
}

function Conta({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-neutral-500">{rotulo}</span>
      <span className="shrink-0 font-bold">{valor}</span>
    </div>
  )
}
