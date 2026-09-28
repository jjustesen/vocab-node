import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Folder, FolderPlus, Inbox, Loader2 } from 'lucide-react'
import type { PastaMaterial } from '@/types/db'
import { useCriarPasta } from './api'

const LARGURA = 224
const ALTURA_MAXIMA = 320

/**
 * "Em qual pasta este material está" — e o atalho para mudar.
 *
 * Substitui um `<select>` nativo por dois motivos: o nativo não sabe desenhar
 * ícone nem marcar a pasta atual do jeito do resto da tela, e não deixa CRIAR
 * uma pasta ali — que é justamente quando a pessoa percebe que falta uma:
 * olhando para o arquivo que não cabe em nenhuma.
 *
 * O menu é `position: fixed`, calculado a partir do botão, e não `absolute`:
 * as linhas do acervo moram numa lista com `overflow-hidden` (para os cantos
 * arredondados), que cortaria o menu no meio. Abre para cima quando não há
 * espaço embaixo — é o caso na barra de lote, presa ao pé da tela.
 */
export function MenuDePasta({
  pastaId,
  pastas,
  aoEscolher,
  pendente = false,
  escuro = false,
  rotulo,
}: {
  /** A pasta atual. `undefined` quando não há uma só (seleção em lote). */
  pastaId: string | null | undefined
  pastas: PastaMaterial[]
  aoEscolher: (pastaId: string | null) => void
  pendente?: boolean
  /** Na barra de lote, que é escura. */
  escuro?: boolean
  /** Texto fixo do botão, no lugar do nome da pasta atual. */
  rotulo?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 })
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const criar = useCriarPasta()
  const botaoRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const atual = pastaId ? (pastas.find((p) => p.id === pastaId) ?? null) : null
  const texto = rotulo ?? (atual ? atual.nome : 'Sem pasta')

  function fechar() {
    setAberto(false)
    setCriando(false)
    setNome('')
    criar.reset()
  }

  useLayoutEffect(() => {
    if (!aberto || !botaoRef.current) return
    const r = botaoRef.current.getBoundingClientRect()
    // Alinha pela direita do botão (é o lado que fica no meio da linha), sem
    // deixar escapar pela esquerda da tela no celular.
    const left = Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8))
    const cabeEmbaixo = window.innerHeight - r.bottom > ALTURA_MAXIMA + 16
    setPosicao(cabeEmbaixo ? { top: r.bottom + 6, left } : { bottom: window.innerHeight - r.top + 6, left })
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    function fora(e: PointerEvent) {
      const alvo = e.target as Node
      if (!menuRef.current?.contains(alvo) && !botaoRef.current?.contains(alvo)) fechar()
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar()
    }
    // Menu fixo não acompanha a rolagem: rolar a lista com ele aberto o
    // deixaria flutuando longe do botão. Fecha, como o menu nativo faz.
    function rolou(e: Event) {
      if (!menuRef.current?.contains(e.target as Node)) fechar()
    }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', rolou, true)
    window.addEventListener('resize', fechar)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', rolou, true)
      window.removeEventListener('resize', fechar)
    }
    // `fechar` só mexe em estado; recriá-lo a cada render não muda nada aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  function escolher(id: string | null) {
    fechar()
    if (id !== (pastaId ?? null) || pastaId === undefined) aoEscolher(id)
  }

  function criarEMover(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    // Criar daqui já é mover: quem cria a pasta olhando para um arquivo quer
    // o arquivo dentro dela, não uma pasta vazia para ir preencher depois.
    criar.mutate(nome, { onSuccess: (pasta) => escolher(pasta.id) })
  }

  const item = 'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-neutral-100'

  return (
    <>
      <button
        ref={botaoRef}
        onClick={() => (aberto ? fechar() : setAberto(true))}
        disabled={pendente}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title="Mover para uma pasta"
        className={`flex max-w-40 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition disabled:opacity-60 ${
          escuro
            ? 'bg-white/10 text-white hover:bg-white/15'
            : aberto
              ? 'bg-neutral-200 text-neutral-900'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900'
        }`}
      >
        {pendente ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : atual || rotulo ? (
          <Folder className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Inbox className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{texto}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Mover para a pasta"
          style={{ ...posicao, width: LARGURA, maxHeight: ALTURA_MAXIMA }}
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl bg-white p-1.5 text-neutral-800 shadow-xl shadow-black/15 ring-1 ring-neutral-900/5"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-extrabold tracking-wide text-neutral-400 uppercase">
            Mover para
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <button role="menuitemradio" aria-checked={pastaId === null} onClick={() => escolher(null)} className={item}>
              <Inbox className="h-4 w-4 shrink-0 text-neutral-400" />
              <span className="flex-1 truncate">Sem pasta</span>
              {pastaId === null && <Check className="h-4 w-4 shrink-0 text-violet-600" />}
            </button>

            {pastas.map((p) => (
              <button
                key={p.id}
                role="menuitemradio"
                aria-checked={p.id === pastaId}
                onClick={() => escolher(p.id)}
                className={`${item} ${p.id === pastaId ? 'font-bold' : ''}`}
              >
                <Folder className={`h-4 w-4 shrink-0 ${p.id === pastaId ? 'text-violet-600' : 'text-neutral-400'}`} />
                <span className="flex-1 truncate">{p.nome}</span>
                {p.id === pastaId && <Check className="h-4 w-4 shrink-0 text-violet-600" />}
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-neutral-100 pt-1">
            {criando ? (
              <form onSubmit={criarEMover} className="p-1">
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Nome da pasta"
                    maxLength={60}
                    className="min-w-0 flex-1 rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <button
                    type="submit"
                    disabled={!nome.trim() || criar.isPending}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-900 text-white disabled:opacity-30"
                    aria-label="Criar pasta e mover"
                    title="Criar pasta e mover"
                  >
                    {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                </div>
                {criar.isError && (
                  <p className="mt-1.5 px-1 text-xs font-medium text-rose-600">
                    {criar.error instanceof Error ? criar.error.message : 'Não consegui criar a pasta.'}
                  </p>
                )}
              </form>
            ) : (
              <button onClick={() => setCriando(true)} className={`${item} font-bold text-violet-700 hover:bg-violet-50`}>
                <FolderPlus className="h-4 w-4 shrink-0" />
                Nova pasta
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
