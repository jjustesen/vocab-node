/**
 * Classes compartilhadas das peças "com espessura" das telas do aluno.
 *
 * Separado de visual.tsx porque o fast refresh do Vite só funciona em
 * arquivos que exportam apenas componentes.
 */

/** A lousa do desktop: cartão branco com borda e base, só a partir de `md`. */
export const LOUSA = 'md:rounded-[2rem] md:border-2 md:border-neutral-200 md:border-b-[6px] md:bg-white'

/** Base do botão "com espessura": afunda 4px ao apertar. Cores vêm de fora. */
export const BOTAO_CHUNKY =
  'flex items-center justify-center gap-2 rounded-2xl border-b-4 font-extrabold tracking-wide transition active:translate-y-1 active:border-b-0 disabled:pointer-events-none disabled:opacity-40'

/**
 * A ficha de resposta (alternativa, palavra, par). Neutra por padrão; as
 * variantes trocam borda e fundo sem mexer no tamanho, para nada pular de
 * lugar quando o feedback chega.
 */
export const FICHA_BASE =
  'rounded-2xl border-2 border-b-4 text-left font-bold transition active:translate-y-0.5 active:border-b-2 disabled:pointer-events-none'

export const FICHA_COR = {
  neutra: 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50',
  apagada: 'border-neutral-200 bg-white text-neutral-400',
  selecionada: 'border-violet-400 bg-violet-50 text-violet-900',
  certa: 'border-emerald-400 bg-emerald-50 text-emerald-900',
  errada: 'border-rose-400 bg-rose-50 text-rose-900',
  errando: 'animate-treme border-rose-400 bg-rose-50 text-rose-700',
} as const
