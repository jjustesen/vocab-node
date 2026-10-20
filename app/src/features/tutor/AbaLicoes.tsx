import { Link } from 'react-router-dom'
import { ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { type LicaoNaLista, useLiberacoesTutor, useTodasAsLicoes } from './api'

/**
 * As lições do tutor: as do professor (geradas pela IA a partir do material
 * dele, em rascunho até ele publicar) e as da biblioteca, só para leitura.
 */
export function AbaLicoes() {
  const { data: licoes, isLoading } = useTodasAsLicoes()
  const { data: liberacoes } = useLiberacoesTutor()

  const alunosPorLicao = new Map<string, number>()
  for (const ids of liberacoes?.values() ?? []) for (const id of ids) alunosPorLicao.set(id, (alunosPorLicao.get(id) ?? 0) + 1)
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
            Envie a foto, o PDF ou o texto de uma página de drillings e a IA monta a lição. Você revisa antes de publicar.
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {minhas.map((l) => (
            <LinhaDaLicao key={l.id} licao={l} alunos={alunosPorLicao.get(l.id) ?? 0} />
          ))}
        </ul>
      )}

      {biblioteca.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Biblioteca</h2>
          <p className="mt-1 text-xs text-neutral-500">Lições prontas do Vocab Node. Dá para abrir, ouvir e experimentar, mas não editar.</p>
          <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
            {biblioteca.map((l) => (
              <LinhaDaLicao key={l.id} licao={l} alunos={alunosPorLicao.get(l.id) ?? 0} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function LinhaDaLicao({ licao, alunos }: { licao: LicaoNaLista; alunos: number }) {
  const audios = licao.falas_gravadas.length
  return (
    <li>
      <Link to={`/tutor/licoes/${licao.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-neutral-50">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold">{licao.titulo}</span>
            {licao.nivel_cefr && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-extrabold text-indigo-700">
                {licao.nivel_cefr}
              </span>
            )}
            {licao.professor_id &&
              (licao.publicada ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">publicada</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">rascunho</span>
              ))}
          </span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            {alunos} {alunos === 1 ? 'aluno' : 'alunos'} · {audios} {audios === 1 ? 'áudio gravado' : 'áudios gravados'}
            {licao.professor_id && ` · editada em ${new Date(licao.atualizado_em).toLocaleDateString('pt-BR')}`}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
      </Link>
    </li>
  )
}
