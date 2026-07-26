/**
 * Chip de seleção. `preto` = escolha única (nível, quantidade de questões);
 * `lilas` = seleção múltipla (habilidades), que por ser cumulativa não deve
 * competir visualmente com a escolha única ao lado.
 */
export function Chip({
  ativo,
  aoClicar,
  desabilitado = false,
  variante = 'preto',
  children,
}: {
  ativo: boolean
  aoClicar: () => void
  desabilitado?: boolean
  variante?: 'preto' | 'lilas'
  children: React.ReactNode
}) {
  const ativoClasse =
    variante === 'lilas' ? 'border border-violet-300 bg-violet-50 text-violet-700' : 'bg-neutral-900 text-white'
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
        ativo ? ativoClasse : 'border border-neutral-200 text-neutral-500 hover:border-neutral-400'
      }`}
    >
      {children}
    </button>
  )
}
