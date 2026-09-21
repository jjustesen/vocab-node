import { BOTAO_CHUNKY, LOUSA } from './estilo'

/**
 * Peças visuais compartilhadas pelas telas do ALUNO (mockups A1–A7).
 *
 * O aluno vê o app quase sempre no celular, numa coluna estreita, e o desenho
 * aposta em cor pastel + formas soltas no fundo em vez de bordas. Como essas
 * formas se repetem em quatro telas, ficam aqui.
 *
 * Desde 20/09/2026 as peças de responder seguem a linguagem "de jogo" do
 * Duolingo: borda de 2px com base de 4px (a ficha parece ter espessura e
 * afunda ao tocar), texto maior e mais pesado, e as cores de acerto/erro na
 * própria ficha. Sem isso, num fundo areia as fichas brancas sem borda
 * pareciam papel solto.
 */

/** Círculos pastel atrás do conteúdo, como nas telas de celebração (A3/A7). */
export function FormasDeFundo() {
  return (
    <>
      <span className="pointer-events-none absolute -left-8 top-10 h-24 w-24 rounded-full bg-violet-200" />
      <span className="pointer-events-none absolute -right-10 top-24 h-28 w-28 rounded-full bg-emerald-100" />
      <span className="pointer-events-none absolute left-6 top-56 h-10 w-10 rounded-full bg-amber-200" />
    </>
  )
}

/**
 * Moldura das telas do aluno: fundo areia, coluna estreita, formas opcionais.
 *
 * `moldura` liga a "lousa" do desktop: a partir de `md` a coluna alarga e
 * ganha um cartão branco com borda e base — no celular o conteúdo ocupa a
 * tela, mas num monitor ele ficava boiando no meio do areia.
 */
export function TelaAluno({
  children,
  comFormas = false,
  centralizado = false,
  moldura = false,
}: {
  children: React.ReactNode
  comFormas?: boolean
  centralizado?: boolean
  moldura?: boolean
}) {
  return (
    <div
      className={`relative min-h-dvh overflow-hidden bg-areia px-5 pb-10 ${
        centralizado ? 'grid place-items-center' : 'pt-4 md:pt-10'
      }`}
    >
      {comFormas && <FormasDeFundo />}
      <div
        className={`relative mx-auto w-full max-w-sm ${
          moldura ? `md:max-w-lg ${LOUSA} md:px-10 md:py-8` : ''
        }`}
      >
        {children}
      </div>
    </div>
  )
}

/** Chip pequeno de metadado ("10 questões", "~8 min"). */
export function Chip({ children, cor = 'bg-neutral-100 text-neutral-600' }: { children: React.ReactNode; cor?: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cor}`}>{children}</span>
}

/**
 * Botão principal — o padrão de ação das telas do aluno. Tem base de 4px que
 * some ao apertar, o que dá a sensação de tecla física. `cor` troca para o
 * verde do acerto e o rosa do erro no rodapé da questão.
 */
export function BotaoPrincipal({
  children,
  onClick,
  disabled,
  tipo = 'button',
  cor = 'escuro',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tipo?: 'button' | 'submit'
  cor?: 'escuro' | 'verde' | 'rosa' | 'violeta'
}) {
  const cores = {
    escuro: 'bg-neutral-900 border-neutral-950 text-white',
    verde: 'bg-emerald-500 border-emerald-700 text-white',
    rosa: 'bg-rose-500 border-rose-700 text-white',
    violeta: 'bg-violet-500 border-violet-700 text-white',
  }[cor]

  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled}
      className={`${BOTAO_CHUNKY} w-full py-3.5 text-base ${cores}`}
    >
      {children}
    </button>
  )
}
