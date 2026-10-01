import { supabase } from '@/lib/supabase'
import { carregarPdfjs } from '@/lib/arquivo'
import type { Material } from '@/types/db'

/**
 * A miniatura de um material — a primeira página do PDF, a própria foto em
 * tamanho de ícone.
 *
 * ── Onde ela mora ───────────────────────────────────────────────────────────
 *
 * No mesmo bucket, ao lado do original: `${professor}/miniaturas/${id}.jpg`
 * para o arquivo `${professor}/${id}.pdf`. O caminho é DERIVADO do original,
 * e não uma coluna nova, por dois motivos: a policy do bucket (0004) já cobre
 * tudo o que começa com a pasta do professor, e não há migration para aplicar
 * antes de a tela funcionar. A pergunta "essa miniatura existe?" se responde
 * pedindo a URL assinada — o Storage devolve erro por item quando não existe.
 *
 * ── Quando ela nasce ────────────────────────────────────────────────────────
 *
 * No upload, a partir do próprio `File` que já está na memória. Os materiais
 * que subiram antes disto ganham a sua na primeira vez que aparecem numa
 * lista do professor (`garantirMiniatura`) — um de cada vez, sem atrapalhar a
 * tela. Falhar aqui nunca é erro para ninguém: sem miniatura, a linha mostra
 * o ícone do tipo, como sempre mostrou.
 *
 * ── Por que gerar no navegador ──────────────────────────────────────────────
 *
 * O pdf.js já está no app (é ele que desenha o material no palco da sala), e
 * a transformação de imagem do Storage é recurso de plano pago. Uma JPEG de
 * 240px pesa ~10 KB; a lista de cinquenta PDFs carrega menos que UM deles.
 */

/** Lado maior da miniatura. Ela aparece com ~48px; 240 dá nitidez em tela 2x/3x com folga. */
const LADO = 240
const QUALIDADE = 0.8
/** A URL assinada da miniatura vale isto — e a consulta é refeita antes de vencer. */
export const VALIDADE_MINIATURA_S = 3600

export function temMiniatura(material: Pick<Material, 'tipo' | 'storage_path'>): boolean {
  return (material.tipo === 'pdf' || material.tipo === 'imagem') && Boolean(material.storage_path)
}

/** `prof/uuid.pdf` → `prof/miniaturas/uuid.jpg`. */
export function caminhoDaMiniatura(storagePath: string): string {
  const [dono, ...resto] = storagePath.split('/')
  return `${dono}/miniaturas/${resto.join('/').replace(/\.[^./]+$/, '')}.jpg`
}

// ── Gerar ──────────────────────────────────────────────────────────────────

function canvasParaJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não consegui gerar a miniatura.'))),
      'image/jpeg',
      QUALIDADE,
    ),
  )
}

function canvasDoTamanho(largura: number, altura: number) {
  const escala = Math.min(1, LADO / Math.max(largura, altura))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(largura * escala))
  canvas.height = Math.max(1, Math.round(altura * escala))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não consegui gerar a miniatura neste navegador.')
  // PDF e PNG costumam ter fundo transparente; em JPEG isso vira preto.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, ctx, escala }
}

async function miniaturaDePdf(fonte: { data: Uint8Array } | { url: string }): Promise<Blob> {
  const pdfjs = await carregarPdfjs()
  // Sem auto-fetch e sem stream: o pdf.js pede ao Storage só os pedaços que a
  // página 1 precisa (o Storage aceita Range). Um livro de 25 MB não é baixado
  // inteiro para virar um quadradinho de 48px.
  const tarefa = pdfjs.getDocument({ ...fonte, disableAutoFetch: true, disableStream: true })
  try {
    const documento = await tarefa.promise
    const pagina = await documento.getPage(1)
    const original = pagina.getViewport({ scale: 1 })
    const { canvas, ctx, escala } = canvasDoTamanho(original.width, original.height)
    const viewport = pagina.getViewport({ scale: escala })
    // `intent: 'print'`: desenha sem requestAnimationFrame — ver `pdfParaPaginas`.
    await pagina.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise
    return await canvasParaJpeg(canvas)
  } finally {
    await tarefa.destroy()
  }
}

