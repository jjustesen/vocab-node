// `?url` resolve para uma string no build — não puxa o worker para o bundle.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const LADO_MAXIMO_IMAGEM = 1500 // docs/PROMPT-GERACAO.md §4 — acima disso o custo sobe sem ganho de leitura
const QUALIDADE_JPEG = 0.85
/** Teto de páginas rasterizadas — igual ao `PAGINAS_MAX` da Edge Function. */
export const PAGINAS_MAX = 20

/**
 * pdf.js pesa ~500kB e só é usado no fallback (ver `pdfParaPaginas`) — carrega
 * sob demanda, para não entrar no bundle que todo professor baixa.
 */
async function carregarPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

export type MaterialArquivo = { conteudo: string; mimeType: string }
export type PaginaMaterial = { conteudo: string; mimeType: string }

/** Base64 puro (sem o prefixo `data:...;base64,`) do resultado de `readAsDataURL`. */
function base64DoDataUrl(dataUrl: string): string {
  const virgula = dataUrl.indexOf(',')
  return virgula === -1 ? dataUrl : dataUrl.slice(virgula + 1)
}

/** Base64 (sem prefixo) → bytes, para subir no Storage (que não aceita string). */
export function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(leitor.result as string)
    leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'))
    leitor.readAsDataURL(arquivo)
  })
}

/** PDF vai direto — o Gemini lê nativamente, sem precisar reduzir. */
export async function pdfParaMaterial(arquivo: File): Promise<MaterialArquivo> {
  const dataUrl = await lerComoDataUrl(arquivo)
  return { conteudo: base64DoDataUrl(dataUrl), mimeType: 'application/pdf' }
}

/**
 * Rasteriza o PDF em uma imagem por página, no navegador. Só roda no reenvio
 * depois de o Gemini falhar: o provedor de fallback (xAI) não lê PDF, e ler a
 * camada de texto nativa do PDF é mais preciso e mais barato — por isso o
 * caminho feliz continua mandando o arquivo original.
 *
 * Mesma régua de tamanho da foto de celular: lado maior em
 * `LADO_MAXIMO_IMAGEM`, JPEG. Um livro inteiro não cabe num request, então
 * para nas `PAGINAS_MAX` primeiras — quem passa disso recebe o aviso em
 * `paginasIgnoradas`.
 */
export async function pdfParaPaginas(
  base64Pdf: string,
  maximo = PAGINAS_MAX,
): Promise<{ paginas: PaginaMaterial[]; paginasIgnoradas: number }> {
  const pdfjs = await carregarPdfjs()
  const tarefa = pdfjs.getDocument({ data: base64ParaBytes(base64Pdf) })
  const documento = await tarefa.promise

  try {
    const total = documento.numPages
    const quantidade = Math.min(total, maximo)
    const paginas: PaginaMaterial[] = []

    for (let numero = 1; numero <= quantidade; numero++) {
      const pagina = await documento.getPage(numero)
      const original = pagina.getViewport({ scale: 1 })
      const escala = Math.min(1.5, LADO_MAXIMO_IMAGEM / Math.max(original.width, original.height))
      const viewport = pagina.getViewport({ scale: escala })

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Não consegui processar o PDF neste navegador.')

      // Página de livro tem fundo transparente no PDF; sem isso o JPEG sai preto.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // `intent: 'print'` não é sobre imprimir: é o único jeito de o pdf.js
      // desenhar sem requestAnimationFrame. Com o intent padrão, o professor
      // que troca de aba enquanto a atividade gera trava a conversão — o
      // navegador congela o rAF de aba em segundo plano.
      await pagina.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise
      paginas.push({ conteudo: base64DoDataUrl(canvas.toDataURL('image/jpeg', QUALIDADE_JPEG)), mimeType: 'image/jpeg' })
      pagina.cleanup()
    }

    return { paginas, paginasIgnoradas: total - quantidade }
  } finally {
    await tarefa.destroy() // libera o worker; sem isso um livro grande segura memória
  }
}

/**
 * Foto de celular costuma vir em 3000-4000px — reduz para no máximo
 * `LADO_MAXIMO_IMAGEM` no lado maior e reencoda em JPEG antes de mandar pro
 * servidor, que é quem chama a IA. Ganho: request menor, custo menor, sem
 * perda perceptível de leitura pro modelo.
 */
export function imagemParaMaterial(arquivo: File): Promise<MaterialArquivo> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(arquivo)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const escala = Math.min(1, LADO_MAXIMO_IMAGEM / Math.max(img.width, img.height))
      const largura = Math.round(img.width * escala)
      const altura = Math.round(img.height * escala)

      const canvas = document.createElement('canvas')
      canvas.width = largura
      canvas.height = altura
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Não consegui processar a imagem neste navegador.'))
      ctx.drawImage(img, 0, 0, largura, altura)

      const dataUrl = canvas.toDataURL('image/jpeg', QUALIDADE_JPEG)
      resolve({ conteudo: base64DoDataUrl(dataUrl), mimeType: 'image/jpeg' })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não consegui abrir esta imagem.'))
    }
    img.src = url
  })
}
