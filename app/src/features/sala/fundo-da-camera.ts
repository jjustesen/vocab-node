import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import type { LocalVideoTrack } from 'livekit-client'
import type { BackgroundProcessorWrapper } from '@livekit/track-processors'

/**
 * O fundo da câmera — desfoque ou imagem no lugar do quarto. Opcional, de
 * cada participante.
 *
 * ── Onde isso acontece ──────────────────────────────────────────────────────
 *
 * No navegador de quem liga, ANTES de o vídeo sair. A segmentação (MediaPipe,
 * via `@livekit/track-processors`) separa a pessoa do fundo quadro a quadro e
 * troca só o fundo; o que vai para o LiveKit já é o vídeo tratado. O outro
 * lado não faz nada e não precisa de nada — é por isso que professor e aluno
 * podem ligar independentemente, e é por isso que quem está num navegador sem
 * suporte continua vendo o fundo tratado dos outros normalmente.
 *
 * ── O que dá para ajustar, e o que não dá ───────────────────────────────────
 *
 * O pacote expõe DUAS coisas: a força do borrão (`blurRadius`) e a imagem que
 * substitui o fundo. A qualidade do RECORTE — a borda do cabelo, o halo em
 * volta do ombro — é do modelo de segmentação e não tem botão: o suavizado da
 * borda está fixo no shader do pacote, e o modelo multiclasse do MediaPipe
 * (que recorta melhor) não serve aqui porque o pacote lê a máscara como
 * "pessoa ou não" e as categorias dele cairiam todas em "não".
 *
 * Na prática, quem acha o desfoque "ruim" costuma estar vendo o quarto
 * borrado atrás de uma borda imperfeita. A imagem resolve isso melhor que
 * qualquer ajuste de borrão: com o fundo trocado por uma parede lisa, a
 * imperfeição da borda deixa de ter um quarto para revelar.
 *
 * ── Onde funciona ───────────────────────────────────────────────────────────
 *
 * Depende de APIs de vídeo do navegador (`VideoFrame`, WebGL2, e a via rápida
 * `MediaStreamTrackProcessor` ou a lenta por canvas). Chrome e Edge têm tudo;
 * Safari e Firefox recentes têm a via lenta; versões antigas não têm nada.
 * Onde falta, a opção não aparece: oferecer um controle que falha em silêncio
 * é pior que não oferecer. A checagem testa as APIs, nunca o nome do
 * navegador — é o mesmo teste que o pacote faz, copiado aqui para não custar
 * o pacote inteiro só para perguntar.
 *
 * ── Carregado só quando alguém liga ─────────────────────────────────────────
 *
 * O pacote arrasta o MediaPipe: ~180 KB no bundle. Importado estaticamente
 * ele entraria no chunk de TODO MUNDO — o aluno abrindo uma tarefa no celular
 * pagaria pelo fundo de uma sala em que nunca entrou. O `import()` dinâmico
 * abaixo deixa isso para a primeira escolha, que é o único momento em que o
 * código é necessário.
 *
 * ── Custo ───────────────────────────────────────────────────────────────────
 *
 * O modelo (~250 KB) e o WASM do MediaPipe vêm de CDN na primeira vez, e a
 * segmentação gasta CPU/GPU durante a chamada inteira. Num notebook fraco ou
 * no celular isso pode virar quadro perdido — e a ferramenta é de quem escolhe
 * pagar esse preço, não um padrão. Por isso começa em "nenhum" e a escolha é
 * lembrada por navegador.
 */

const CHAVE = 'vocab-node:fundo-da-camera'

/**
 * As forças do borrão. Os raios são os do próprio LiveKit em torno do padrão
 * (10): abaixo de 5 o quarto continua legível; acima de 20 a borda do cabelo
 * começa a "sangrar" para o fundo em câmera fraca.
 */
export const FORCAS = {
  leve: 5,
  media: 10,
  forte: 20,
} as const
export type Forca = keyof typeof FORCAS

/**
 * As imagens vêm de `public/fundos/` — geradas aqui mesmo, paredes lisas com
 * uma vinheta discreta. Não são fotos de escritório de propósito: uma cena
 * falsa atrás de uma borda imperfeita chama mais atenção que uma parede
 * neutra, e a aula é sobre a pessoa e o exercício.
 */
export const IMAGENS = [
  { id: 'neutro', nome: 'Neutro', caminho: '/fundos/neutro.png' },
  { id: 'areia', nome: 'Areia', caminho: '/fundos/areia.png' },
  { id: 'grafite', nome: 'Grafite', caminho: '/fundos/grafite.png' },
] as const
export type ImagemId = (typeof IMAGENS)[number]['id']

export type Fundo =
  | { tipo: 'nenhum' }
  | { tipo: 'desfoque'; forca: Forca }
  | { tipo: 'imagem'; id: ImagemId }

export const FUNDO_NENHUM: Fundo = { tipo: 'nenhum' }

export function mesmoFundo(a: Fundo, b: Fundo): boolean {
  if (a.tipo !== b.tipo) return false
  if (a.tipo === 'desfoque' && b.tipo === 'desfoque') return a.forca === b.forca
  if (a.tipo === 'imagem' && b.tipo === 'imagem') return a.id === b.id
  return true
}

