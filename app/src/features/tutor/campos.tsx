import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useSomenteLeitura } from './edicao'

/** Os campos do editor de lições: rótulo em cima, ajuda curta embaixo, tudo em português simples. */

export function Campo({
  rotulo,
  ajuda,
  valor,
  aoMudar,
  placeholder,
  ingles,
}: {
  rotulo: string
  ajuda?: string
  valor: string | undefined
  aoMudar: (v: string) => void
  placeholder?: string
  /** O campo é uma frase em inglês: corretor ortográfico em inglês. */
  ingles?: boolean
}) {
  const id = useId()
  const somenteLeitura = useSomenteLeitura()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-neutral-600">
        {rotulo}
      </label>
      <input
        id={id}
        readOnly={somenteLeitura}
        value={valor ?? ''}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        lang={ingles ? 'en' : 'pt-BR'}
        className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 read-only:bg-neutral-50"
      />
      {ajuda && <p className="mt-1 text-[11px] text-neutral-400">{ajuda}</p>}
    </div>
  )
}

export function Area({
  rotulo,
  ajuda,
  valor,
  aoMudar,
  linhas = 3,
}: {
  rotulo: string
  ajuda?: string
  valor: string | undefined
  aoMudar: (v: string) => void
  linhas?: number
}) {
  const id = useId()
  const somenteLeitura = useSomenteLeitura()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-neutral-600">
        {rotulo}
      </label>
      <textarea
        id={id}
        readOnly={somenteLeitura}
        value={valor ?? ''}
        rows={linhas}
        onChange={(e) => aoMudar(e.target.value)}
        className="mt-1 w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 read-only:bg-neutral-50"
      />
      {ajuda && <p className="mt-1 text-[11px] text-neutral-400">{ajuda}</p>}
    </div>
  )
}

/**
 * Uma lista de textos, um por linha. Enquanto a pessoa digita guarda o texto
 * cru (linhas em branco no meio da edição não somem do campo); quem lê a lista
 * recebe só as linhas preenchidas.
 */
export function Linhas({
  rotulo,
  ajuda,
  valor,
  aoMudar,
  ingles,
}: {
  rotulo: string
  ajuda?: string
  valor: string[] | undefined
  aoMudar: (v: string[]) => void
  ingles?: boolean
}) {
  const id = useId()
  const somenteLeitura = useSomenteLeitura()
  const [texto, setTexto] = useState(() => (valor ?? []).join('\n'))
  const externo = (valor ?? []).join('\n')
  const limpo = (t: string) =>
    t
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  // Se a lista mudou por fora (desfazer, outra seção), o campo acompanha.
  const mostrado = limpo(texto).join('\n') === externo ? texto : externo
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-neutral-600">
        {rotulo}
      </label>
      <textarea
        id={id}
        readOnly={somenteLeitura}
        value={mostrado}
        rows={Math.max(2, Math.min(8, mostrado.split('\n').length + 1))}
        lang={ingles ? 'en' : 'pt-BR'}
        onChange={(e) => {
          setTexto(e.target.value)
          aoMudar(limpo(e.target.value))
        }}
        className="mt-1 w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 read-only:bg-neutral-50"
      />
      <p className="mt-1 text-[11px] text-neutral-400">{ajuda ?? 'Uma por linha.'}</p>
    </div>
  )
}

/** Uma seção do editor, que abre e fecha — a lição inteira aberta é uma parede de campos. */
export function Secao({
  titulo,
  resumo,
  abertaDeInicio = false,
  children,
}: {
  titulo: string
  resumo?: string
  abertaDeInicio?: boolean
  children: ReactNode
}) {
  const [aberta, setAberta] = useState(abertaDeInicio)
  return (
    <section className="rounded-3xl bg-white">
      <button
        type="button"
        onClick={() => setAberta(!aberta)}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">{titulo}</span>
          {resumo && <span className="block text-xs text-neutral-500">{resumo}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-400 transition ${aberta ? 'rotate-180' : ''}`} />
      </button>
      {aberta && <div className="space-y-4 border-t border-neutral-100 px-5 py-4">{children}</div>}
    </section>
  )
}
