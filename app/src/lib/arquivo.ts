const LADO_MAXIMO_IMAGEM = 1500 // docs/PROMPT-GERACAO.md §4 — acima disso o custo sobe sem ganho de leitura
const QUALIDADE_JPEG = 0.85

export type MaterialArquivo = { conteudo: string; mimeType: string }

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
