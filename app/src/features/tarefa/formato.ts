/**
 * Funções de apresentação das telas do aluno. Ficam separadas de visual.tsx
 * porque um arquivo que exporta componentes E funções perde o fast refresh do
 * Vite (o módulo inteiro recarrega a cada edição).
 */

/** Estimativa de duração — ~45s por questão. Serve só para dar noção de esforço. */
export function minutosEstimados(questoes: number): number {
  return Math.max(1, Math.round(questoes * 0.75))
}

/** Cor do selo de nota, pelo desempenho. */
export function corDaNota(acertos: number, total: number): string {
  if (total === 0) return 'bg-neutral-100 text-neutral-600'
  const percentual = acertos / total
  if (percentual >= 0.7) return 'bg-emerald-100 text-emerald-800'
  if (percentual >= 0.5) return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-700'
}
