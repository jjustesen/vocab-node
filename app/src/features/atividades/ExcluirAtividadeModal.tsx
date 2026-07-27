import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useExcluirAtividade } from './api'

export function ExcluirAtividadeModal({
  atividadeId,
  atividadeTitulo,
  envios,
  aoFechar,
  aoExcluir,
}: {
  atividadeId: string
  atividadeTitulo: string
  envios: number
  aoFechar: () => void
  /** Chamado após a exclusão ter sucesso — usado pela ficha da atividade para voltar à biblioteca. */
  aoExcluir?: () => void
}) {
  const excluir = useExcluirAtividade()

  async function confirmar() {
    await excluir.mutateAsync(atividadeId)
    aoExcluir?.()
    aoFechar()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <button onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className="mt-4 text-lg font-extrabold text-neutral-900">Excluir "{atividadeTitulo}"?</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Essa ação não pode ser desfeita.{' '}
          {envios > 0
            ? `${envios} ${envios === 1 ? 'aluno vai perder' : 'alunos vão perder'} o histórico de envios e respostas dessa atividade.`
            : 'Ninguém respondeu essa atividade ainda.'}
        </p>

        {excluir.error && (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            {(excluir.error as Error).message}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={aoFechar}
            className="flex-1 rounded-full border border-neutral-300 bg-white py-3 text-sm font-bold text-neutral-700"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={excluir.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {excluir.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Excluir atividade
          </button>
        </div>
      </div>
    </div>
  )
}
