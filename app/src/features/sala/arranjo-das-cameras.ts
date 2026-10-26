import type { TrackReferenceOrPlaceholder } from '@livekit/components-react'

/**
 * Quem aparece onde numa sala cheia.
 *
 * A primeira turma grande (uns 20 alunos) mostrou o que o grid igualitário
 * faz: o rosto do professor vira um ladrilho entre vinte, some ao rolar, e
 * ninguém se acha na própria tela. Numa aula a câmera não vale o mesmo para
 * todo mundo: o aluno precisa ver QUEM EXPLICA e precisa se ver (é assim que
 * ele sabe que está aparecendo, e enquadrado). Os colegas vêm depois.
 *
 * Então as câmeras saem daqui em três grupos:
 *   - `destaque`: o professor, para o aluno. Para o próprio professor não há
 *     destaque fixo — quem ele precisa ver são os alunos.
 *   - `propria`: a câmera de quem está olhando, sempre visível.
 *   - `outros`: o resto, com quem está falando na frente. É o grupo que pode
 *     ser cortado quando não cabe — nunca o destaque nem a própria câmera.
 */

/** O prefixo que `sala-entrar` dá à identidade do professor no LiveKit. */
const PREFIXO_DO_PROFESSOR = 'prof-'

export function ehIdentidadeDoProfessor(identidade: string): boolean {
  return identidade.startsWith(PREFIXO_DO_PROFESSOR)
}

export type ArranjoDasCameras = {
  destaque: TrackReferenceOrPlaceholder | null
  propria: TrackReferenceOrPlaceholder | null
  outros: TrackReferenceOrPlaceholder[]
}

export function arranjarCameras(
  cameras: TrackReferenceOrPlaceholder[],
  { eu, ehProfessor }: { eu: string; ehProfessor: boolean },
): ArranjoDasCameras {
  const propria = cameras.find((c) => c.participant.identity === eu) ?? null
  const destaque = ehProfessor
    ? null
    : (cameras.find((c) => ehIdentidadeDoProfessor(c.participant.identity)) ?? null)

  const outros = cameras
    .filter((c) => c !== propria && c !== destaque)
    // Quem fala agora primeiro, depois quem falou por último. Quando a faixa
    // corta gente, quem fica de fora é quem está quieto há mais tempo — e
    // quem abre a boca volta para a tela sem ninguém precisar rolar.
    .sort((a, b) => {
      const falaA = a.participant.isSpeaking ? 1 : 0
      const falaB = b.participant.isSpeaking ? 1 : 0
      if (falaA !== falaB) return falaB - falaA
      return (b.participant.lastSpokeAt?.getTime() ?? 0) - (a.participant.lastSpokeAt?.getTime() ?? 0)
    })

  return { destaque, propria, outros }
}

/**
 * Quantos ladrilhos 16:9 cabem numa fila sem rolar.
 *
 * `eixo` é o comprimento da fila (largura numa fila horizontal, altura numa
 * coluna) e `lado` é a outra medida, que define o tamanho de cada ladrilho.
 */
export function quantosCabem({
  eixo,
  lado,
  horizontal,
  gap,
}: {
  eixo: number
  lado: number
  horizontal: boolean
  gap: number
}): number {
  if (eixo <= 0 || lado <= 0) return 0
  const ladrilho = horizontal ? (lado * 16) / 9 : (lado * 9) / 16
  return Math.max(0, Math.floor((eixo + gap) / (ladrilho + gap)))
}
