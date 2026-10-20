import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Um ajuste liga/desliga em cartão: ícone, título, descrição e a chave.
 * Configurações é uma lista destes — o próximo ajuste entra como mais um.
 */
export function Interruptor({
  Icone,
  titulo,
  descricao,
  ligado,
  aoMudar,
  desabilitado,
}: {
  Icone: LucideIcon
  titulo: string
  descricao: string
  ligado: boolean
  aoMudar: (ligado: boolean) => void
  desabilitado?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-4 rounded-3xl bg-white p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
        <Icone className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="font-extrabold">
          {titulo}
        </label>
        <p id={`${id}-descricao`} className="mt-1 text-sm text-neutral-500">
          {descricao}
        </p>
      </div>
      <Chave
        id={id}
        descritoPor={`${id}-descricao`}
        ligado={ligado}
        aoMudar={aoMudar}
        desabilitado={desabilitado}
        className="mt-1"
      />
    </div>
  )
}

/**
 * Só a chave, para linhas de lista (o tutor de cada aluno). Sem rótulo
 * visível, `rotulo` vira o nome acessível — "Tutor de Ana", não "botão".
 */
export function Chave({
  ligado,
  aoMudar,
  rotulo,
  id,
  descritoPor,
  desabilitado,
  className = '',
}: {
  ligado: boolean
  aoMudar: (ligado: boolean) => void
  rotulo?: string
  id?: string
  descritoPor?: string
  desabilitado?: boolean
  className?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      aria-describedby={descritoPor}
      disabled={desabilitado}
      onClick={() => aoMudar(!ligado)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${
        ligado ? 'bg-neutral-900' : 'bg-neutral-300'
      } ${className}`}
    >
      <span
        className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          ligado ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}
