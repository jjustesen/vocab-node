import { useState } from 'react'
import { Calculator, X } from 'lucide-react'
import {
  DATA_AUMENTO,
  estimarPorAluno,
  reais,
  REAIS_POR_DOLAR,
  reaisDeCentavos,
  TETO_POR_SESSAO_USD,
  USO_TIPICO,
} from '@/lib/custo-ia'
import { useCustoDasLicoes } from '@/features/tutor/api'
import type { CustoDaLicao } from '@/types/db'
import type { PassoDaTrilha } from './api'

/**
 * Quanto um aluno desta trilha custa de IA por mês (docs/TUTOR-TRILHAS.md
 * §5.2). Só o tutor gasta IA; material e atividade não. O professor escolhe as
 * práticas por mês aqui só para ver a conta: o limite de verdade é do plano.
 */
export function CustoDaTrilha({ passos }: { passos: PassoDaTrilha[] }) {
  const licoes = passos.filter((p) => p.tipo === 'tutor' && p.licao_tutor_id)
  const ids = [...new Set(licoes.map((p) => p.licao_tutor_id!))]
  const { data: custos, isLoading } = useCustoDasLicoes(ids)
  const [praticas, setPraticas] = useState(20)
  const [explicando, setExplicando] = useState(false)

  if (ids.length === 0) {
    return (
      <p className="rounded-3xl bg-white px-5 py-4 text-sm text-neutral-500">
        Esta trilha não usa o tutor. Material e atividade não gastam IA.
      </p>
    )
  }

  const custosUsd = ids.map((id) => custos?.get(id)?.estimativa_usd ?? 0)
  const e = estimarPorAluno(custosUsd, praticas)
  const antesDoAumento = new Date() < DATA_AUMENTO

  return (
    <div className="rounded-3xl bg-white p-5">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-neutral-700">Práticas do tutor por mês</span>
        <input
          type="number"
          min={1}
          max={500}
          value={praticas}
          onChange={(ev) => setPraticas(Math.max(1, Math.min(500, Number(ev.target.value) || 1)))}
          className="w-20 rounded-xl bg-neutral-100 px-3 py-1.5 text-right font-bold outline-none focus:ring-2 focus:ring-violet-300"
        />
      </label>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Linha rotulo="Custo médio por prática" valor={isLoading ? '…' : `~${reais(e.porPratica)}`} />
        <Linha rotulo={`Por aluno, por mês (uso típico, ${Math.round(USO_TIPICO * 100)}%)`} valor={`~${reais(e.esperadoMes)}`} />
        <Linha rotulo="Por aluno, por mês (usando tudo)" valor={reais(e.maximoMes)} forte />
        <Linha rotulo="Para concluir a trilha uma vez" valor={`~${reais(e.concluirUmaVez)}`} />
      </dl>
      <p className="mt-3 rounded-2xl bg-violet-50 px-3 py-2 text-xs text-violet-900">
        Num plano com {praticas} práticas por mês, o preço mínimo é <strong>{reaisDeCentavos(e.precoMinimoCentavos)}</strong>:
        a IA máxima mais a taxa da plataforma.
      </p>
      {antesDoAumento && (
        <p className="mt-2 text-[11px] text-neutral-400">
          Em 01/01/2027 o Google aumenta o preço do Gemini: o máximo por aluno pode chegar a ~{reais(e.maximoMes * 2)}.
        </p>
      )}
      <button
        type="button"
        onClick={() => setExplicando(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 hover:underline"
      >
        <Calculator className="h-3.5 w-3.5" /> Como calculamos
      </button>

      {explicando && (
        <ComoCalculamos
          licoes={ids.map((id) => ({ titulo: licoes.find((p) => p.licao_tutor_id === id)!.titulo, custo: custos?.get(id) }))}
          praticas={praticas}
          estimativa={e}
          aoFechar={() => setExplicando(false)}
        />
      )}
    </div>
  )
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-neutral-500">{rotulo}</dt>
      <dd className={`shrink-0 ${forte ? 'font-extrabold text-neutral-900' : 'font-bold text-neutral-700'}`}>{valor}</dd>
    </div>
  )
}

/** A explicação, com os números desta trilha (§5.2, "Como calculamos"). */
function ComoCalculamos({
  licoes,
  praticas,
  estimativa: e,
  aoFechar,
}: {
  licoes: { titulo: string; custo: CustoDaLicao | undefined }[]
  praticas: number
  estimativa: ReturnType<typeof estimarPorAluno>
  aoFechar: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="como-calculamos"
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/40 p-4"
      onClick={aoFechar}
    >
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="como-calculamos" className="text-lg font-extrabold">
            Como calculamos
          </h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mt-4 space-y-4 text-sm text-neutral-600">
          <li>
            <p className="font-bold text-neutral-900">1. O que gasta IA</p>
            <p className="mt-0.5">
              Só as práticas com o tutor: ouvir o aluno, corrigir e responder em voz. Material e atividade não gastam IA.
            </p>
          </li>
          <li>
            <p className="font-bold text-neutral-900">2. Quanto custa cada lição</p>
            <ul className="mt-1.5 space-y-1">
              {licoes.map((l) => (
                <li key={l.titulo} className="flex items-baseline justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-neutral-800">{l.titulo}</span>
                    <span className="text-xs text-neutral-400">
                      {!l.custo
                        ? 'calculando…'
                        : l.custo.fonte === 'sessoes'
                          ? `média de ${l.custo.sessoes} sessões reais em 30 dias`
                          : `estimativa inicial: ${l.custo.itens} itens × o custo médio por item`}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold text-neutral-800">
                    {l.custo ? `~${reais(l.custo.estimativa_usd * REAIS_POR_DOLAR)}` : '…'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5">
              A média das lições dá <strong>{reais(e.porPratica)}</strong> por prática. Com 5 sessões reais de alunos, a
              estimativa inicial é trocada pela média medida.
            </p>
          </li>
          <li>
            <p className="font-bold text-neutral-900">3. A conta por aluno</p>
            <p className="mt-0.5">
              Usando tudo: {praticas} práticas × {reais(e.porPratica)} = <strong>{reais(e.maximoMes)}</strong> por mês.
            </p>
            <p className="mt-0.5">
              Uso típico: os alunos costumam usar {Math.round(USO_TIPICO * 100)}% do limite, então {praticas} ×{' '}
              {Math.round(USO_TIPICO * 100)}% × {reais(e.porPratica)} = <strong>{reais(e.esperadoMes)}</strong>.
            </p>
            <p className="mt-0.5">
              O preço mínimo do plano ({reaisDeCentavos(e.precoMinimoCentavos)}) garante que, depois da taxa da plataforma
              (10%, mínimo de R$ 6), sobra o bastante para a IA de quem usa tudo.
            </p>
          </li>
          <li>
            <p className="font-bold text-neutral-900">4. Limites e câmbio</p>
            <p className="mt-0.5">
              Uma prática nunca passa de {reais(TETO_POR_SESSAO_USD * REAIS_POR_DOLAR)}: acima disso o tutor encerra a
              sessão. A IA é cobrada em dólar; usamos {reais(REAIS_POR_DOLAR)} por dólar. Em 01/01/2027 o Google aumenta o
              preço do Gemini, e a estimativa sobe junto.
            </p>
          </li>
          <li>
            <p className="font-bold text-neutral-900">5. O que você paga de verdade</p>
            <p className="mt-0.5">
              A estimativa serve para escolher preço e limite. Em cada repasse, o desconto é o custo real da IA daquele
              aluno no período pago, linha a linha no extrato.
            </p>
          </li>
        </ol>
      </div>
    </div>
  )
}
