import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PencilLine, Plus, Sparkles } from 'lucide-react'

/**
 * "Nova atividade" abre as duas portas de entrada do fluxo em vez de escolher
 * uma por você — antes cada tela levava direto para um caminho diferente
 * (a home ia para a IA, a lista ia para o editor em branco), o que escondia
 * metade da funcionalidade dependendo de onde o professor clicasse.
 */
export function BotaoNovaAtividade({ compacto = false }: { compacto?: boolean }) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className={`flex items-center gap-2 rounded-full bg-neutral-900 font-bold text-white ${
          compacto ? 'px-4 py-2 text-sm' : 'px-5 py-3 text-sm'
        }`}
      >
        <Plus className="h-4 w-4" /> Nova atividade
      </button>

      {aberto && (
        <>
          {/* Clique em qualquer lugar fora fecha o menu. */}
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-12 z-20 w-64 overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-neutral-200">
            <Opcao
              para="/atividades/gerar"
              Icone={Sparkles}
              cor="bg-violet-100 text-violet-700"
              titulo="Gerar com IA"
              descricao="A partir do material da aula"
              aoIr={() => setAberto(false)}
            />
            <Opcao
              para="/atividades/nova"
              Icone={PencilLine}
              cor="bg-neutral-100 text-neutral-700"
              titulo="Criar do zero"
              descricao="Escrever as questões na mão"
              aoIr={() => setAberto(false)}
            />
          </div>
        </>
      )}
    </div>
  )
}

function Opcao({
  para,
  Icone,
  cor,
  titulo,
  descricao,
  aoIr,
}: {
  para: string
  Icone: typeof Sparkles
  cor: string
  titulo: string
  descricao: string
  aoIr: () => void
}) {
  return (
    <Link
      to={para}
      onClick={aoIr}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-neutral-100"
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${cor}`}>
        <Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-neutral-900">{titulo}</span>
        <span className="block text-xs text-neutral-400">{descricao}</span>
      </span>
    </Link>
  )
}
