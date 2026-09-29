import { useMemo, useState } from 'react'
import { useTurmasComMembros, type TurmaComMembros } from './api'

/**
 * Para quem vai um envio: turmas inteiras e/ou alunos avulsos.
 *
 * A turma aqui é DESTINO, não atalho de seleção. Escolher "Conversação B1"
 * manda para a turma — o item passa a ser dela (0020) e todo membro recebe,
 * inclusive quem entrar depois. Por isso os membros aparecem marcados e
 * travados na lista: não existe "a turma menos um".
 *
 * Os avulsos são o envio de sempre, aluno por aluno. Quem está numa turma
 * escolhida sai dos avulsos na hora de enviar — já vai pela turma.
 *
 * @param turmaInicial a turma cuja tela abriu o envio — já vem escolhida.
 */
export function useDestinos({
  turmaInicial,
  alunosIniciais,
}: { turmaInicial?: string; alunosIniciais?: string[] } = {}) {
  const { data: turmas } = useTurmasComMembros()
  const [turmaIds, setTurmaIds] = useState<Set<string>>(() => new Set(turmaInicial ? [turmaInicial] : []))
  const [avulsos, setAvulsos] = useState<Set<string>>(() => new Set(alunosIniciais))

  const escolhidas: TurmaComMembros[] = useMemo(
    () => (turmas ?? []).filter((t) => turmaIds.has(t.id)),
    [turmas, turmaIds],
  )

  /** aluno → nome da turma pela qual ele recebe. */
  const pelaTurma = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const t of escolhidas) for (const id of t.alunoIds) if (!mapa.has(id)) mapa.set(id, t.nome)
    return mapa
  }, [escolhidas])

  const avulsosEfetivos = [...avulsos].filter((id) => !pelaTurma.has(id))

  return {
    turmaIds: [...turmaIds],
    escolhidas,
    pelaTurma,
    avulsos: avulsosEfetivos,
    marcado: (alunoId: string) => pelaTurma.has(alunoId) || avulsos.has(alunoId),
    alternarTurma: (turmaId: string) =>
      setTurmaIds((atuais) => {
        const novas = new Set(atuais)
        if (novas.has(turmaId)) novas.delete(turmaId)
        else novas.add(turmaId)
        return novas
      }),
    /** Quem vai pela turma não desmarca — ele recebe de qualquer forma. */
    alternarAluno: (alunoId: string) => {
      if (pelaTurma.has(alunoId)) return
      setAvulsos((atuais) => {
        const novos = new Set(atuais)
        if (novos.has(alunoId)) novos.delete(alunoId)
        else novos.add(alunoId)
        return novos
      })
    },
    marcarAvulsos: (ids: string[]) => setAvulsos(new Set(ids)),
    vazio: turmaIds.size === 0 && avulsosEfetivos.length === 0,
  }
}

export type Destinos = ReturnType<typeof useDestinos>

/** "Conversação B1 + 2 alunos" — o rótulo do botão de enviar. */
export function rotuloDosDestinos(destinos: Destinos): string {
  const partes = destinos.escolhidas.map((t) => t.nome)
  const n = destinos.avulsos.length
  if (n > 0) partes.push(`${n} ${n === 1 ? 'aluno' : 'alunos'}`)
  return partes.join(' + ')
}
