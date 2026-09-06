import type { Aula } from '@/types/db'

/** Janela em que uma aula agendada conta como "a aula de agora". */
export const JANELA_HORAS = 12

/**
 * Qual aula recebe o que se escreve na sala: a agendada mais próxima de agora,
 * dentro de ±12h. Fora dessa janela devolve null de propósito — escrever num
 * campo da sala não pode significar carimbar silenciosamente a aula do mês
 * passado.
 *
 * Mora aqui, e não dentro do painel, porque agora são dois os interessados: a
 * anotação do professor (`PainelDaAula`) e o documento da aula
 * (`documento-api`). Os dois precisam concordar sobre qual aula é "esta" —
 * duas cópias da regra virariam duas respostas diferentes na mesma tela.
 *
 * O motivo de a pergunta existir está em 0012_salas_livekit.sql: a sala pende
 * do aluno, não da aula, então ela não sabe quando a aula é. Quem amarra as
 * duas pontas é o cliente, aqui.
 */
export function aulaDeAgora(aulas: Aula[] | undefined): Aula | null {
  if (!aulas || aulas.length === 0) return null
  const agora = Date.now()
  const limite = JANELA_HORAS * 60 * 60 * 1000

  let melhor: Aula | null = null
  let menorDistancia = Infinity
  for (const aula of aulas) {
    if (aula.status === 'cancelada') continue
    const distancia = Math.abs(new Date(aula.data_hora).getTime() - agora)
    if (distancia <= limite && distancia < menorDistancia) {
      menorDistancia = distancia
      melhor = aula
    }
  }
  return melhor
}