/**
 * Espelho de `supportsBackgroundProcessors()` do pacote — as duas condições
 * dele, sem importá-lo. Se o pacote mudar o teste, este tem que acompanhar.
 */
function navegadorSuporta(): boolean {
  if (typeof window === 'undefined') return false
  // Por `in window`, e não `typeof`: essas duas ainda não estão no `lib.dom`
  // do TypeScript, e o teste por nome dispensa os types do pacote.
  const viaRapida = 'MediaStreamTrackGenerator' in window && 'MediaStreamTrackProcessor' in window
  const viaCanvas =
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  const segmentador =
    typeof OffscreenCanvas !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof createImageBitmap !== 'undefined' &&
    Boolean(document.createElement('canvas').getContext('webgl2'))
  return (viaRapida || viaCanvas) && segmentador
}

function lembrado(): Fundo {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return FUNDO_NENHUM
    const dados = JSON.parse(cru) as Partial<Fundo>
    if (dados.tipo === 'desfoque' && dados.forca && dados.forca in FORCAS) {
      return { tipo: 'desfoque', forca: dados.forca }
    }
    if (dados.tipo === 'imagem' && IMAGENS.some((i) => i.id === dados.id)) {
      return { tipo: 'imagem', id: dados.id as ImagemId }
    }
    return FUNDO_NENHUM
  } catch {
    return FUNDO_NENHUM
  }
}

function lembrar(fundo: Fundo): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(fundo))
  } catch {
    /* sem espaço ou sem permissão — vale só nesta chamada */
  }
}

/**
 * Escolhe o fundo da câmera LOCAL. Só funciona dentro de `<LiveKitRoom>`,
 * porque precisa do participante local.
 */
export function useFundoDaCamera() {
  // Avaliado uma vez: as APIs do navegador não aparecem no meio da chamada.
  const [suportado] = useState(navegadorSuporta)
  const { cameraTrack } = useLocalParticipant()

  const [fundo, setFundo] = useState<Fundo>(() => (suportado ? lembrado() : FUNDO_NENHUM))
  const [aplicando, setAplicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  /**
   * UM processador para a chamada inteira, e não um por escolha.
   *
   * Construir o processador carrega o modelo e sobe o worker de segmentação;
   * fazer isso a cada troca seria baixar tudo de novo e piscar o vídeo
   * enquanto o novo entra no lugar do velho. Ele nasce na primeira vez que é
   * preciso e depois só TROCA DE MODO (`switchTo`), que é instantâneo — é o
   * que deixa a pessoa experimentar leve/médio/forte/imagem sem esperar.
   */
  const processador = useRef<BackgroundProcessorWrapper | null>(null)

  /**
   * A trilha da câmera é o que se processa — e ela muda: aparece quando a
   * pessoa liga a câmera, some quando desliga, é trocada quando ela muda de
   * dispositivo. O efeito reaplica a escolha a cada trilha nova, senão o fundo
   * desapareceria toda vez que a câmera fosse religada.
   */
  const trilha = cameraTrack?.track as LocalVideoTrack | undefined

  useEffect(() => {
    if (!suportado || !trilha) return
    let cancelado = false

    async function aplicar() {
      setErro(null)
      try {
        if (fundo.tipo === 'nenhum') {
          // Desligar de verdade, e não só `switchTo('disabled')`: com o
          // processador parado o quadro passa direto, sem gastar GPU para
          // segmentar uma pessoa cujo fundo não vai mudar.
          if (trilha!.getProcessor()) await trilha!.stopProcessor()
          return
        }

        const modo =
          fundo.tipo === 'desfoque'
            ? ({ mode: 'background-blur', blurRadius: FORCAS[fundo.forca] } as const)
            : ({
                mode: 'virtual-background',
                imagePath: IMAGENS.find((i) => i.id === fundo.id)!.caminho,
              } as const)

        if (!processador.current) {
          setAplicando(true)
          const { BackgroundProcessor } = await import('@livekit/track-processors')
          if (cancelado) return
          processador.current = BackgroundProcessor(modo)
        } else {
          await processador.current.switchTo(modo)
        }

        if (trilha!.getProcessor() !== processador.current) {
          setAplicando(true)
          await trilha!.setProcessor(processador.current)
        }
      } catch (e) {
        if (cancelado) return
        // Falhou de verdade (modelo não baixou, GPU indisponível): volta para
        // "nenhum" em vez de deixar a opção marcada sobre uma câmera sem efeito.
        setFundo(FUNDO_NENHUM)
        lembrar(FUNDO_NENHUM)
        setErro(e instanceof Error ? e.message : 'Não consegui aplicar o fundo.')
      } finally {
        if (!cancelado) setAplicando(false)
      }
    }

    void aplicar()
    return () => {
      cancelado = true
    }
  }, [suportado, trilha, fundo])

  const escolher = useCallback((novo: Fundo) => {
    lembrar(novo)
    setFundo(novo)
  }, [])

  return {
    suportado,
    fundo,
    /** Enquanto o modelo carrega e o processador entra na trilha. */
    aplicando,
    erro,
    /** Sem câmera ligada não há fundo a trocar — as opções ficam visíveis, mas inertes. */
    temCamera: Boolean(trilha),
    escolher,
  }
}
