import { useEffect, useState } from 'react'
import { Check, Copy, Link2, Loader2, MessageCircle, RefreshCw, Search, X } from 'lucide-react'
import QRCode from 'qrcode'
import { useAlunos } from '@/features/alunos/api'
import { linkWhatsapp } from '@/lib/whatsapp'
import {
  useEnviarAtividade,
  useGerarLinkAberto,
  useLinkAberto,
  useQuestoesDaAtividade,
  type EnvioResultado,
} from './api'

export function EnvioModal({
  atividadeId,
  atividadeTitulo,
  aoFechar,
}: {
  atividadeId: string
  atividadeTitulo: string
  aoFechar: () => void
}) {
  const { data: alunos } = useAlunos('ativo')
  const { data: questoes } = useQuestoesDaAtividade(atividadeId)
  const enviar = useEnviarAtividade(atividadeId)

  const [aba, setAba] = useState<'alunos' | 'link'>('alunos')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [prazo, setPrazo] = useState('')
  const [resultados, setResultados] = useState<EnvioResultado[] | null>(null)

  const termo = busca.trim().toLowerCase()
  // Quem já foi escolhido continua na lista mesmo fora da busca — senão o
  // professor filtra, marca alguém, digita outro nome e some com a seleção
  // anterior da tela, sem saber se ela ainda vale.
  const visiveis =
    alunos?.filter((a) => !termo || a.nome.toLowerCase().includes(termo) || selecionados.has(a.id)) ?? []

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      novo.has(id) ? novo.delete(id) : novo.add(id)
      return novo
    })
  }

  async function confirmarEnvio() {
    const escolhidos = alunos?.filter((a) => selecionados.has(a.id)) ?? []
    if (escolhidos.length === 0) return
    const enviados = await enviar.mutateAsync({ alunos: escolhidos, prazo: prazo || undefined })
    setResultados(enviados)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Enviar atividade</h2>
            <p className="text-sm text-neutral-500">
              {atividadeTitulo} · {questoes?.length ?? 0} questões
            </p>
          </div>
          <button onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!resultados && (
          <div className="mt-4 flex gap-1 rounded-full bg-neutral-100 p-1">
            <BotaoAba ativo={aba === 'alunos'} onClick={() => setAba('alunos')}>
              Enviar para alunos
            </BotaoAba>
            <BotaoAba ativo={aba === 'link'} onClick={() => setAba('link')}>
              Link aberto
            </BotaoAba>
          </div>
        )}

        {!resultados && aba === 'link' ? (
          <AbaLinkAberto atividadeId={atividadeId} atividadeTitulo={atividadeTitulo} />
        ) : !resultados ? (
          <>
            <p className="mt-4 text-xs font-bold text-neutral-600">Escolha os alunos</p>

            {(alunos?.length ?? 0) > 0 && (
              <div className="relative mt-1.5">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar aluno..."
                  className="w-full rounded-2xl bg-neutral-100 py-2.5 pl-10 pr-3 text-sm outline-none ring-neutral-900 focus:ring-2"
                />
              </div>
            )}

            <div className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto">
              {alunos?.length === 0 && (
                <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
                  Nenhum aluno cadastrado ainda.
                </p>
              )}
              {alunos && alunos.length > 0 && visiveis.length === 0 && (
                <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
                  Nenhum aluno com esse nome.
                </p>
              )}
              {visiveis.map((a) => {
                const marcado = selecionados.has(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => alternar(a.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition ${
                      marcado ? 'bg-neutral-900' : 'bg-neutral-50'
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                        marcado ? 'bg-amber-300 text-neutral-900' : 'bg-white text-neutral-500'
                      }`}
                    >
                      {a.nome.charAt(0).toUpperCase()}
                    </span>
                    <span className={`flex-1 text-sm font-bold ${marcado ? 'text-white' : 'text-neutral-700'}`}>
                      {a.nome}
                      {a.nivel_cefr && (
                        <span className={marcado ? 'text-neutral-400' : 'text-neutral-400'}> · {a.nivel_cefr}</span>
                      )}
                    </span>
                    {marcado && (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white">
                        <Check className="h-3.5 w-3.5 text-neutral-900" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <label className="mt-4 flex items-center gap-2 rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-700">
              Prazo <span className="font-normal text-neutral-400">(opcional)</span>
              <input
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="ml-auto bg-transparent text-sm outline-none"
              />
            </label>

            {enviar.error && (
              <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
                {(enviar.error as Error).message}
              </p>
            )}

            <button
              onClick={confirmarEnvio}
              disabled={selecionados.size === 0 || enviar.isPending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {enviar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar para {selecionados.size || ''} {selecionados.size === 1 ? 'aluno' : 'alunos'}
            </button>
          </>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              Enviado! Cada aluno recebe um link próprio.
            </p>
            {resultados.map((r) => (
              <LinkDoAluno key={r.aluno.id} resultado={r} atividadeTitulo={atividadeTitulo} />
            ))}
            <button
              onClick={aoFechar}
              className="mt-2 w-full rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function BotaoAba({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full py-2 text-xs font-extrabold transition ${
        ativo ? 'bg-neutral-900 text-white' : 'text-neutral-500'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Aba "Link aberto" — um único link por atividade, para quem ainda não é
 * aluno (feedback de 13/08/2026). Nas 12h após a geração quem abre pode se
 * cadastrar; depois o link vira só porta de acesso de quem já tem conta.
 */
function AbaLinkAberto({ atividadeId, atividadeTitulo }: { atividadeId: string; atividadeTitulo: string }) {
  const { data: linkAberto, isLoading } = useLinkAberto(atividadeId)
  const gerar = useGerarLinkAberto(atividadeId)
  const [copiado, setCopiado] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const url = linkAberto?.url ?? null
  const cadastroAberto = linkAberto ? new Date(linkAberto.registro.cadastro_expira_em) > new Date() : false

  useEffect(() => {
    if (!url) return setQrDataUrl(null)
    let cancelado = false
    QRCode.toDataURL(url, { width: 480, margin: 1 }).then((dataUrl) => {
      if (!cancelado) setQrDataUrl(dataUrl)
    })
    return () => {
      cancelado = true
    }
  }, [url])

  async function copiar() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="grid h-40 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="mt-4">
      <p className="rounded-2xl bg-amber-100 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-900">
        <b>Cadastro aberto por 12h.</b> Quem abrir o link nesse período cria a conta na hora — vira seu
        aluno — e já resolve a atividade. Depois disso, o link continua funcionando só para quem já tem
        conta.
      </p>

      {gerar.error && (
        <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          {(gerar.error as Error).message}
        </p>
      )}

      {!linkAberto && (
        <button
          onClick={() => gerar.mutate()}
          disabled={gerar.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Gerar link aberto
        </button>
      )}

      {linkAberto && !url && (
        <>
          <p className="mt-3 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
            Esta atividade já tem um link aberto, mas ele foi gerado em outro navegador — por segurança,
            só o código embaralhado dele fica guardado. Gere um novo: o anterior deixa de funcionar e a
            janela de 12h recomeça.
          </p>
          <BotaoGerarNovamente aoGerar={() => gerar.mutate()} gerando={gerar.isPending} destaque />
        </>
      )}

      {linkAberto && url && (
        <>
          <p className="mt-4 text-xs font-bold text-neutral-600">Link da atividade</p>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              readOnly
              value={url}
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
              href={linkWhatsapp(`Fiz uma atividade de inglês pra você: ${atividadeTitulo}. É só abrir o link: ${url}`)}
              target="_blank"
              rel="noreferrer"
              title="Enviar pelo WhatsApp"
              className="shrink-0 rounded-xl bg-emerald-500 p-2 text-white"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>

          <p className="mt-2 text-xs font-medium text-neutral-500">
            {cadastroAberto ? (
              <>
                Cadastro aberto até{' '}
                <b className="text-neutral-900">{formatarPrazoDoCadastro(linkAberto.registro.cadastro_expira_em)}</b>
              </>
            ) : (
              <>
                <b className="text-neutral-700">Cadastro encerrado</b> — o link segue valendo para quem já
                tem conta. Gere um novo para reabrir por mais 12h.
              </>
            )}
          </p>

          {qrDataUrl && (
            <div className="mt-4 flex items-center gap-4">
              <img
                src={qrDataUrl}
                alt="QR code do link aberto"
                className="h-28 w-28 shrink-0 rounded-2xl border border-neutral-200 bg-white p-1.5"
              />
              <p className="text-xs leading-relaxed text-neutral-500">
                <b className="text-neutral-700">QR code</b> para mostrar em aula ou mandar como imagem —
                cai na mesma página do link.
              </p>
            </div>
          )}

          <BotaoGerarNovamente aoGerar={() => gerar.mutate()} gerando={gerar.isPending} />
        </>
      )}
    </div>
  )
}

function BotaoGerarNovamente({
  aoGerar,
  gerando,
  destaque = false,
}: {
  aoGerar: () => void
  gerando: boolean
  destaque?: boolean
}) {
  return (
    <button
      onClick={aoGerar}
      disabled={gerando}
      className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-extrabold transition disabled:opacity-50 ${
        destaque
          ? 'bg-neutral-900 text-white'
          : 'border-[1.5px] border-neutral-200 bg-white text-neutral-900'
      }`}
    >
      {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Gerar novo link
    </button>
  )
}

/** "amanhã, 09:41" quando cabe; senão data completa — o professor decide rápido se reenvia. */
function formatarPrazoDoCadastro(iso: string): string {
  const data = new Date(iso)
  const agora = new Date()
  const mesmoDia = data.toDateString() === agora.toDateString()
  const amanha = new Date(agora)
  amanha.setDate(amanha.getDate() + 1)
  const ehAmanha = data.toDateString() === amanha.toDateString()

  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmoDia) return `hoje, ${hora}`
  if (ehAmanha) return `amanhã, ${hora}`
  return `${data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`
}

/** Também usado ao enviar da biblioteca pela ficha do aluno. */
export function LinkDoAluno({
  resultado,
  atividadeTitulo,
}: {
  resultado: EnvioResultado
  atividadeTitulo: string
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    await navigator.clipboard.writeText(resultado.link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const primeiroNome = resultado.aluno.nome.split(' ')[0]
  const mensagem = `Oi ${primeiroNome}! Sua tarefa já está pronta: ${atividadeTitulo}. É só abrir o link: ${resultado.link}`
  const linkWhatsapp = `https://wa.me/?text=${encodeURIComponent(mensagem)}`

  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <p className="text-xs font-bold text-neutral-700">{resultado.aluno.nome}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          readOnly
          value={resultado.link}
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
  )
}
