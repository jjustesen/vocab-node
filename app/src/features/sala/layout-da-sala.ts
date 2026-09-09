import { useCallback, useState } from 'react'

/**
 * Onde a tira de vídeo fica quando há algo no palco.
 *
 * `topo` é a faixa horizontal acima do conteúdo (bom em tela larga e baixa, e
 * no celular); `lateral` é a coluna à esquerda, que sobra melhor quando o que
 * está no palco é um PDF em pé — ali a altura é o recurso escasso, não a
 * largura.
 */
export type PosicaoDaCamera = 'topo' | 'lateral'

/**
 * Quanto da área a tira de vídeo ocupa, em fração do eixo que ela divide com
 * o palco — altura no `topo`, largura na `lateral`.
 *
 * Fração e não pixels: a mesma sala é aberta no notebook e no celular, e 180px
 * é um quinto da tela num e metade no outro. Guardar a proporção é o que faz o
 * ajuste continuar valendo quando a janela muda de tamanho.
 *
 * Uma fração por posição, porque são grandezas diferentes: 20% da altura numa
 * faixa horizontal e 20% da largura numa coluna não se parecem em nada.
 */
export type FracaoDaTira = Record<PosicaoDaCamera, number>

/** Nem tão fina que a câmera vire selo, nem a ponto de engolir o palco. */
export const FRACAO_MIN = 0.1
export const FRACAO_MAX = 0.6

const PADRAO: FracaoDaTira = { topo: 0.22, lateral: 0.18 }

const CHAVE = 'vocab-node:layout-da-sala'

type Guardado = { posicao: PosicaoDaCamera; fracao: FracaoDaTira }

function ler(): Guardado {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return { posicao: 'topo', fracao: PADRAO }
    const dados = JSON.parse(cru) as Partial<Guardado>
    return {
      posicao: dados.posicao === 'lateral' ? 'lateral' : 'topo',
      // Cada eixo é validado sozinho: um valor corrompido num deles não pode
      // levar o outro junto, e fora da faixa cai no padrão em vez de abrir a
      // sala com a câmera ocupando a tela inteira.
      fracao: {
        topo: valida(dados.fracao?.topo, PADRAO.topo),
        lateral: valida(dados.fracao?.lateral, PADRAO.lateral),
      },
    }
  } catch {
    // localStorage bloqueado (modo privado, política do navegador) ou conteúdo
    // corrompido: cair no padrão é degradação aceitável, quebrar a sala não é.
    return { posicao: 'topo', fracao: PADRAO }
  }
}

function valida(valor: unknown, padrao: number): number {
  return typeof valor === 'number' && valor >= FRACAO_MIN && valor <= FRACAO_MAX ? valor : padrao
}

function gravar(dados: Guardado): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados))
  } catch {
    /* sem espaço ou sem permissão — vale só nesta sessão */
  }
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
      const novo: Guardado = {
        ...atual,
        posicao: atual.posicao === 'topo' ? 'lateral' : 'topo',
      }
      gravar(novo)
      return novo
    })
  }, [])

  /**
   * Só grava ao SOLTAR o divisor (`persistir`), não a cada pixel do arrasto:
   * um `setItem` por evento de ponteiro é escrita síncrona no meio de uma
   * chamada de vídeo, e o valor intermediário não interessa a ninguém.
   */
  const definirFracao = useCallback((valor: number, persistir = false) => {
    setEstado((atual) => {
      const limitado = Math.min(FRACAO_MAX, Math.max(FRACAO_MIN, valor))
      const novo: Guardado = {
        ...atual,
        fracao: { ...atual.fracao, [atual.posicao]: limitado },
      }
      if (persistir) gravar(novo)
      return novo
    })
  }, [])

  return {
    posicao: estado.posicao,
    fracao: estado.fracao[estado.posicao],
    alternarPosicao,
    definirFracao,
  }
}
