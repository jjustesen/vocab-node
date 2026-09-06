import type { ParticipanteId } from './estado-palco'

/**
 * O formato do documento da aula — fonte única para a tela, o banco e o texto
 * congelado. Se este arquivo e a coluna `documentos_aula.blocos` divergirem,
 * este arquivo está certo (mesma regra de `docs/CONTRATO-QUESTOES.md`).
 *
 * ── Por que blocos, e não texto corrido ─────────────────────────────────────
 *
 * Porque é o que resolve a colisão sem trazer CRDT para dentro do projeto.
 * Com um textarea único, duas pessoas digitando ao mesmo tempo brigam por cada
 * caractere e alguém precisa de transformação operacional. Com blocos, elas só
 * colidem se estiverem no MESMO parágrafo — que numa dupla é raro e, quando
 * acontece, é resolvido por uma trava de 3 segundos (ver `Documento.tsx`).
 *
 * Yjs/Automerge fariam melhor, e custariam uma dependência e um servidor de
 * sincronia para atender dois participantes. A conta não fecha aqui.
 */

export type TipoBloco = 'titulo' | 'texto' | 'lista'

export type Bloco = {
  id: string
  tipo: TipoBloco
  texto: string
}

export type MensagemDocumento =
  /**
   * Um bloco nasceu ou mudou. `depoisDe` só é lido quando o bloco é novo — a
   * posição precisa viajar junto, senão um bloco criado no meio do texto
   * apareceria no fim do outro lado.
   */
  | { t: 'bloco'; bloco: Bloco; depoisDe: string | null; autor: ParticipanteId }
  | { t: 'remover'; id: string }
  | { t: 'pedir-estado' }
  | { t: 'estado'; blocos: Bloco[] }

export function blocoNovo(tipo: TipoBloco = 'texto', texto = ''): Bloco {
  return { id: crypto.randomUUID(), tipo, texto }
}

/** Um documento vazio ainda precisa de uma linha para receber o cursor. */
export function documentoInicial(): Bloco[] {
  return [blocoNovo()]
}

/** Aplica um upsert posicionado. Devolve array novo — o React precisa da identidade nova. */
export function aplicarBloco(blocos: Bloco[], bloco: Bloco, depoisDe: string | null): Bloco[] {
  const indice = blocos.findIndex((b) => b.id === bloco.id)
  if (indice !== -1) {
    const copia = blocos.slice()
    copia[indice] = bloco
    return copia
  }
  const alvo = depoisDe === null ? -1 : blocos.findIndex((b) => b.id === depoisDe)
  const copia = blocos.slice()
  // Alvo não encontrado (mensagem fora de ordem) cai no fim em vez de sumir:
  // texto no lugar errado é recuperável, texto que não apareceu não é.
  copia.splice(alvo === -1 ? blocos.length : alvo + 1, 0, bloco)
  return copia
}

/**
 * O documento vira texto — é o que a linha em `materiais` guarda quando o
 * professor congela a aula (RF-50, `tipo = 'texto'`).
 *
 * Markdown leve de propósito: `materiais.texto` já é lido como texto puro pelo
 * aluno e pela geração de atividade, então o marcador tem que ser legível
 * mesmo sem ninguém renderizar.
 */
export function paraTexto(blocos: Bloco[]): string {
  return blocos
    .map((b) => {
      const texto = b.texto.trim()
      if (!texto) return ''
      if (b.tipo === 'titulo') return `## ${texto}`
      if (b.tipo === 'lista') return `- ${texto}`
      return texto
    })
    .filter(Boolean)
    .join('\n\n')
}

/** Documento sem uma letra sequer não vira material nem é salvo. */
export function estaVazio(blocos: Bloco[]): boolean {
  return blocos.every((b) => b.texto.trim() === '')
}

/**
 * `blocos` vem do banco como `unknown` (jsonb). Valida na entrada em vez de
 * confiar: uma linha escrita por uma versão futura do app não pode quebrar a
 * sala de quem ainda está na versão de hoje.
 */
export function lerBlocos(bruto: unknown): Bloco[] {
  if (!Array.isArray(bruto)) return documentoInicial()
  const blocos = bruto.filter(
    (b): b is Bloco =>
      typeof b === 'object' &&
      b !== null &&
      typeof (b as Bloco).id === 'string' &&
      typeof (b as Bloco).texto === 'string' &&
      ['titulo', 'texto', 'lista'].includes((b as Bloco).tipo),
  )
  return blocos.length > 0 ? blocos : documentoInicial()
}
