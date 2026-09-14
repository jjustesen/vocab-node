import { useCallback, useState } from 'react'

/**
 * Onde a tira de vídeo fica quando há algo no palco.
 *
 * `topo` é a faixa horizontal acima do conteúdo (bom em tela larga e baixa, e
 * no celular); `esquerda` e `direita` são a coluna ao lado, que sobra melhor
 * quando o que está no palco é um PDF em pé — ali a altura é o recurso
 * escasso, não a largura. Esquerda ou direita é gosto de quem olha: depende
 * de onde está a barra de anotação e de que lado a pessoa prefere o rosto.
 */
export type PosicaoDaCamera = 'topo' | 'esquerda' | 'direita'

/** O eixo que a tira divide com o palco — as duas colunas medem a mesma coisa. */
export type EixoDaTira = 'topo' | 'lateral'

export function eixoDe(posicao: PosicaoDaCamera): EixoDaTira {
  return posicao === 'topo' ? 'topo' : 'lateral'
}

/**
 * Quanto da área a tira de vídeo ocupa, em PIXELS do eixo que ela divide com
 * o palco — altura no `topo`, largura na lateral.
 *
 * Pixels e não fração: a primeira versão guardava a proporção, e o efeito era
 * a câmera crescer e encolher toda vez que a janela mudava de tamanho — ao
 * maximizar, ao abrir o painel, ao virar o celular. O que a pessoa ajustou
 * foi "a câmera deste tamanho", e é isso que tem que continuar valendo. Numa
 * tela pequena demais para o valor guardado, o CSS limita a tira a uma fatia
 * da área (ver `TiraDeVideo`), então o número nunca engole o palco.
 *
 * Um tamanho por eixo, porque são grandezas diferentes: 200px de altura numa
 * faixa horizontal e 200px de largura numa coluna não se parecem em nada.
 */
export type TamanhoDaTira = Record<EixoDaTira, number>

/** Nem tão fina que a câmera vire selo, nem a ponto de engolir o palco. */
export const TAMANHO_MIN = 96
export const TAMANHO_MAX = 720
/** Teto em fração da área, para a tela pequena — o CSS aplica. */
export const FRACAO_MAX_DA_AREA = 0.6

const PADRAO: TamanhoDaTira = { topo: 200, lateral: 280 }

const CHAVE = 'vocab-node:layout-da-sala'

type Guardado = { posicao: PosicaoDaCamera; tamanho: TamanhoDaTira }

function ler(): Guardado {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return { posicao: 'topo', tamanho: PADRAO }
    const dados = JSON.parse(cru) as Partial<Guardado> & { posicao?: string }
    return {
      posicao: lerPosicao(dados.posicao),
      // Cada eixo é validado sozinho: um valor corrompido num deles não pode
      // levar o outro junto, e fora da faixa cai no padrão em vez de abrir a
      // sala com a câmera ocupando a tela inteira.
      tamanho: {
        topo: valida(dados.tamanho?.topo, PADRAO.topo),
        lateral: valida(dados.tamanho?.lateral, PADRAO.lateral),
      },
    }
  } catch {
    // localStorage bloqueado (modo privado, política do navegador) ou conteúdo
    // corrompido: cair no padrão é degradação aceitável, quebrar a sala não é.
    return { posicao: 'topo', tamanho: PADRAO }
  }
}

/** `lateral` é o nome antigo da coluna, de quando só havia a da esquerda. */
function lerPosicao(valor: unknown): PosicaoDaCamera {
  if (valor === 'esquerda' || valor === 'lateral') return 'esquerda'
  if (valor === 'direita') return 'direita'
  return 'topo'
}

function valida(valor: unknown, padrao: number): number {
  return typeof valor === 'number' && valor >= TAMANHO_MIN && valor <= TAMANHO_MAX ? valor : padrao
}

function gravar(dados: Guardado): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados))
  } catch {
    /* sem espaço ou sem permissão — vale só nesta sessão */
  }
}

const ORDEM: PosicaoDaCamera[] = ['topo', 'esquerda', 'direita']

/** Para onde a câmera vai no próximo clique do botão. */
export function proximaPosicao(atual: PosicaoDaCamera): PosicaoDaCamera {
  return ORDEM[(ORDEM.indexOf(atual) + 1) % ORDEM.length]
}

/**
 * O arranjo da sala é DESTE navegador, e não do palco.
 *
 * O palco é estado compartilhado justamente porque professor e aluno precisam
 * estar olhando para a mesma coisa (ver `estado-palco.ts`). Onde a câmera fica
 * e que fatia ela ocupa são o oposto disso: é conforto de quem olha, depende
 * do tamanho da tela de cada um, e sincronizar só faria o professor rearranjar
 * a tela do aluno sem querer. Por isso mora no localStorage, não no canal.
 */
export function useLayoutDaSala() {
  const [estado, setEstado] = useState<Guardado>(ler)

  const alternarPosicao = useCallback(() => {
    setEstado((atual) => {
      const novo: Guardado = { ...atual, posicao: proximaPosicao(atual.posicao) }
      gravar(novo)
      return novo
    })
  }, [])

  /**
   * Só grava ao SOLTAR o divisor (`persistir`), não a cada pixel do arrasto:
   * um `setItem` por evento de ponteiro é escrita síncrona no meio de uma
   * chamada de vídeo, e o valor intermediário não interessa a ninguém.
   */
  const definirTamanho = useCallback((valor: number, persistir = false) => {
    setEstado((atual) => {
      const limitado = Math.round(Math.min(TAMANHO_MAX, Math.max(TAMANHO_MIN, valor)))
      const novo: Guardado = {
        ...atual,
        tamanho: { ...atual.tamanho, [eixoDe(atual.posicao)]: limitado },
      }
      if (persistir) gravar(novo)
      return novo
    })
  }, [])

  return {
    posicao: estado.posicao,
    tamanho: estado.tamanho[eixoDe(estado.posicao)],
    alternarPosicao,
    definirTamanho,
  }
}
