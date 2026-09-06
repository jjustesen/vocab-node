import { FileText, Headphones, Image as ImageIcon, Type } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MaterialTipo } from '@/types/db'

/** Ícone, cor e rótulo de cada tipo de material — uma fonte para todas as telas. */
export const VISUAL_TIPO: Record<MaterialTipo, { Icone: LucideIcon; cor: string; rotulo: string }> = {
  pdf: { Icone: FileText, cor: 'bg-rose-100 text-rose-700', rotulo: 'PDF' },
  docx: { Icone: FileText, cor: 'bg-sky-100 text-sky-700', rotulo: 'DOCX' },
  imagem: { Icone: ImageIcon, cor: 'bg-violet-100 text-violet-700', rotulo: 'Imagem' },
  audio: { Icone: Headphones, cor: 'bg-amber-100 text-amber-700', rotulo: 'Áudio' },
  texto: { Icone: Type, cor: 'bg-neutral-100 text-neutral-600', rotulo: 'Texto' },
}
