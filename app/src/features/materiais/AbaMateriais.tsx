import { useState } from 'react'
import {
  Download,
  FileText,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react'
import {
  TAMANHO_MAX_MATERIAL,
  tipoDoArquivo,
  urlAssinada,
  useEnviarMaterial,
  useExcluirMaterial,
  useMateriaisDoAluno,
} from './api'
import type { Material, MaterialTipo } from '@/types/db'
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

/** RF-50/51/52: material avulso do professor vinculado a este aluno. */
export function AbaMateriais({ alunoId, alunoNome }: { alunoId: string; alunoNome: string }) {
  const { data: materiais, isLoading } = useMateriaisDoAluno(alunoId)
  const [modalAberto, setModalAberto] = useState(false)

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-neutral-900">Materiais</h2>
        <button
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Novo material
        </button>
      </div>

      {isLoading && (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      {materiais && materiais.length === 0 && (
        <div className="mt-4 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="font-bold text-neutral-700">Nenhum material ainda</p>
          <p className="mt-1 text-sm text-neutral-500">
            Guarde aqui o PDF, a foto da página ou o texto que você usa nas aulas de{' '}
            {alunoNome.split(' ')[0]}.
          </p>
        </div>
      )}

      {materiais && materiais.length > 0 && (
        <div className="mt-4 space-y-2">
          {materiais.map((m) => (
            <CartaoMaterial key={m.id} material={m} alunoId={alunoId} />
          ))}
        </div>
      )}

      {modalAberto && <ModalNovoMaterial alunoId={alunoId} aoFechar={() => setModalAberto(false)} />}
    </div>
  )
}

function CartaoMaterial({ material, alunoId }: { material: Material; alunoId: string }) {
  const excluir = useExcluirMaterial(alunoId)
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [textoAberto, setTextoAberto] = useState(false)
  const visual = VISUAL_TIPO[material.tipo]

  async function baixar() {
    if (!material.storage_path) return
    setErro(null)
    setBaixando(true)
    try {
      // URL assinada é gerada na hora do clique, não na renderização da lista:
      // ela expira, e gerar uma por item ao carregar a página desperdiçaria
      // requisições em links que ninguém vai abrir.
      window.open(await urlAssinada(material.storage_path), '_blank', 'noopener')
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
            {material.tipo} · {formatarData(material.criado_em)}
          </p>
        </div>

        {material.texto !== null && (
          <button
            onClick={() => setTextoAberto((v) => !v)}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-neutral-500 hover:bg-neutral-100"
          >
            {textoAberto ? 'ocultar' : 'ver texto'}
          </button>
        )}

        {material.storage_path && (
          <button
            onClick={baixar}
            disabled={baixando}
            title="Abrir arquivo"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
        )}

        <button
          onClick={() => excluir.mutate(material)}
          disabled={excluir.isPending}
          title="Excluir material"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-300 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {erro && <p className="mt-2 text-xs font-medium text-rose-700">{erro}</p>}

      {textoAberto && material.texto && (
        <p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          {material.texto}
        </p>
      )}
    </div>
  )
}

function ModalNovoMaterial({ alunoId, aoFechar }: { alunoId: string; aoFechar: () => void }) {
  const enviar = useEnviarMaterial(alunoId)
  const [modo, setModo] = useState<'arquivo' | 'texto'>('arquivo')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [nome, setNome] = useState('')
  const [texto, setTexto] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  function escolherArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0]
    evento.target.value = ''
    if (!escolhido) return
    setErroLocal(null)

    if (!tipoDoArquivo(escolhido.type)) {
      return setErroLocal('Formato não aceito. Envie PDF, DOCX, imagem ou áudio.')
    }
    if (escolhido.size > TAMANHO_MAX_MATERIAL) {
      return setErroLocal('Arquivo muito grande — o limite é 25 MB.')
    }
    setArquivo(escolhido)
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    await enviar.mutateAsync(
      modo === 'arquivo' ? { tipo: 'arquivo', arquivo: arquivo! } : { tipo: 'texto', nome, texto },
    )
    aoFechar()
  }

  const podeSalvar =
    !enviar.isPending && (modo === 'arquivo' ? Boolean(arquivo) : texto.trim().length > 0)
  const erro = erroLocal ?? (enviar.error as Error | null)?.message

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={salvar}
        className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-extrabold">Novo material</h2>
          <button type="button" onClick={aoFechar} className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex gap-1.5 rounded-full bg-neutral-100 p-1">
          {(['arquivo', 'texto'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`flex-1 rounded-full py-2 text-xs font-bold transition ${
                modo === m ? 'bg-neutral-900 text-white' : 'text-neutral-500'
              }`}
            >
              {m === 'arquivo' ? 'Enviar arquivo' : 'Colar texto'}
            </button>
          ))}
        </div>

        {modo === 'arquivo' ? (
          <div className="mt-4">
            {arquivo ? (
              <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-neutral-900">{arquivo.name}</span>
                  <span className="text-xs font-medium text-emerald-700">
                    {Math.round(arquivo.size / 1024)} KB
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setArquivo(null)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-emerald-700/60 hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-4 py-10 text-center transition hover:border-neutral-400">
                <input type="file" onChange={escolherArquivo} className="hidden" />
                <Upload className="h-5 w-5 text-neutral-400" />
                <span className="text-sm font-bold text-neutral-600">Clique para escolher um arquivo</span>
                <span className="text-xs text-neutral-400">PDF, DOCX, imagem ou áudio · até 25 MB</span>
              </label>
            )}
          </div>
        ) : (
          <>
            <label className="mt-4 block">
              <span className="text-xs font-bold text-neutral-600">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Vocabulário da unidade 7"
                className="mt-1.5 w-full rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm outline-none ring-neutral-900 focus:ring-2"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-bold text-neutral-600">Texto</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={7}
                placeholder="Cole aqui o texto, diálogo ou lista de vocabulário."
                className="mt-1.5 w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2"
              />
            </label>
          </>
        )}

        {erro && (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{erro}</p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="flex-1 rounded-full px-5 py-3 text-sm font-bold text-neutral-500"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!podeSalvar}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-40"
          >
            {enviar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
