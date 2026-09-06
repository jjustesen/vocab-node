import type { ParticipanteId } from './estado-palco'

/**
 * O que se pode deixar por cima do palco: traço e texto.
 *
 * ── O quadro lógico ─────────────────────────────────────────────────────────
 *
 * Nada aqui viaja em pixels. Tudo é medido num quadro NORMALIZADO de 1000x1000
 * sobre a caixa do conteúdo, com os eixos escalando independentes — o
 * professor está no notebook e o aluno no celular, e um pixel não quer dizer a
 * mesma coisa nos dois. O que garante que o mesmo par (x, y) cai no mesmo
 * ponto é as duas pontas desenharem a caixa com a proporção do MESMO conteúdo
 * (ver `Palco.tsx`).
 *
 * Vale também para o tamanho da letra: `tamanho` é milésimo da ALTURA da
 * caixa, não `px`. Um texto de 32 ocupa 3,2% da altura em qualquer tela — se
 * fosse px, a anotação que cabe na linha do exercício no notebook cobriria
 * meia folha no celular.
 *
 * ── A anotação pertence à página ────────────────────────────────────────────
 *
 * Toda anotação carrega a `superficie` em que nasceu, e num PDF a superfície
 * inclui o NÚMERO DA PÁGINA (ver `superficieDo`). Virar a página troca de
 * superfície: o que foi escrito na página 3 não vaza para a 4 e volta inteiro
 * quando a 3 voltar. É o que faz o material virar apostila da dupla em vez de
 * um fundo qualquer.
 */

/** Quadro lógico normalizado. Os eixos escalam separados — ver o cabeçalho. */
export const NORMA = 1000

export const CORES = ['#171717', '#7c3aed', '#dc2626', '#059669'] as const
/** Espessuras da caneta, em milésimos da largura. */
export const ESPESSURAS = [3, 8] as const
/** Tamanhos de letra, em milésimos da altura. */
export const TAMANHOS = [32, 52] as const

/**
 * Formas fechadas — retângulo, círculo e seta.
 *
 * Existem pelo mesmo motivo que o texto existe: a mão livre no trackpad não
 * sustenta o gesto. Circular a alternativa certa, ligar duas colunas, apontar
 * para a palavra que faltou — são três gestos que a aula pede o tempo todo e
 * que saem tortos à mão. Cada uma é definida por DOIS pontos (onde o arrasto
 * começou e onde terminou), o que as torna baratas de sincronizar: a forma
 * inteira cabe numa mensagem.
 */
export type FormaTipo = 'retangulo' | 'circulo' | 'seta'

export type Ferramenta = 'caneta' | 'texto' | 'borracha' | FormaTipo

/** As três formas seguem o mesmo caminho de desenho; só o traçado final muda. */
export const FORMAS: FormaTipo[] = ['retangulo', 'circulo', 'seta']

export function ehForma(f: Ferramenta): f is FormaTipo {
  return (FORMAS as string[]).includes(f)
}

export type Ponto = [number, number]

type Comum = {
  id: string
  /**
   * QUEM deixou esta anotação — identidade, não papel. "Apagar o que eu fiz"
   * numa turma tem que distinguir três alunos, e não só "o aluno".
   */
  autor: ParticipanteId
  superficie: string
  cor: string
}

export type Traco = Comum & { tipo: 'traco'; espessura: number; pontos: Ponto[] }
export type Texto = Comum & { tipo: 'texto'; tamanho: number; x: number; y: number; texto: string }
export type Forma = Comum & { tipo: 'forma'; forma: FormaTipo; espessura: number; de: Ponto; ate: Ponto }
export type Anotacao = Traco | Texto | Forma

export type MensagemAnotacao =
  /**
   * Pontos NOVOS de um traço, em lotes — o traço aparece do outro lado
   * enquanto ainda está sendo feito. Manda só o que falta, e não o traço
   * inteiro a cada lote.
   */
  | { t: 'pontos'; traco: Omit<Traco, 'pontos'>; pontos: Ponto[] }
  /** Texto criado, editado ou arrastado. Substitui a versão anterior inteira. */
  | { t: 'texto'; texto: Texto }
  /**
   * Forma sendo arrastada, ou já solta. Vai INTEIRA a cada lote, em vez de
   * incremental como o traço: são dois pontos, e mandar o objeto completo
   * dispensa reconciliar estado parcial do outro lado.
   */
  | { t: 'forma'; forma: Forma }
  | { t: 'remover'; id: string }
  /** Apaga só a camada de quem pediu, e só na superfície que ele estava vendo. */
  | { t: 'limpar'; autor: ParticipanteId; superficie: string }
  | { t: 'pedir-estado' }
  | { t: 'estado'; anotacoes: Anotacao[] }

export function formaNova(
  autor: ParticipanteId,
  superficie: string,
  cor: string,
  espessura: number,
  forma: FormaTipo,
  em: Ponto,
): Forma {
  return { tipo: 'forma', id: crypto.randomUUID(), autor, superficie, cor, espessura, forma, de: em, ate: em }
}

