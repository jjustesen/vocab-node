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
 * As imagens vêm de `public/fundos/`, todas geradas aqui mesmo, em dois grupos.
 *
 * PAREDES: lisas, com uma vinheta discreta. São a escolha mais segura: com uma
 * parede atrás, a borda imperfeita do recorte não tem nada para revelar.
 *
 * CENAS: estante de livros e sala — o "escritório de professor" que muita
 * gente quer atrás de si numa aula. Vêm já DESFOCADAS, como uma câmera de
 * verdade faria com o que está a dois metros da pessoa: é o que as faz parecer
 * atrás de quem fala, e não um pôster colado nas costas. Sem texto nenhum,
 * porque a prévia local é espelhada e uma lombada escrita sairia ao contrário.
 */
export const IMAGENS = [
  { id: 'estante', nome: 'Estante', caminho: '/fundos/estante.jpg', grupo: 'cena' },
  { id: 'sala', nome: 'Sala', caminho: '/fundos/sala.jpg', grupo: 'cena' },
  { id: 'neutro', nome: 'Neutro', caminho: '/fundos/neutro.png', grupo: 'parede' },
  { id: 'areia', nome: 'Areia', caminho: '/fundos/areia.png', grupo: 'parede' },
  { id: 'grafite', nome: 'Grafite', caminho: '/fundos/grafite.png', grupo: 'parede' },
] as const
export type ImagemId = (typeof IMAGENS)[number]['id']

export type Fundo =
  | { tipo: 'nenhum' }
  | { tipo: 'desfoque'; forca: Forca }
  | { tipo: 'imagem'; id: ImagemId }
  /** Uma foto que a própria pessoa escolheu — ver `guardarImagemPropria`. */
  | { tipo: 'propria' }

export const FUNDO_NENHUM: Fundo = { tipo: 'nenhum' }

export function mesmoFundo(a: Fundo, b: Fundo): boolean {
  if (a.tipo !== b.tipo) return false
  if (a.tipo === 'desfoque' && b.tipo === 'desfoque') return a.forca === b.forca
  if (a.tipo === 'imagem' && b.tipo === 'imagem') return a.id === b.id
  return true
}

// ── A imagem da própria pessoa ───────────────────────────────────────────────
//
// Guardada no navegador, como a escolha do fundo, e nunca enviada a lugar
// nenhum: quem vê o fundo é o vídeo já tratado, não o arquivo. Reduzida ANTES
// de guardar — uma foto de celular de 4000px estouraria o `localStorage` (que
// tem uns 5 MB por site) e faria o segmentador redimensioná-la a cada troca.

const CHAVE_IMAGEM = 'vocab-node:fundo-da-camera:imagem'
/** O tamanho do vídeo da câmera; maior que isso, o pacote só reduz de novo. */
const LARGURA_PROPRIA = 1280
const ALTURA_PROPRIA = 720

export function imagemPropria(): string | null {
  try {
    return localStorage.getItem(CHAVE_IMAGEM)
  } catch {
    return null
  }
}

/**
 * Recorta a foto para 16:9 pelo CENTRO (como `object-fit: cover`) e guarda
 * como JPEG. Recortar em vez de esticar: a foto de celular em pé, esticada
 * para deitada, viraria uma estante de livros gordos.
 */
export async function guardarImagemPropria(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  const bitmap = await createImageBitmap(arquivo).catch(() => {
    throw new Error('Não consegui abrir esta imagem.')
  })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = LARGURA_PROPRIA
    canvas.height = ALTURA_PROPRIA
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não consegui processar a imagem neste navegador.')
    const escala = Math.max(LARGURA_PROPRIA / bitmap.width, ALTURA_PROPRIA / bitmap.height)
    const largura = bitmap.width * escala
    const altura = bitmap.height * escala
    ctx.drawImage(bitmap, (LARGURA_PROPRIA - largura) / 2, (ALTURA_PROPRIA - altura) / 2, largura, altura)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    try {
      localStorage.setItem(CHAVE_IMAGEM, dataUrl)
    } catch {
      throw new Error('Não há espaço neste navegador para guardar a imagem.')
    }
    return dataUrl
  } finally {
    bitmap.close()
  }
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
    // A foto pode ter sumido (dados do site limpos) e a escolha ficado.
    if (dados.tipo === 'propria' && imagemPropria()) return { tipo: 'propria' }
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

        let modo
        if (fundo.tipo === 'desfoque') {
          modo = { mode: 'background-blur', blurRadius: FORCAS[fundo.forca] } as const
        } else {
          // O pacote carrega a imagem com `<img src>`, então o data URL da
          // foto da pessoa serve tal e qual um caminho de `public/`.
          const imagePath =
            fundo.tipo === 'imagem' ? IMAGENS.find((i) => i.id === fundo.id)!.caminho : imagemPropria()
          if (!imagePath) throw new Error('A imagem escolhida não está mais neste navegador.')
          modo = { mode: 'virtual-background', imagePath } as const
        }

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

  /** A foto que existe agora — muda quando a pessoa troca. */
  const [propria, setPropria] = useState<string | null>(() => (suportado ? imagemPropria() : null))

  const escolherImagemPropria = useCallback(
    async (arquivo: File) => {
      setErro(null)
      try {
        const dataUrl = await guardarImagemPropria(arquivo)
        setPropria(dataUrl)
        // Trocar a foto com ela já em uso não muda `fundo` ({tipo:'propria'}
        // continua igual), e o efeito não rodaria: um objeto novo força.
        escolher({ tipo: 'propria' })
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não consegui usar esta imagem.')
      }
    },
    [escolher],
  )

  return {
    suportado,
    fundo,
    /** Enquanto o modelo carrega e o processador entra na trilha. */
    aplicando,
    erro,
    /** Sem câmera ligada não há fundo a trocar — as opções ficam visíveis, mas inertes. */
    temCamera: Boolean(trilha),
    escolher,
    /** A foto da própria pessoa, se ela já escolheu uma (data URL). */
    propria,
    escolherImagemPropria,
  }
}
