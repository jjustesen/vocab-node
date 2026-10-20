import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Image as ImageIcon, Loader2, Sparkles, Type, Upload } from 'lucide-react'
import { imagemParaMaterial, pdfParaMaterial } from '@/lib/arquivo'
import type { NivelCefr } from '@/types/db'
import { type MaterialDaLicao, useGerarLicao } from './api'

const NIVEIS: NivelCefr[] = ['A1', 'A2', 'B1', 'B2', 'C1']
const TAMANHO_MAX_PDF = 15 * 1024 * 1024
/** A foto ainda é reduzida no canvas (imagemParaMaterial): aqui só se barra o absurdo. */
const TAMANHO_MAX_IMAGEM = 32 * 1024 * 1024

type Arquivo = Extract<MaterialDaLicao, { tipo: 'imagem' | 'pdf' }> & { nome: string }

/**
 * /tutor/licoes/nova — o professor manda a página de drillings (foto, PDF ou
 * texto) e a IA monta a lição: os blocos, as frases, as respostas, as dicas,
 * os erros comuns, a conversa e as regras para a IA. Ela nasce em rascunho e
 * abre no editor, para o professor revisar antes de publicar.
 */
export function NovaLicaoPage() {
  const navegar = useNavigate()
  const gerar = useGerarLicao()
  const [modo, setModo] = useState<'arquivo' | 'texto'>('arquivo')
  const [arquivo, setArquivo] = useState<Arquivo | null>(null)
  const [texto, setTexto] = useState('')
  const [nivel, setNivel] = useState<NivelCefr>('A1')
  const [titulo, setTitulo] = useState('')
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  async function aoEscolherArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0]
    evento.target.value = ''
    if (!escolhido) return
    setErroArquivo(null)
    setArquivo(null)
    const ehPdf = escolhido.type === 'application/pdf'
    const ehImagem = escolhido.type.startsWith('image/')
    if (!ehPdf && !ehImagem) return setErroArquivo('Envie um PDF ou uma foto (JPG/PNG).')
    if (ehPdf && escolhido.size > TAMANHO_MAX_PDF) return setErroArquivo('PDF muito grande — envie um arquivo de até 15 MB.')
    if (ehImagem && escolhido.size > TAMANHO_MAX_IMAGEM) return setErroArquivo('Imagem muito grande.')
    setProcessando(true)
    try {
      const material = ehPdf ? await pdfParaMaterial(escolhido) : await imagemParaMaterial(escolhido)
      setArquivo({ tipo: ehPdf ? 'pdf' : 'imagem', ...material, nome: escolhido.name })
    } catch (e) {
      setErroArquivo(e instanceof Error ? e.message : 'Não consegui ler este arquivo.')
    } finally {
      setProcessando(false)
    }
  }

  const material: MaterialDaLicao | null =
    modo === 'texto'
      ? texto.trim().length >= 20
        ? { tipo: 'texto', conteudo: texto.trim() }
        : null
      : arquivo && { tipo: arquivo.tipo, conteudo: arquivo.conteudo, mimeType: arquivo.mimeType }

  async function aoGerar(e: React.FormEvent) {
    e.preventDefault()
    if (!material) return
    const id = await gerar.mutateAsync({ material, nivel, titulo: titulo.trim() || undefined }).catch(() => null)
    if (id) navegar(`/tutor/licoes/${id}`)
  }

  return (
    <form onSubmit={(e) => void aoGerar(e)} className="mx-auto max-w-2xl">
      <Link to="/tutor" className="inline-flex items-center gap-1 text-sm font-bold text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" /> Lições
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold">Nova lição com IA</h1>
      <p className="mt-0.5 text-sm text-neutral-500">
        Mande a página de drillings da aula. A IA monta a lição do tutor e ela abre no editor, em rascunho, para você revisar.
      </p>

      <div className="mt-6 rounded-3xl bg-white p-5">
        <div role="tablist" aria-label="Como mandar o material" className="flex gap-1.5">
          {(
            [
              ['arquivo', 'Foto ou PDF', ImageIcon],
              ['texto', 'Colar texto', Type],
            ] as const
          ).map(([id, rotulo, Icone]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={modo === id}
              onClick={() => setModo(id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
                modo === id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Icone className="h-4 w-4" />
              {rotulo}
            </button>
          ))}
        </div>

        {modo === 'arquivo' ? (
          <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center hover:border-violet-400">
            <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => void aoEscolherArquivo(e)} />
            {processando ? (
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            ) : arquivo ? (
              <>
                {arquivo.tipo === 'pdf' ? <FileText className="h-6 w-6 text-violet-600" /> : <ImageIcon className="h-6 w-6 text-violet-600" />}
                <span className="text-sm font-bold">{arquivo.nome}</span>
                <span className="text-xs text-neutral-500">Toque para trocar</span>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-neutral-400" />
                <span className="text-sm font-bold">Escolher foto ou PDF</span>
                <span className="text-xs text-neutral-500">A página inteira, legível. Inglês em negrito vira frase-modelo.</span>
              </>
            )}
          </label>
        ) : (
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={10}
            placeholder={'Verbs practice\n1. Falar / Eu falo / Você fala\n2. I speak English. / Eu falo inglês / alemão / italiano\n\nChange into negative\n1. I eat bread and butter.'}
            className="mt-4 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-violet-400"
          />
        )}
        {erroArquivo && <p className="mt-2 text-sm font-medium text-rose-700">{erroArquivo}</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
          <label className="text-xs font-bold text-neutral-600">
            Nível
            <select
              value={nivel}
              onChange={(e) => setNivel(e.target.value as NivelCefr)}
              className="mt-1 block rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-normal"
            >
              {NIVEIS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="mt-1 block max-w-[14rem] text-[11px] font-normal text-neutral-400">
              A IA ajusta a esse nível as frases que ela cria (conversa, revisão, dicas).
            </span>
          </label>
          <label className="text-xs font-bold text-neutral-600">
            Título (opcional)
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Lesson 10 · Viagens"
              className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-normal"
            />
            <span className="mt-1 block text-[11px] font-normal text-neutral-400">Sem título, a IA dá um pelo tema da página. Dá para mudar depois.</span>
          </label>
        </div>
      </div>

      {gerar.isError && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{gerar.error.message}</p>
      )}

      <button
        type="submit"
        disabled={!material || gerar.isPending || processando}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {gerar.isPending ? 'Montando a lição… (até 2 minutos)' : 'Gerar a lição'}
      </button>
    </form>
  )
}
