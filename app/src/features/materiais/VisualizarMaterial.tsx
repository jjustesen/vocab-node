import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink, Eye, Loader2, X } from 'lucide-react'
import type { Material, MaterialTipo } from '@/types/db'
import { baixarComoTxt } from '@/lib/baixar-texto'
import { urlAssinada } from './api'
import { VISUAL_TIPO } from './visual'

/**
 * O que abre dentro do app. DOCX fica de fora: o navegador não desenha Word,
 * e renderizar exigiria uma biblioteca de conversão pesada para um formato
 * que o professor normalmente só repassa. Ali o botão fica desligado, com o
 * motivo à vista, e o download continua ao lado.
 */
const VISUALIZAVEL: Record<MaterialTipo, boolean> = {
  pdf: true,
  imagem: true,
  texto: true,
  audio: true,
  docx: false,
}

/** O botão "Ver" da linha do acervo — desligado, com o motivo, onde não há visualização. */
export function BotaoVisualizar({ material, aoAbrir }: { material: Material; aoAbrir: () => void }) {
  const pode = VISUALIZAVEL[material.tipo]
  const titulo = pode
    ? 'Visualizar'
    : `Visualizar ${VISUAL_TIPO[material.tipo].rotulo} ainda não é suportado — use o download`
  return (
    // O `title` mora no invólucro: botão `disabled` não recebe o hover em todo
    // navegador, e o tooltip é justamente a explicação de por que está desligado.
    <span title={titulo} className="inline-flex">
      <button
        onClick={aoAbrir}
        disabled={!pode}
        aria-label={titulo}
        className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
      >
        <Eye className="h-4 w-4" />
      </button>
    </span>
  )
}

/**
 * O arquivo aberto por cima do acervo, sem sair da página.
 *
 * A URL assinada vale 1h e é pedida só quando o modal abre — gerar uma para
 * cada linha da lista seria dezenas de chamadas para arquivos que ninguém vai
 * abrir.
 */
export function VisualizarMaterial({ material, aoFechar }: { material: Material; aoFechar: () => void }) {
  const comArquivo = material.tipo !== 'texto' && Boolean(material.storage_path)
  const { data: url, isLoading, error } = useQuery({
    queryKey: ['materiais', 'url', material.storage_path],
    enabled: comArquivo,
    staleTime: 50 * 60 * 1000, // antes de a assinatura de 1h vencer
    queryFn: () => urlAssinada(material.storage_path!),
  })

  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [aoFechar])

  const { Icone, cor } = VISUAL_TIPO[material.tipo]

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-3 sm:p-6"
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={material.nome}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white"
      >
        <header className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${cor}`}>
            <Icone className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-neutral-900">{material.nome}</p>
          {url && (
            <>
              {/* Nova aba: o leitor de PDF do celular às vezes não desenha
                  dentro de um quadro, e ali ele abre em tela cheia. */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir em nova aba"
                className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              {/* `download` do <a> não vale para outra origem; o Storage
                  entende o parâmetro e manda o arquivo como anexo. */}
              <a
                href={`${url}&download=${encodeURIComponent(material.nome)}`}
                title="Baixar"
                className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100"
              >
                <Download className="h-4 w-4" />
              </a>
            </>
          )}
          {material.tipo === 'texto' && (
            <button
              onClick={() => baixarComoTxt(material.nome, material.texto ?? '')}
              title="Baixar como .txt"
              aria-label="Baixar como .txt"
              className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            title="Fechar"
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 bg-neutral-100">
          {material.tipo === 'texto' ? (
            <div className="h-full overflow-y-auto bg-white p-5 sm:p-8">
              <p className="mx-auto max-w-3xl text-sm leading-relaxed whitespace-pre-wrap text-neutral-800">
                {material.texto || 'Este texto está vazio.'}
              </p>
            </div>
          ) : isLoading ? (
            <div className="grid h-full place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : error || !url ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <p className="text-sm text-neutral-500">Não consegui abrir o arquivo. Tente de novo em instantes.</p>
            </div>
          ) : material.tipo === 'pdf' ? (
            <iframe src={url} title={material.nome} className="h-full w-full border-0 bg-white" />
          ) : material.tipo === 'imagem' ? (
            <div className="grid h-full place-items-center p-4">
              <img src={url} alt={material.nome} className="max-h-full max-w-full rounded-xl object-contain" />
            </div>
          ) : material.tipo === 'audio' ? (
            <div className="grid h-full place-items-center p-6">
              <audio src={url} controls autoPlay={false} className="w-full max-w-lg" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
