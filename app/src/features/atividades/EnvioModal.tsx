import { useState } from 'react'
import { Check, Copy, Loader2, MessageCircle, Search, X } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import { useEnviarAtividade, useQuestoesDaAtividade, type EnvioResultado } from './api'

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

        {!resultados ? (
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
