import { Loader2, UserPlus } from 'lucide-react'
import { useCompletarNaTurma } from './conteudos'

/**
 * "Enviar para quem falta" — ao lado de algo da turma que um membro não tem.
 *
 * Normalmente nunca aparece: entrar na turma já entrega tudo. É o conserto de
 * quando esse envio automático falhou no meio (rede, trilha sem etapas).
 * Completa a turma inteira, não só este item — o que faltava, falta junto.
 *
 * Um clique, sem confirmação: só manda para quem não tem, então não há como
 * duplicar nada para quem já está fazendo.
 */
export function CompletarNaTurma({ turmaId, faltam }: { turmaId: string; faltam: number }) {
  const completar = useCompletarNaTurma(turmaId)

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        onClick={() => completar.mutate()}
        disabled={completar.isPending}
        title={`Enviar para ${faltam === 1 ? 'quem ainda não recebeu' : `os ${faltam} que ainda não receberam`}`}
        className="flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 transition hover:bg-violet-100 disabled:opacity-50"
      >
        {completar.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserPlus className="h-3.5 w-3.5" />
        )}
        Enviar para quem falta
      </button>
      {completar.isError && (
        <span className="max-w-48 text-right text-[11px] font-medium text-rose-600">
          {(completar.error as Error).message}
        </span>
      )}
    </span>
  )
}