async function miniaturaDeImagem(arquivo: Blob): Promise<Blob> {
  // `createImageBitmap` em vez de `<img>`: lê direto do blob, sem URL de outra
  // origem que "contamine" o canvas e impeça o `toBlob`.
  const bitmap = await createImageBitmap(arquivo)
  try {
    const { canvas, ctx } = canvasDoTamanho(bitmap.width, bitmap.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await canvasParaJpeg(canvas)
  } finally {
    bitmap.close()
  }
}

async function subirMiniatura(storagePath: string, jpeg: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from('materiais')
    .upload(caminhoDaMiniatura(storagePath), jpeg, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
}

/**
 * No upload: o arquivo já está na memória, então a miniatura sai dele mesmo,
 * sem ir buscar nada no Storage. Melhor esforço — quem chama não espera por
 * isto e nem fica sabendo se falhar.
 */
export async function criarMiniaturaDoArquivo(
  storagePath: string,
  tipo: Material['tipo'],
  arquivo: Blob,
): Promise<void> {
  if (tipo !== 'pdf' && tipo !== 'imagem') return
  try {
    const jpeg =
      tipo === 'pdf'
        ? await miniaturaDePdf({ data: new Uint8Array(await arquivo.arrayBuffer()) })
        : await miniaturaDeImagem(arquivo)
    await subirMiniatura(storagePath, jpeg)
  } catch {
    /* sem miniatura, a lista mostra o ícone do tipo */
  }
}

/**
 * Para o material que subiu antes de existir miniatura: busca o original e
 * gera. Um de cada vez (a fila abaixo) — numa lista de cinquenta PDFs antigos,
 * cinquenta pdf.js simultâneos travariam a tela que só queria mostrar ícones.
 *
 * Cada caminho é tentado UMA vez por carregamento da página: um arquivo
 * corrompido não pode virar um laço de tentativas a cada render.
 */
const tentados = new Set<string>()
let fila: Promise<unknown> = Promise.resolve()

export function garantirMiniatura(material: Pick<Material, 'tipo' | 'storage_path'>): Promise<boolean> {
  const caminho = material.storage_path
  if (!caminho || !temMiniatura(material) || tentados.has(caminho)) return Promise.resolve(false)
  tentados.add(caminho)

  const vez = fila.then(async () => {
    try {
      const { data, error } = await supabase.storage.from('materiais').createSignedUrl(caminho, 600)
      if (error) throw error
      const jpeg =
        material.tipo === 'pdf'
          ? await miniaturaDePdf({ url: data.signedUrl })
          : await miniaturaDeImagem(await (await fetch(data.signedUrl)).blob())
      await subirMiniatura(caminho, jpeg)
      return true
    } catch {
      return false
    }
  })
  fila = vez
  return vez
}

// ── Assinar ─────────────────────────────────────────────────────────────────

/**
 * Pede as URLs assinadas EM LOTE, mesmo com cada linha pedindo a sua.
 *
 * Cada miniatura é um componente independente (a mesma peça aparece no
 * acervo, na ficha do aluno e na turma), e cada um quer a própria URL. Sem
 * juntar, uma lista de cinquenta seriam cinquenta idas ao Storage; com o
 * lote, os pedidos do mesmo render saem numa chamada só (`createSignedUrls`).
 */
let pendentes = new Map<string, ((url: string | null) => void)[]>()
let agendado = false

async function despachar() {
  agendado = false
  const lote = pendentes
  pendentes = new Map()
  const caminhos = [...lote.keys()]
  try {
    const { data, error } = await supabase.storage
      .from('materiais')
      .createSignedUrls(caminhos, VALIDADE_MINIATURA_S)
    if (error) throw error
    const porCaminho = new Map(data.map((item) => [item.path, item.error ? null : item.signedUrl]))
    for (const [caminho, resolvers] of lote) {
      const url = porCaminho.get(caminho) ?? null
      for (const resolver of resolvers) resolver(url)
    }
  } catch {
    for (const resolvers of lote.values()) for (const resolver of resolvers) resolver(null)
  }
}

/** URL assinada da miniatura, ou `null` se ela ainda não existe. */
export function urlDaMiniatura(storagePath: string): Promise<string | null> {
  const caminho = caminhoDaMiniatura(storagePath)
  return new Promise((resolve) => {
    pendentes.set(caminho, [...(pendentes.get(caminho) ?? []), resolve])
    if (!agendado) {
      agendado = true
      setTimeout(() => void despachar(), 0)
    }
  })
}

/** Ao apagar o material, a miniatura vai junto — ninguém mais vai pedi-la. */
export function caminhosParaApagar(storagePaths: string[]): string[] {
  return storagePaths.flatMap((p) => [p, caminhoDaMiniatura(p)])
}
