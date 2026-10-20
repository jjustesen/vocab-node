import type { SessaoTutor } from './api'

/**
 * Uma prática do tutor numa linha: quando, qual lição e como foi. O resumo é o
 * do controlador — frases ditas sozinho, com ajuda e as que ficaram pendentes.
 */
export function SessaoNaLista({
  sessao,
  tituloDaLicao,
  nomeDoAluno,
}: {
  sessao: SessaoTutor
  tituloDaLicao: string
  nomeDoAluno?: string
}) {
  const r = sessao.resumo
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3.5">
      <div className="min-w-0">
        <p className="truncate font-bold">
          {nomeDoAluno && <span>{nomeDoAluno} · </span>}
          <span className={nomeDoAluno ? 'font-semibold text-neutral-600' : ''}>{tituloDaLicao}</span>
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">{quando(sessao.iniciada_em)}</p>
      </div>
      {sessao.concluida_em && r ? (
        <p className="flex flex-wrap gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">{r.autonomos.length} sozinho</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{r.comAjuda.length} com ajuda</span>
          {r.pendentes.length > 0 && (
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">{r.pendentes.length} pendente</span>
          )}
        </p>
      ) : (
        <p className="text-xs font-semibold text-neutral-400">não terminou</p>
      )}
      {sessao.concluida_em && r && r.paraRevisar.length > 0 && (
        <p className="w-full text-xs text-neutral-500">
          Para revisar: <span className="font-semibold text-neutral-700">{r.paraRevisar.map(legivel).join(', ')}</span>
        </p>
      )}
    </li>
  )
}

/** As habilidades do roteiro são ids ("sujeito_it"); na tela, "sujeito it". */
function legivel(habilidade: string): string {
  return habilidade.replace(/_/g, ' ')
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
