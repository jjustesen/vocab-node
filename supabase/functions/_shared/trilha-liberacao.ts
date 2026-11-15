/**
 * Quem está aberto e quem está travado numa trilha, para UM aluno
 * (docs/TUTOR-TRILHAS.md §4). Função pura, sem banco: quem chama já leu os
 * módulos, os passos, as conclusões e a data em que o aluno entrou.
 *
 * Nada disso é gravado (0030, "o cadeado não é gravado"): muda a regra da
 * trilha, muda o resultado na próxima leitura.
 *
 *   liberação (módulos)   tudo | progresso | periodo | progresso_e_periodo
 *   navegação (passos)    sequencia | sugerida | abas
 *
 * Passo opcional aparece e pode ser feito, mas nunca segura nada: não conta
 * para concluir o módulo e não é o "atual".
 */

export type Navegacao = 'sequencia' | 'sugerida' | 'abas'
export type Liberacao = 'tudo' | 'progresso' | 'periodo' | 'progresso_e_periodo'
export type EstadoDoPasso = 'feito' | 'atual' | 'aberto' | 'travado'

export type RegraDaTrilha = {
  navegacao: Navegacao
  liberacao: Liberacao
  liberacaoDias: number
  /** Quando o aluno entrou na trilha (trilha_alunos.iniciada_em). */
  iniciadaEm: string
  agora: Date
}

export type ModuloEntrada = { id: string; ordem: number; titulo: string }
export type PassoEntrada = { id: string; moduloId: string; ordem: number; opcional: boolean; concluido: boolean }

export type ModuloSaida = {
  id: string
  titulo: string
  aberto: boolean
  concluido: boolean
  /** Por que está travado: falta concluir este módulo… */
  esperaConcluir: string | null
  /** …e/ou só abre nesta data (ISO). */
  abreEm: string | null
}

export type Liberacoes = {
  modulos: ModuloSaida[]
  estadoPorPasso: Map<string, EstadoDoPasso>
  /** O passo que o aluno deve fazer agora, na trilha toda. */
  atualId: string | null
}

const DIA_MS = 86_400_000

export function calcularLiberacoes(regra: RegraDaTrilha, modulos: ModuloEntrada[], passos: PassoEntrada[]): Liberacoes {
  const ordenados = [...modulos].sort((a, b) => a.ordem - b.ordem)
  const passosDo = (moduloId: string) =>
    passos.filter((p) => p.moduloId === moduloId).sort((a, b) => a.ordem - b.ordem)

  const inicio = new Date(regra.iniciadaEm).getTime()
  const diasDesde = Math.floor((regra.agora.getTime() - inicio) / DIA_MS)
  const porPeriodo = regra.liberacao === 'periodo' || regra.liberacao === 'progresso_e_periodo'
  const porProgresso = regra.liberacao === 'progresso' || regra.liberacao === 'progresso_e_periodo'

  const modulosSaida: ModuloSaida[] = []
  const estadoPorPasso = new Map<string, EstadoDoPasso>()
  let atualId: string | null = null

  ordenados.forEach((m, i) => {
    const doModulo = passosDo(m.id)
    const concluido = doModulo.filter((p) => !p.opcional).every((p) => p.concluido)
    const anterior = modulosSaida[i - 1]

    // Módulo i abre no dia i × intervalo, contado de quando o aluno entrou.
    const diaQueAbre = i * regra.liberacaoDias
    const datou = !porPeriodo || i === 0 || diasDesde >= diaQueAbre
    const progrediu = !porProgresso || i === 0 || Boolean(anterior?.concluido && anterior.aberto)
    const aberto = datou && progrediu

    modulosSaida.push({
      id: m.id,
      titulo: m.titulo,
      aberto,
      concluido: aberto && concluido,
      esperaConcluir: !progrediu && anterior ? anterior.titulo : null,
      abreEm: !datou ? new Date(inicio + diaQueAbre * DIA_MS).toISOString() : null,
    })

    if (!aberto) {
      for (const p of doModulo) estadoPorPasso.set(p.id, p.concluido ? 'feito' : 'travado')
      return
    }

    const primeiroPendente = doModulo.find((p) => !p.concluido && !p.opcional) ?? null
    for (const p of doModulo) {
      if (p.concluido) estadoPorPasso.set(p.id, 'feito')
      else if (primeiroPendente && p.id === primeiroPendente.id) estadoPorPasso.set(p.id, 'atual')
      else if (
        regra.navegacao === 'sequencia' &&
        primeiroPendente &&
        p.ordem > primeiroPendente.ordem
      )
        estadoPorPasso.set(p.id, 'travado')
      else estadoPorPasso.set(p.id, 'aberto')
    }
    if (!atualId && primeiroPendente) atualId = primeiroPendente.id
  })

  return { modulos: modulosSaida, estadoPorPasso, atualId }
}
