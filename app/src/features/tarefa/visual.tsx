/**
 * Peças visuais compartilhadas pelas telas do ALUNO (mockups A1–A7).
 *
 * O aluno vê o app quase sempre no celular, numa coluna estreita, e o desenho
 * aposta em cor pastel + formas soltas no fundo em vez de bordas. Como essas
 * formas se repetem em quatro telas, ficam aqui.
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

/** Moldura das telas do aluno: fundo areia, coluna estreita, formas opcionais. */
export function TelaAluno({
  children,
  comFormas = false,
  centralizado = false,
}: {
  children: React.ReactNode
  comFormas?: boolean
  centralizado?: boolean
}) {
  return (
    <div
      className={`relative min-h-dvh overflow-hidden bg-areia px-5 pb-10 ${
        centralizado ? 'grid place-items-center' : 'pt-4'
      }`}
    >
      {comFormas && <FormasDeFundo />}
      <div className="relative mx-auto w-full max-w-sm">{children}</div>
    </div>
  )
}

/** Chip pequeno de metadado ("10 questões", "~8 min"). */
export function Chip({ children, cor = 'bg-neutral-100 text-neutral-600' }: { children: React.ReactNode; cor?: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cor}`}>{children}</span>
}

/** Botão principal preto, arredondado — o padrão de ação das telas do aluno. */
export function BotaoPrincipal({
  children,
  onClick,
  disabled,
  tipo = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tipo?: 'button' | 'submit'
}) {
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-base font-extrabold text-white transition disabled:opacity-40"
    >
      {children}
    </button>
  )
}
