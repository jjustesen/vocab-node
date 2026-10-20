import type { MaterialGeracao, PaginaMaterial } from './tipos.ts'

/**
 * O material que o professor manda para a IA (texto, foto, PDF ou páginas do
 * PDF já rasterizadas), conferido antes de gastar uma chamada. Usado por
 * gerar-atividade e por tutor-gerar-licao.
 */

const MATERIAL_MIN_CARACTERES = 20
const IMAGEM_MAX_BYTES = 8 * 1024 * 1024
const PDF_MAX_BYTES = 15 * 1024 * 1024
/** Mesmo teto do front (app/src/lib/arquivo.ts) — quem chamar a função direto cai aqui. */
const PAGINAS_MAX = 20
const PAGINAS_MAX_BYTES_TOTAL = 15 * 1024 * 1024

/** Tamanho decodificado a partir do comprimento base64 — não vale a pena decodificar só pra medir. */
function bytesDeBase64(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}

export function validarMaterial(bruto: unknown): MaterialGeracao | { erro: string } {
  if (typeof bruto !== 'object' || bruto === null) return { erro: 'Material ausente.' }
  const m = bruto as { tipo?: unknown; conteudo?: unknown; mimeType?: unknown }

  if (m.tipo === 'texto') {
    const conteudo = typeof m.conteudo === 'string' ? m.conteudo.trim() : ''
    if (conteudo.length < MATERIAL_MIN_CARACTERES) {
      return { erro: 'Cole o material da aula — precisa de mais texto para gerar algo bom.' }
    }
    return { tipo: 'texto', conteudo }
  }

  // Reenvio do front depois de o Gemini falhar com PDF: as páginas já vêm
  // rasterizadas em JPEG, uma imagem por página.
  if (m.tipo === 'paginas') {
    const paginas = Array.isArray((bruto as { paginas?: unknown }).paginas)
      ? ((bruto as { paginas: unknown[] }).paginas as { conteudo?: unknown; mimeType?: unknown }[])
      : []
    if (paginas.length === 0) return { erro: 'Nenhuma página recebida.' }
    if (paginas.length > PAGINAS_MAX) return { erro: `Envie no máximo ${PAGINAS_MAX} páginas.` }

    let total = 0
    const validadas: PaginaMaterial[] = []
    for (const p of paginas) {
      const conteudo = typeof p.conteudo === 'string' ? p.conteudo : ''
      const mimeType = typeof p.mimeType === 'string' ? p.mimeType : ''
      if (!conteudo || !mimeType.startsWith('image/')) return { erro: 'Página inválida.' }
      total += bytesDeBase64(conteudo)
      validadas.push({ conteudo, mimeType })
    }
    if (total > PAGINAS_MAX_BYTES_TOTAL) return { erro: 'Material muito grande — envie menos páginas.' }

    return { tipo: 'paginas', paginas: validadas }
  }

  if (m.tipo === 'imagem' || m.tipo === 'pdf') {
    const conteudo = typeof m.conteudo === 'string' ? m.conteudo : ''
    const mimeType = typeof m.mimeType === 'string' ? m.mimeType : ''
    if (!conteudo) return { erro: 'Arquivo vazio ou não enviado corretamente.' }

    if (m.tipo === 'imagem') {
      if (!mimeType.startsWith('image/')) return { erro: 'Tipo de imagem inválido.' }
      if (bytesDeBase64(conteudo) > IMAGEM_MAX_BYTES) return { erro: 'Foto muito grande — envie uma imagem menor.' }
    } else {
      if (mimeType !== 'application/pdf') return { erro: 'Tipo de arquivo inválido — envie um PDF.' }
      if (bytesDeBase64(conteudo) > PDF_MAX_BYTES) return { erro: 'PDF muito grande — envie um arquivo menor.' }
    }

    return { tipo: m.tipo, conteudo, mimeType }
  }

  return { erro: 'Tipo de material inválido.' }
}

