import { BookOpen, Headphones, MessageSquare, Mic, Target, Type } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Vocabulário visual da atividade — vive fora da página da biblioteca porque
 * o mesmo código de cor/ícone aparece em qualquer lugar que liste atividades
 * (biblioteca, escolha por aluno). Duas tabelas divergindo é como o nível B1
 * vira violeta numa tela e cinza na outra.
 */
export const CORES_NIVEL: Record<string, string> = {
  A1: 'bg-emerald-100 text-emerald-800',
  A2: 'bg-amber-100 text-amber-800',
  B1: 'bg-violet-200 text-violet-900',
  B2: 'bg-pink-100 text-pink-800',
  C1: 'bg-sky-100 text-sky-800',
}

/**
 * Ícone e cor pela habilidade principal (a primeira marcada), para a lista ser
 * varrida pelo olho em vez de lida item a item. Sem habilidade marcada cai no
 * livro neutro.
 */
const VISUAL_HABILIDADE: Record<string, { Icone: LucideIcon; cor: string }> = {
  leitura: { Icone: BookOpen, cor: 'bg-violet-100 text-violet-700' },
  gramatica: { Icone: Type, cor: 'bg-amber-100 text-amber-700' },
  listening: { Icone: Headphones, cor: 'bg-sky-100 text-sky-700' },
  fala: { Icone: Mic, cor: 'bg-rose-100 text-rose-700' },
  vocabulario: { Icone: Target, cor: 'bg-emerald-100 text-emerald-700' },
  escrita: { Icone: MessageSquare, cor: 'bg-pink-100 text-pink-700' },
}

export function visualDaHabilidade(habilidades: string[]) {
  return (
    VISUAL_HABILIDADE[habilidades[0]] ?? { Icone: BookOpen, cor: 'bg-neutral-100 text-neutral-600' }
  )
}
