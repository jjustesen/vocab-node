import type { Resumo, Roteiro, Sessao } from '../src/tipos.ts'
import { ROTULO_HABILIDADE } from '../src/falas.ts'
import { ehGemini, formatarDolares, nomeDoServico, precoDe, precoDoGemini, precoTotal, SERVICOS_FIXOS, type Gasto } from './custo.ts'
import { Icone } from './ui.tsx'

/**
 * O que o ALUNO não precisa ver: decisões do tutor, custos, opções de teste e o
 * registro da sessão (critério 9). Mora numa gaveta lateral, aberta pelo botão
 * de professor no topo — a tela da aula fica só com a frase.
 */

export type LinhaDoHistorico = { id: number; quem: 'tutor' | 'aluno' | 'nota'; texto: string; detalhe?: string }

export type Opcoes = { escutaAutomatica: boolean; vozNatural: boolean }

export function PainelDoProfessor({
  aberto,
  aoFechar,
  roteiro,
  sessao,
  gasto,
  historico,
  opcoes,
  aoMudarOpcoes,
  aoReiniciar,
  medidorMudo,
}: {
  aberto: boolean
  aoFechar: () => void
  roteiro: Roteiro
  sessao: Sessao | null
  gasto: Gasto
  historico: LinhaDoHistorico[]
  opcoes: Opcoes
  aoMudarOpcoes: (o: Opcoes) => void
  aoReiniciar: () => void
  medidorMudo: boolean
}) {
  function baixar() {
    if (!sessao) return
    const dados = {
      roteiro: roteiro.id,
      geradoEm: new Date().toISOString(),
      calibracao: sessao.calibracao,
      resultados: sessao.resultados,
      dificuldades: sessao.dificuldades,
      registro: sessao.registro,
      historico,
      gasto,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `sessao-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const atual = sessao?.atual
  return (
    <>
      {aberto && <div className="fixed inset-0 z-10 bg-black/20" onClick={aoFechar} />}
      <aside
        className={`fixed top-0 right-0 bottom-0 z-20 w-[min(380px,90vw)] overflow-y-auto bg-[var(--cartao)] px-4 py-4 text-xs shadow-[-10px_0_30px_rgba(0,0,0,.12)] transition-transform duration-300 ${
          aberto ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!aberto}
      >
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-extrabold">Modo professor</p>
          <button onClick={aoFechar} aria-label="Fechar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--fundo)]">
            <Icone nome="fechar" />
          </button>
        </div>
        <p className="mt-1 text-neutral-500">O que o aluno não vê: as decisões do tutor, o custo e as opções do teste.</p>

        <Titulo>Opções</Titulo>
        <label className="mt-1 flex items-center gap-2">
          <input type="checkbox" checked={opcoes.escutaAutomatica} onChange={(e) => aoMudarOpcoes({ ...opcoes, escutaAutomatica: e.target.checked })} />
          Abrir o microfone sozinho depois do tutor
        </label>
        <label className="mt-1 flex items-center gap-2">
          <input type="checkbox" checked={opcoes.vozNatural} onChange={(e) => aoMudarOpcoes({ ...opcoes, vozNatural: e.target.checked })} />
          Voz natural (Gemini Flash-Lite TTS)
        </label>
        {medidorMudo && <p className="mt-1 text-amber-700">Medidor do microfone mudo: toque no microfone ao terminar de falar.</p>}
        <div className="mt-2 flex gap-2">
          <button onClick={aoReiniciar} className="rounded-full bg-[var(--fundo)] px-3 py-1.5 font-bold">Reiniciar aula</button>
          <button onClick={baixar} disabled={!sessao} className="rounded-full bg-neutral-900 px-3 py-1.5 font-bold text-white disabled:opacity-30">
            Baixar registro
          </button>
        </div>

        <Titulo>Custo da sessão</Titulo>
        <TabelaDeCustos gasto={gasto} />

        {sessao && (
          <>
            <Titulo>Estado</Titulo>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-neutral-500">Item</dt>
              <dd>{atual ? `${atual.item.id} (${atual.contexto})` : '—'}</dd>
              <dt className="text-neutral-500">Alvo</dt>
              <dd>{atual?.item.alvo ?? atual?.item.criterio ?? '—'}</dd>
              <dt className="text-neutral-500">Última aceita</dt>
              <dd>{sessao.ultimaAceita ?? '—'}</dd>
              <dt className="text-neutral-500">Ajuda / tentativas</dt>
              <dd>{atual ? `nível ${atual.nivelAjuda} · ${atual.tentativas}` : '—'}</dd>
            </dl>
          </>
        )}

        <Titulo>Histórico</Titulo>
        <ol className="mt-1 space-y-1.5">
          {[...historico].reverse().map((l) => (
            <li key={l.id} className={l.quem === 'nota' ? 'text-neutral-400' : ''}>
              {l.quem === 'tutor' && <strong className="text-violet-700">Tutor: </strong>}
              {l.quem === 'aluno' && <strong>Aluno: </strong>}
              {l.texto}
              {l.detalhe && <span className="block text-[11px] text-neutral-400">{l.detalhe}</span>}
            </li>
          ))}
        </ol>
      </aside>
    </>
  )
}

/**
 * O custo da sessão por serviço — Gemini (texto e voz) somado à parte, Jev,
 * e o total. Os serviços principais aparecem mesmo zerados: ver o Gemini Flash
 * em US$ 0 numa sessão digitada é a informação (o Jev decidiu tudo).
 */
function TabelaDeCustos({ gasto }: { gasto: Gasto }) {
  const servicos = [...new Set([...SERVICOS_FIXOS, ...Object.keys(gasto)])]
  const linha = (servico: string) => {
    const g = gasto[servico] ?? { entrada: 0, saida: 0, chamadas: 0 }
    return (
      <tr key={servico}>
        <td className="py-0.5 pr-2">{nomeDoServico(servico)}</td>
        <td className="pr-2 text-right">{g.chamadas}×</td>
        <td className="pr-2 text-right">{(g.entrada + g.saida).toLocaleString('pt-BR')}</td>
        <td className="text-right">{formatarDolares(precoDe(servico, g.entrada, g.saida))}</td>
      </tr>
    )
  }
  return (
    <table className="mt-1 w-full text-[11px] tabular-nums">
      <thead className="text-neutral-400">
        <tr>
          <th className="pr-2 text-left font-semibold">serviço</th>
          <th className="pr-2 text-right font-semibold">chamadas</th>
          <th className="pr-2 text-right font-semibold">tokens</th>
          <th className="text-right font-semibold">US$</th>
        </tr>
      </thead>
      <tbody>
        {servicos.filter(ehGemini).map(linha)}
        <tr className="font-bold">
          <td className="pr-2">Total Gemini</td>
          <td colSpan={2} />
          <td className="text-right">{formatarDolares(precoDoGemini(gasto))}</td>
        </tr>
        {servicos.filter((s) => !ehGemini(s)).map(linha)}
        <tr className="border-t border-[var(--linha)] font-extrabold">
          <td className="pt-0.5 pr-2">Total da sessão</td>
          <td colSpan={2} />
          <td className="pt-0.5 text-right">{formatarDolares(precoTotal(gasto))}</td>
        </tr>
      </tbody>
    </table>
  )
}

/** R04: o painel do aluno — estruturas e vocabulário, nunca as respostas das cadeias. */
export function FolhaDeApoio({ roteiro, aberta, aoFechar }: { roteiro: Roteiro; aberta: boolean; aoFechar: () => void }) {
  if (!aberta) return null
  const { painel } = roteiro
  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/20" onClick={aoFechar} />
      <section className="animar-sobe fixed inset-x-0 bottom-0 z-20 mx-auto max-h-[70dvh] max-w-[520px] overflow-y-auto rounded-t-3xl bg-[var(--cartao)] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
        <div className="flex items-center">
          <p className="flex-1 font-extrabold">Apoio</p>
          <button onClick={aoFechar} aria-label="Fechar" className="grid h-8 w-8 place-items-center rounded-full">
            <Icone nome="fechar" />
          </button>
        </div>
        <Titulo>Estruturas</Titulo>
        <ul className="mt-1 space-y-0.5">{painel.estruturas.map((e) => <li key={e} className="font-medium">{e}</li>)}</ul>
        <Titulo>Vocabulário</Titulo>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {painel.vocabulario.map((v) => (
            <span key={v.en} className="rounded-full bg-violet-100 px-2.5 py-1 text-xs">
              <strong>{v.en}</strong> <span className="text-neutral-500">{v.pt}</span>
            </span>
          ))}
        </div>
        <Titulo>Exemplos</Titulo>
        <ul className="mt-1 space-y-0.5">{painel.exemplos.map((e) => <li key={e}>{e}</li>)}</ul>
        <Titulo>Atenção</Titulo>
        <ul className="mt-1 space-y-0.5">{painel.alertas.map((e) => <li key={e}>{e}</li>)}</ul>
      </section>
    </>
  )
}

