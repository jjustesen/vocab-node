import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Send, Sparkles, UsersRound } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import { useTurmasComMembros } from '@/features/turmas/api'
import { type LicaoNaLista, useLiberacoesTutor, useTodasAsLicoes, useTurmasDasLicoes } from './api'
import { LiberarLicaoModal } from './LiberarLicaoModal'

/**
 * As lições do tutor: as do professor (geradas pela IA a partir do material
 * dele, em rascunho até a primeira liberação) e as da biblioteca. Cada uma tem
 * o "Liberar", como a atividade tem o "Enviar".
 */
export function AbaLicoes() {
  const { data: licoes, isLoading } = useTodasAsLicoes()
  const { data: liberacoes } = useLiberacoesTutor()
  const { data: turmasDasLicoes } = useTurmasDasLicoes()
  const { data: turmas } = useTurmasComMembros()
  const { data: alunos } = useAlunos('ativo')
  const [liberando, setLiberando] = useState<LicaoNaLista | null>(null)

  const nomeDaTurma = new Map((turmas ?? []).map((t) => [t.id, t.nome]))
  const membrosDa = new Map((turmas ?? []).map((t) => [t.id, t.alunoIds]))

  /** "Turma Terça 19h · Ana, Bruno": as turmas, depois quem recebeu fora delas. */
  function paraQuem(licaoId: string): { turmas: string[]; avulsos: string[] } {
    const ids = [...(turmasDasLicoes?.get(licaoId) ?? [])]
    const pelaTurma = new Set(ids.flatMap((id) => membrosDa.get(id) ?? []))
    const avulsos = (alunos ?? [])
      .filter((a) => liberacoes?.get(a.id)?.has(licaoId) && !pelaTurma.has(a.id))
      .map((a) => a.nome.split(' ')[0])
    return { turmas: ids.flatMap((id) => (nomeDaTurma.has(id) ? [nomeDaTurma.get(id)!] : [])), avulsos }
  }

  // O RLS só devolve as do professor e as da biblioteca: professor_id preenchido = dele.
  const minhas = (licoes ?? []).filter((l) => l.professor_id)
  const biblioteca = (licoes ?? []).filter((l) => !l.professor_id)

  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-neutral-500">Suas lições</h2>
        <Link
          to="/tutor/licoes/nova"
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white"
        >
          <Sparkles className="h-4 w-4" />
          Nova lição com IA
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : minhas.length === 0 ? (
        <div className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center">
          <p className="font-bold text-neutral-700">Nenhuma lição sua ainda</p>
          <p className="mt-1 text-sm text-neutral-500">
            Envie a foto, o PDF ou o texto de uma página de drillings e a IA monta a lição. Você revisa e libera para os
            alunos.
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {minhas.map((l) => (
            <LinhaDaLicao key={l.id} licao={l} paraQuem={paraQuem(l.id)} aoLiberar={() => setLiberando(l)} />
          ))}
        </ul>
      )}

      {biblioteca.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Biblioteca</h2>
          <p className="mt-1 text-xs text-neutral-500">Lições prontas do Vocab Node. Dá para abrir, ouvir, experimentar e liberar.</p>
          <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
            {biblioteca.map((l) => (
              <LinhaDaLicao key={l.id} licao={l} paraQuem={paraQuem(l.id)} aoLiberar={() => setLiberando(l)} />
            ))}
          </ul>
        </>
      )}

      {liberando && <LiberarLicaoModal licao={liberando} aoFechar={() => setLiberando(null)} />}
    </>
  )
}

function LinhaDaLicao({
  licao,
  paraQuem,
  aoLiberar,
}: {
  licao: LicaoNaLista
  paraQuem: { turmas: string[]; avulsos: string[] }
  aoLiberar: () => void
}) {
  const ninguem = paraQuem.turmas.length === 0 && paraQuem.avulsos.length === 0
  const nomes = paraQuem.avulsos.length > 3 ? [...paraQuem.avulsos.slice(0, 2), `+${paraQuem.avulsos.length - 2}`] : paraQuem.avulsos
  const destinos = [...paraQuem.turmas.map((t) => `Turma ${t}`), nomes.join(', ')].filter(Boolean).join(' · ')

  return (
    <li className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-neutral-50">
      <Link to={`/tutor/licoes/${licao.id}`} className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-bold">{licao.titulo}</span>
          {licao.nivel_cefr && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-extrabold text-indigo-700">
              {licao.nivel_cefr}
            </span>
          )}
          {licao.professor_id && !licao.publicada && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">rascunho</span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-neutral-500">
          {paraQuem.turmas.length > 0 && <UsersRound className="h-3 w-3 shrink-0" />}
          {ninguem ? 'Ninguém ainda' : destinos}
          {licao.professor_id && ` · editada em ${new Date(licao.atualizado_em).toLocaleDateString('pt-BR')}`}
        </span>
      </Link>
      {/* O botão fica FORA do link: liberar não abre o editor. */}
      <button
        type="button"
        onClick={aoLiberar}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2 text-sm font-bold text-neutral-800 transition hover:bg-neutral-200"
      >
        <Send className="h-4 w-4" />
        Liberar
      </button>
    </li>
  )
}
