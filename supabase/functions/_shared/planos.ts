// Espelha app/src/lib/planos.ts — mude de um lado, mude do outro.
export const LIMITE_ALUNOS_GRATUITO = 3
export const LIMITE_GERACOES_GRATUITO = 10
export const LIMITE_GERACOES_PRO = 300

export function limiteGeracoes(plano: string): number {
  return plano === 'pro' ? LIMITE_GERACOES_PRO : LIMITE_GERACOES_GRATUITO
}
