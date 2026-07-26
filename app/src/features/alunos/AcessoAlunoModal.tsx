import { useState } from 'react'
import { AlertTriangle, Check, Copy, Loader2, MessageCircle, X } from 'lucide-react'
import { useGerarLinkCadastro, useResetarAcesso } from './api'

/**
 * Um modal só para as duas ações de acesso do aluno (RF-22 e RF-25): gerar o
 * primeiro link de cadastro, ou resetar o acesso de quem já tem conta. A
 * diferença entre os dois é só a etapa de confirmação — o reset exige
 * confirmação explícita (RF-26), a geração inicial não.
 */
export function AcessoAlunoModal({
  alunoId,
  alunoNome,
  temConta,
  aoFechar,
}: {
  alunoId: string
  alunoNome: string
  temConta: boolean
  aoFechar: () => void
}) {
  const gerar = useGerarLinkCadastro(alunoId)
  const resetar = useResetarAcesso(alunoId)
  const [confirmado, setConfirmado] = useState(!temConta)
  const [link, setLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const emAndamento = gerar.isPending || resetar.isPending
  const erro = (gerar.error as Error | null)?.message ?? (resetar.error as Error | null)?.message

  async function executar() {
    const resultado = temConta ? await resetar.mutateAsync() : { link: await gerar.mutateAsync() }
    setLink(resultado.link)
  }

  async function copiar() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const primeiroNome = alunoNome.split(' ')[0]
  const mensagem = `Oi ${primeiroNome}! Aqui está o link para criar seu acesso: ${link}`
  const linkWhatsapp = `https://wa.me/?text=${encodeURIComponent(mensagem)}`

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-extrabold">{temConta ? 'Resetar acesso' : 'Gerar link de cadastro'}</h2>
          <button onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {link ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              {temConta ? 'Acesso resetado — envie o novo link para ' : 'Envie este link para '}
              {primeiroNome}.
            </p>
            <div className="rounded-2xl bg-neutral-50 p-3">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link}
                  className="w-full truncate rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500 outline-none"
                />
                <button
                  onClick={copiar}
                  title="Copiar link"
                  className="shrink-0 rounded-xl border border-neutral-200 bg-white p-2 text-neutral-600"
                >
                  {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
                <a
                  href={linkWhatsapp}
                  target="_blank"
                  rel="noreferrer"
                  title="Enviar pelo WhatsApp"
                  className="shrink-0 rounded-xl bg-emerald-500 p-2 text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              </div>
            </div>
            <p className="text-xs text-neutral-400">Uso único · expira em 7 dias · o histórico de {primeiroNome} foi mantido.</p>
            <button onClick={aoFechar} className="mt-2 w-full rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white">
              Concluir
            </button>
          </div>
        ) : temConta && !confirmado ? (
          <div className="mt-4">
            <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Isso vai desconectar o acesso atual de <b>{alunoNome}</b> e derrubar as sessões abertas. Um novo link
                de cadastro é gerado na hora. <b>Todo o histórico é mantido.</b>
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={aoFechar}
                className="flex-1 rounded-full border border-neutral-300 py-3 text-sm font-bold text-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => setConfirmado(true)}
                className="flex-1 rounded-full bg-rose-600 py-3 text-sm font-extrabold text-white"
              >
                Confirmar reset
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-neutral-500">
              Gera um link de uso único para {alunoNome} criar a própria conta. O histórico atual é mantido.
            </p>
            {erro && (
              <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">{erro}</p>
            )}
            <button
              onClick={executar}
              disabled={emAndamento}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {emAndamento && <Loader2 className="h-4 w-4 animate-spin" />}
              {temConta ? 'Gerar novo link' : 'Gerar link'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