/** O fim da aula, em cartão. */
export function CartaoResumo({ resumo, aoRefazer }: { resumo: Resumo; aoRefazer: () => void }) {
  const rotular = (h: string) => ROTULO_HABILIDADE[h] ?? h
  const linhas: [string, string, string][] = [
    ['Frases sozinho', String(resumo.autonomos.length), ''],
    ['Com ajuda', String(resumo.comAjuda.length), ''],
    ...(resumo.pendentes.length ? ([['Pendentes', String(resumo.pendentes.length), 'text-amber-700']] as [string, string, string][]) : []),
    ...(resumo.recuperadas.length
      ? ([['Acertou na segunda vez', resumo.recuperadas.map(rotular).join(' · '), 'text-emerald-600']] as [string, string, string][])
      : []),
    ['Revisar na próxima', resumo.paraRevisar.length ? resumo.paraRevisar.map(rotular).join(' · ') : 'nada pendente', resumo.paraRevisar.length ? 'text-amber-700' : 'text-emerald-600'],
  ]
  return (
    <div className="animar-sobe w-full rounded-3xl bg-[var(--cartao)] p-5 text-left">
      <p className="text-xl font-extrabold">Aula concluída</p>
      <div className="mt-2">
        {linhas.map(([rotulo, valor, cor]) => (
          <div key={rotulo} className="flex justify-between gap-4 border-t border-[var(--linha)] py-2 text-sm first:border-t-0">
            <span className="text-neutral-500">{rotulo}</span>
            <strong className={`text-right ${cor}`}>{valor}</strong>
          </div>
        ))}
      </div>
      <button onClick={aoRefazer} className="mt-3 w-full rounded-full bg-violet-600 py-3 text-sm font-extrabold text-white">
        Fazer de novo
      </button>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[11px] font-extrabold tracking-wider text-neutral-400 uppercase">{children}</p>
}
