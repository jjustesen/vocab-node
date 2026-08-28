import { useState } from 'react'
import { Download, FileText, Headphones, Image as ImageIcon, Loader2, Type } from 'lucide-react'
import { useMateriaisAluno, urlDoMaterialDoAluno, type MaterialDoAluno } from './api'
import { NavAluno } from './NavAluno'
import type { MaterialTipo } from '@/types/db'
import type { LucideIcon } from 'lucide-react'

const VISUAL_TIPO: Record<MaterialTipo, { Icone: LucideIcon; cor: string }> = {
  pdf: { Icone: FileText, cor: 'bg-rose-100 text-rose-700' },
  docx: { Icone: FileText, cor: 'bg-sky-100 text-sky-700' },
  imagem: { Icone: ImageIcon, cor: 'bg-violet-100 text-violet-700' },
  audio: { Icone: Headphones, cor: 'bg-amber-100 text-amber-700' },
  texto: { Icone: Type, cor: 'bg-neutral-100 text-neutral-600' },
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * /painel/materiais — o mesmo material que o professor guarda na ficha do
 * aluno (RF-50/51/52), agora visível para quem vai estudar. Só leitura: quem
 * envia e apaga é o professor, na aba dele.
 */
export function MateriaisAlunoPage() {
  const { data: materiais, isLoading, error } = useMateriaisAluno()

  return (
    <div className="min-h-dvh bg-areia px-5 pb-24 pt-6">
      <div className="mx-auto max-w-sm">
        <h1 className="text-lg font-extrabold text-neutral-900">Materiais</h1>
        <p className="text-xs font-medium text-neutral-500">O que seu professor deixou para você.</p>

        {isLoading && (
          <div className="mt-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            Não consegui carregar seus materiais.
          </p>
        )}

        {materiais && materiais.length === 0 && (
          <div className="mt-6 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
            <p className="font-bold text-neutral-700">Nenhum material ainda</p>
            <p className="mt-1 text-sm text-neutral-500">
              Quando seu professor guardar um PDF, áudio ou texto da aula, ele aparece aqui.
            </p>
          </div>
        )}

        {materiais && materiais.length > 0 && (
          <div className="mt-5 space-y-2">
            {materiais.map((m) => (
              <CartaoMaterial key={m.id} material={m} />
            ))}
          </div>
        )}
      </div>

      <NavAluno />
    </div>
  )
}

function CartaoMaterial({ material }: { material: MaterialDoAluno }) {
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [textoAberto, setTextoAberto] = useState(false)
  const visual = VISUAL_TIPO[material.tipo]

  async function baixar() {
    setErro(null)
    setBaixando(true)
    try {
      // A aba é aberta com o resultado do await, e não antes: o popup
      // bloqueador do celular deixa passar porque o clique ainda é a origem.
      window.open(await urlDoMaterialDoAluno(material.id), '_blank', 'noopener')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui gerar o link do arquivo.')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${visual.cor}`}>
          <visual.Icone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-neutral-800">{material.nome}</p>
          <p className="text-xs text-neutral-400">
            {material.tipo} · {formatarData(material.criadoEm)}
          </p>
        </div>

        {material.texto !== null && (
          <button
            onClick={() => setTextoAberto((v) => !v)}
            className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-100"
          >
            {textoAberto ? 'ocultar' : 'ver texto'}
          </button>
        )}

        {material.temArquivo && (
          <button
            onClick={baixar}
            disabled={baixando}
            title="Baixar arquivo"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
        )}
      </div>

      {erro && <p className="mt-2 text-xs font-medium text-rose-700">{erro}</p>}

      {textoAberto && material.texto && (
        <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          {material.texto}
        </p>
      )}
    </div>
  )
}
