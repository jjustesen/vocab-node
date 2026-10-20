import { Link } from 'react-router-dom'
import { ChevronRight, Loader2, Mic } from 'lucide-react'
import { NavAluno } from '@/features/painel/NavAluno'
import { useLicoesDoAluno, type LicaoDoAluno } from './api'

/**
 * /painel/tutor — as lições que o professor liberou para praticar com o tutor
 * oral. Só aparece no menu quando o professor ligou o tutor para este aluno;
 * a função confere de novo em cada chamada.
 */
export function TutorAlunoPage() {
  const { data, isLoading, error } = useLicoesDoAluno()

  return (
    <div className="min-h-dvh bg-areia px-5 pb-24 pt-6">
      <div className="mx-auto max-w-sm">
        <h1 className="text-lg font-extrabold text-neutral-900">Tutor</h1>
        <p className="text-xs font-medium text-neutral-500">
          Pratique falando em inglês: o tutor ouve, corrige uma coisa de cada vez e ajuda quando você travar.
        </p>

        {isLoading && (
          <div className="mt-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{error.message}</p>
        )}

        {data && (
          <p
            className={`mt-4 rounded-2xl px-4 py-2.5 text-xs font-bold ${
              data.restantes > 0 ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {data.restantes > 0
              ? `${data.restantes} de ${data.limite} ${data.limite === 1 ? 'sessão' : 'sessões'} disponíveis este mês`
              : `Você já usou as ${data.limite} sessões deste mês. No mês que vem tem mais!`}
          </p>
        )}

        {data && data.licoes.length === 0 && (
          <div className="mt-6 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
            <p className="font-bold text-neutral-700">Nenhuma lição ainda</p>
            <p className="mt-1 text-sm text-neutral-500">Quando seu professor liberar uma lição para você, ela aparece aqui.</p>
          </div>
        )}

        {data && data.licoes.length > 0 && (
          <div className="mt-4 space-y-2">
            {data.licoes.map((l) => (
              <CartaoLicao key={l.id} licao={l} />
            ))}
          </div>
        )}

        {data && data.licoes.length > 0 && (
          <p className="mt-4 px-1 text-[11px] text-neutral-400">Use fone de ouvido se puder. O navegador vai pedir o microfone.</p>
        )}
      </div>

      <NavAluno />
    </div>
  )
}

function CartaoLicao({ licao }: { licao: LicaoDoAluno }) {
  const u = licao.ultima
  return (
    <Link
      to={`/painel/tutor/${licao.id}`}
      className="flex items-center gap-3 rounded-3xl bg-white p-4 transition active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
        <Mic className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-extrabold text-neutral-900">{licao.titulo}</span>
          {licao.nivel && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">
              {licao.nivel}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-neutral-500">
          {!u
            ? 'Nova'
            : u.concluida && u.resumo
              ? `Última vez: ${u.resumo.autonomos.length} sozinho · ${u.resumo.comAjuda.length} com ajuda`
              : 'Você parou no meio da última vez'}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
    </Link>
  )
}