export function textoNovo(
  autor: ParticipanteId,
  superficie: string,
  cor: string,
  tamanho: number,
  x: number,
  y: number,
): Texto {
  return { tipo: 'texto', id: crypto.randomUUID(), autor, superficie, cor, tamanho, x, y, texto: '' }
}

/**
 * O texto ancora pelo canto superior esquerdo, então perto da borda direita
 * ele quebraria linha numa coluna de dois caracteres. Limitar a largura ao que
 * sobra até a borda é o que mantém a quebra igual nas duas pontas — largura em
 * `ch` ou `auto` dependeria da fonte de cada navegador.
 */
export function larguraMaxima(x: number): number {
  return Math.max(NORMA * 0.15, NORMA - x)
}

/** Texto sem uma letra sequer não vira anotação — some ao sair da edição. */
export function textoVazio(anotacao: Anotacao): boolean {
  return anotacao.tipo === 'texto' && anotacao.texto.trim() === ''
}

/**
 * ── A borracha ──────────────────────────────────────────────────────────────
 *
 * Apaga UMA anotação por vez, a que estiver sob o ponteiro — passar por cima
 * de uma seta apaga aquela seta, e não a página. O "limpar tudo" continua
 * existindo, com ícone próprio, porque são gestos de risco diferente: apagar
 * um item é visível e reversível pelo desfazer; varrer a página não.
 *
 * O acerto é medido em PIXEL, não em coordenada lógica. Os eixos do quadro
 * lógico escalam separados, então "12 unidades de distância" seria uma
 * vizinhança oval numa folha em pé — a borracha pegaria longe na horizontal e
 * perto na vertical. Em pixel, a área de acerto é a mesma bolinha em volta do
 * cursor em qualquer material.
 */

/** Raio de acerto da borracha, em pixels de tela. */
export const RAIO_BORRACHA = 14

function distanciaAteSegmento(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const comprimento = dx * dx + dy * dy
  // Segmento degenerado (os dois pontos no mesmo lugar) vira distância ao ponto.
  const t = comprimento === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / comprimento))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * O ponteiro (em pixel do canvas) encosta nesta anotação?
 *
 * Só traço e forma: texto é elemento do DOM e tem retângulo próprio, então
 * quem pergunta por ele usa `getBoundingClientRect` — mais exato que qualquer
 * caixa que a gente estimasse aqui.
 */
export function encostou(
  anotacao: Traco | Forma,
  px: number,
  py: number,
  escalaX: number,
  escalaY: number,
): boolean {
  // A tolerância cresce com o traço: uma linha grossa tem que ser pegável pela
  // largura dela, não pelo eixo geométrico invisível no meio.
  const folga = RAIO_BORRACHA + (anotacao.espessura * escalaX) / 2

  if (anotacao.tipo === 'traco') {
    const p = anotacao.pontos
    if (p.length === 1) return Math.hypot(px - p[0][0] * escalaX, py - p[0][1] * escalaY) <= folga
    for (let i = 1; i < p.length; i++) {
      const d = distanciaAteSegmento(
        px, py,
        p[i - 1][0] * escalaX, p[i - 1][1] * escalaY,
        p[i][0] * escalaX, p[i][1] * escalaY,
      )
      if (d <= folga) return true
    }
    return false
  }

  const x1 = anotacao.de[0] * escalaX
  const y1 = anotacao.de[1] * escalaY
  const x2 = anotacao.ate[0] * escalaX
  const y2 = anotacao.ate[1] * escalaY

  if (anotacao.forma === 'seta') return distanciaAteSegmento(px, py, x1, y1, x2, y2) <= folga

  if (anotacao.forma === 'retangulo') {
    // As quatro arestas, e não a área: o retângulo é vazado, e apagar ao tocar
    // no meio dele levaria junto a forma quando a pessoa mirava no que está
    // DENTRO dela.
    const [ex, dx2] = [Math.min(x1, x2), Math.max(x1, x2)]
    const [ty, by] = [Math.min(y1, y2), Math.max(y1, y2)]
    return (
      distanciaAteSegmento(px, py, ex, ty, dx2, ty) <= folga ||
      distanciaAteSegmento(px, py, dx2, ty, dx2, by) <= folga ||
      distanciaAteSegmento(px, py, dx2, by, ex, by) <= folga ||
      distanciaAteSegmento(px, py, ex, by, ex, ty) <= folga
    )
  }

  // Elipse: amostra o contorno e mede a menor distância. Resolver a distância
  // exata ponto-elipse é iterativo e não paga — a diferença some dentro da
  // folga da borracha.
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const rx = Math.abs(x2 - x1) / 2
  const ry = Math.abs(y2 - y1) / 2
  const AMOSTRAS = 64
  for (let i = 0; i < AMOSTRAS; i++) {
    const a = (i / AMOSTRAS) * Math.PI * 2
    if (Math.hypot(px - (cx + rx * Math.cos(a)), py - (cy + ry * Math.sin(a))) <= folga) return true
  }
  return false
}
