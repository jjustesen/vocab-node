import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Hourglass, Link2, Loader2, MessageCircle, RefreshCw, X } from 'lucide-react'
import { linkWhatsapp } from '@/lib/whatsapp'
import { useDesativarLinkDeCadastro, useGerarLinkDeCadastro, useLinkDeCadastro } from './api'

/**
 * Link de cadastro do professor (0019) — UM link, uso múltiplo, 24h. Quem
 * abre cria sozinho a própria ficha de aluno e a conta de login. Pensado para
 * mandar no grupo da turma, em vez de cadastrar aluno por aluno.
 */
export function ModalLinkDeCadastro({ aoFechar, noLimite }: { aoFechar: () => void; noLimite: boolean }) {
  const { data: link, isLoading, error } = useLinkDeCadastro()
  const gerar = useGerarLinkDeCadastro()
  const desativar = useDesativarLinkDeCadastro()
  const [copiado, setCopiado] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const agora = useAgoraPorMinuto()

  const url = link?.url ?? null
  const expirado = link ? new Date(link.registro.expira_em).getTime() <= agora : false
  const linkUtil = url && !expirado ? url : null

  useEffect(() => {
    if (!linkUtil) return setQrDataUrl(null)
    let cancelado = false
    QRCode.toDataURL(linkUtil, { width: 480, margin: 1 }).then((dataUrl) => {
      if (!cancelado) setQrDataUrl(dataUrl)
    })
    return () => {
      cancelado = true
    }
  }, [linkUtil])

  async function copiar() {
    if (!linkUtil) return
    await navigator.clipboard.writeText(linkUtil)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const erro = error ?? gerar.error ?? desativar.error

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Link de cadastro</h2>
            <p className="text-sm text-neutral-500">Um link para seus alunos se cadastrarem sozinhos.</p>
          </div>
          <button onClick={aoFechar} title="Fechar" className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-900">
          <b>Vale por 24h, para quantas pessoas abrirem.</b> Cada uma cria a própria conta e já entra na
          sua lista de alunos. Mande só para quem você quer como aluno — gerar um novo link desativa o
          anterior.
        </p>

        {noLimite && (
          <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            Você está no limite de alunos do seu plano: quem abrir o link agora não vai conseguir se
            cadastrar até você liberar uma vaga ou fazer upgrade.
          </p>
        )}

        {erro && (
          <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            {(erro as Error).message}
          </p>
        )}

        {isLoading && (
          <div className="grid h-32 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        )}

        {!isLoading && !link && (
          <BotaoGerar aoGerar={() => gerar.mutate()} gerando={gerar.isPending} destaque>
            Gerar link de cadastro
          </BotaoGerar>
        )}

        {link && expirado && (
          <>
            <p className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
              O último link expirou. Gere outro para abrir o cadastro por mais 24h.
            </p>
            <BotaoGerar aoGerar={() => gerar.mutate()} gerando={gerar.isPending} destaque>
              Gerar novo link
            </BotaoGerar>
          </>
        )}

        {link && !expirado && !url && (
          <>
            <p className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
              Você tem um link ativo até <b className="text-neutral-800">{formatarExpiracao(link.registro.expira_em)}</b>,
              mas ele foi gerado em outro navegador — por segurança, só o código embaralhado dele fica
              guardado. Gere um novo: o anterior deixa de funcionar.
            </p>
            <BotaoGerar aoGerar={() => gerar.mutate()} gerando={gerar.isPending} destaque>
              Gerar novo link
            </BotaoGerar>
          </>
        )}

        {link && linkUtil && (
          <>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={linkUtil}
                onFocus={(e) => e.target.select()}
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
                href={linkWhatsapp(
                  `Oi! Este é o link para você se cadastrar como meu aluno e acessar suas tarefas de inglês (vale por 24h): ${linkUtil}`,
                )}
                target="_blank"
                rel="noreferrer"
                title="Enviar pelo WhatsApp"
                className="shrink-0 rounded-xl bg-emerald-500 p-2 text-white"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>

            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
              <Hourglass className="h-3 w-3" />
              Expira em <b className="text-neutral-900">{tempoRestante(link.registro.expira_em, agora)}</b>
              <span className="text-neutral-400">· {formatarExpiracao(link.registro.expira_em)}</span>
            </p>

            {qrDataUrl && (
              <div className="mt-4 flex items-center gap-4">
                <img
                  src={qrDataUrl}
                  alt="QR code do link de cadastro"
                  className="h-28 w-28 shrink-0 rounded-2xl border border-neutral-200 bg-white p-1.5"
                />
                <p className="text-xs leading-relaxed text-neutral-500">
                  <b className="text-neutral-700">QR code</b> para mostrar em aula — cai na mesma página do
                  link.
                </p>
              </div>
            )}

            <BotaoGerar aoGerar={() => gerar.mutate()} gerando={gerar.isPending}>
              <RefreshCw className="h-4 w-4" /> Gerar novo link
            </BotaoGerar>
          </>
        )}

        {link && !expirado && (
          <button
            onClick={() => desativar.mutate(link.registro.id)}
            disabled={desativar.isPending}
            className="mt-3 w-full text-center text-xs font-bold text-neutral-400 hover:text-rose-600 disabled:opacity-50"
          >
            Desativar link agora
          </button>
        )}
      </div>
    </div>
  )
}

function BotaoGerar({
  aoGerar,
  gerando,
  destaque = false,
  children,
}: {
  aoGerar: () => void
  gerando: boolean
  destaque?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={aoGerar}
      disabled={gerando}
      className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-extrabold transition disabled:opacity-50 ${
        destaque ? 'bg-neutral-900 text-white' : 'border-[1.5px] border-neutral-200 bg-white text-neutral-900'
      }`}
    >
      {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : destaque && <Link2 className="h-4 w-4" />}
      {children}
    </button>
  )
}

/** Relógio que anda de minuto em minuto — o bastante para uma contagem em horas/minutos. */
function useAgoraPorMinuto(): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return agora
}

function tempoRestante(expiraEm: string, agora: number): string {
  const ms = Math.max(0, new Date(expiraEm).getTime() - agora)
  const horas = Math.floor(ms / 3_600_000)
  const minutos = Math.floor((ms % 3_600_000) / 60_000)
  return horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`
}

function formatarExpiracao(expiraEm: string): string {
  return new Date(expiraEm).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
