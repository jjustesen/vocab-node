import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

/**
 * Apagar em dois cliques, sem diálogo do navegador.
 *
 * ── Por que não `confirm()` ─────────────────────────────────────────────────
 *
 * Porque ele falha CALADO. Depois de alguns diálogos seguidos o Chrome oferece
 * "impedir esta página de criar novos diálogos", e quem marca isso passa a ter
 * `confirm()` retornando `false` para sempre — o botão simplesmente para de
 * funcionar, sem erro, sem aviso, sem nada no console. Foi exatamente o que
 * aconteceu com o "tirar da turma".
 *
 * A confirmação em dois cliques não depende de nada do navegador, mostra a
 * consequência no lugar onde o dedo já está, e desarma sozinha se a pessoa
 * mudar de ideia.
 *
 * ── Por que desarmar sozinho ────────────────────────────────────────────────
 *
 * Um botão que fica armado indefinidamente vira uma armadilha: a pessoa clica,
 * se distrai, volta dez minutos depois, clica de novo achando que está
 * começando — e apaga. O relógio devolve o botão ao estado seguro.
 */

/** Tempo armado antes de voltar sozinho ao estado seguro — folga para ler e decidir. */
const DESARMA_MS = 6000

export function BotaoApagar({
  titulo,
  confirmacao,
  aoConfirmar,
  pendente = false,
}: {
  /** O que o botão faz, no estado normal. Vira o `title`. */
  titulo: string
  /** O texto curto que aparece quando ele está armado — "Tirar?", "Apagar?". */
  confirmacao: string
  aoConfirmar: () => void
  pendente?: boolean
}) {
  const [armado, setArmado] = useState(false)

  useEffect(() => {
    if (!armado) return
    const id = setTimeout(() => setArmado(false), DESARMA_MS)
    return () => clearTimeout(id)
  }, [armado])

  if (pendente) {
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    )
  }

  return (
    <button
      onClick={() => {
        if (armado) {
          aoConfirmar()
          setArmado(false)
        } else {
          setArmado(true)
        }
      }}
      onBlur={() => setArmado(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setArmado(false)
      }}
      title={armado ? `${confirmacao} Clique de novo para confirmar.` : titulo}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-bold transition ${
        armado
          ? 'bg-rose-600 text-white'
          : 'text-neutral-300 hover:bg-rose-50 hover:text-rose-600'
      }`}
    >
      <Trash2 className="h-4 w-4 shrink-0" />
      {armado && <span className="whitespace-nowrap">{confirmacao}</span>}
    </button>
  )
}
