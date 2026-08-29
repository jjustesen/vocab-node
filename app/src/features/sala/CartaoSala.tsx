import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Loader2, RefreshCw, Video } from 'lucide-react'
import { linkDaSala, useCriarSala, useSala } from './api'

/**
 * A sala do aluno — aparece no Resumo e na aba Aulas da ficha (0012).
 *
 * O link vem do banco (0013), então é o mesmo em qualquer navegador. Sobra um
 * caso de canto: salas criadas ANTES daquela migration não têm o token
 * guardado e não há como reexibi-lo. Aí a tela diz isso com todas as letras,
 * em vez de esconder o botão — a saída é gerar outro link.
 */
export function CartaoSala({ alunoId, alunoNome }: { alunoId: string; alunoNome: string }) {
  const { data: sala, isLoading } = useSala(alunoId)
  const criar = useCriarSala(alunoId)
  const [copiado, setCopiado] = useState(false)

  const link = criar.data ?? (sala?.token ? linkDaSala(sala.token) : null)
  const primeiroNome = alunoNome.split(' ')[0]

  async function copiar() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="mt-4 flex justify-center rounded-3xl bg-white py-6">
        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-3xl bg-neutral-900 p-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold text-violet-300">
            <Video className="h-3.5 w-3.5" /> Sala de vídeo
          </p>
          <p className="mt-0.5 text-sm font-extrabold">
            {sala ? `Sala de ${primeiroNome}` : `${primeiroNome} ainda não tem sala`}
          </p>
        </div>
        {sala && (
          <Link
            to={`/sala/${alunoId}`}
            className="shrink-0 rounded-full bg-violet-300 px-4 py-2 text-xs font-extrabold text-neutral-900"
          >
            Entrar
          </Link>
        )}
      </div>

      {!sala && (
        <p className="mt-2 text-xs text-neutral-400">
          O link é o mesmo toda semana — combine uma vez e {primeiroNome} entra direto, sem instalar nada
          e sem criar senha.
        </p>
      )}

      {sala && !link && (
        <p className="mt-3 rounded-2xl bg-amber-400/10 px-4 py-3 text-xs font-medium text-amber-200">
          Esta sala foi criada antes de o link passar a ser guardado, então não dá para mostrá-lo de novo.
          Gerar um novo link derruba o que {primeiroNome} já tem.
        </p>
      )}

      {link && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-300">{link}</span>
          <button
            onClick={copiar}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-neutral-900"
          >
            {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      )}

      <button
        onClick={() => criar.mutate()}
        disabled={criar.isPending}
        className="mt-3 flex items-center gap-1.5 text-xs font-bold text-neutral-400 hover:text-white disabled:opacity-50"
      >
        {criar.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {sala ? 'Gerar novo link (o atual para de funcionar)' : 'Criar a sala'}
      </button>

      {criar.error && (
        <p className="mt-2 text-xs font-medium text-rose-300">{(criar.error as Error).message}</p>
      )}
    </div>
  )
}
