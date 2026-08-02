import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Library, PencilLine, Plus, Sparkles } from 'lucide-react'
import { EscolherDaBibliotecaModal } from './EscolherDaBibliotecaModal'
import type { Aluno } from '@/types/db'

/**
 * "Nova atividade" abre as portas de entrada do fluxo em vez de escolher uma
 * por você — antes cada tela levava direto para um caminho diferente (a home
 * ia para a IA, a lista ia para o editor em branco), o que escondia metade da
 * funcionalidade dependendo de onde o professor clicasse.
 *
 * Na ficha de um aluno entra uma terceira porta: mandar uma atividade que já
 * existe. Ela só aparece ali porque depende de saber para quem enviar — na
 * biblioteca e na home não há aluno no contexto, e o caminho de lá continua
 * sendo abrir a atividade e usar "Enviar".
 */
export function BotaoNovaAtividade({ compacto = false, aluno }: { compacto?: boolean; aluno?: Aluno }) {
  const [aberto, setAberto] = useState(false)
  const [bibliotecaAberta, setBibliotecaAberta] = useState(false)

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
              para="/atividades/lote"
              Icone={Layers}
              cor="bg-violet-100 text-violet-700"
              titulo="Gerar em lote"
              descricao="Vários materiais de uma vez"
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
            {aluno && (
              <Opcao
                Icone={Library}
                cor="bg-emerald-100 text-emerald-700"
                titulo="Escolher da biblioteca"
                descricao="Enviar uma atividade que já existe"
                aoIr={() => {
                  setAberto(false)
                  setBibliotecaAberta(true)
                }}
              />
            )}
          </div>
        </>
      )}

      {bibliotecaAberta && aluno && (
        <EscolherDaBibliotecaModal aluno={aluno} aoFechar={() => setBibliotecaAberta(false)} />
      )}
    </div>
  )
}

/** Sem `para` vira botão: a opção da biblioteca abre um modal, não navega. */
function Opcao({
  para,
  Icone,
  cor,
  titulo,
  descricao,
  aoIr,
}: {
  para?: string
  Icone: typeof Sparkles
  cor: string
  titulo: string
  descricao: string
  aoIr: () => void
}) {
  const classe = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-neutral-100'
  const conteudo = (
    <>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${cor}`}>
        <Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-neutral-900">{titulo}</span>
        <span className="block text-xs text-neutral-400">{descricao}</span>
      </span>
    </>
  )

  return para ? (
    <Link to={para} onClick={aoIr} className={classe}>
      {conteudo}
    </Link>
  ) : (
    <button type="button" onClick={aoIr} className={classe}>
      {conteudo}
    </button>
  )
}
