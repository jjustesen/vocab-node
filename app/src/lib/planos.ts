/**
 * Limites por plano (RF-110/111) — espelhado em
 * supabase/functions/_shared/planos.ts. O front usa isto só para mostrar uso
 * e desabilitar botões (RF-112); quem realmente barra é sempre o servidor
 * (gerar-atividade valida de novo antes de chamar a IA) ou, no caso de
 * alunos, a checagem dentro da própria mutation — mude de um lado, mude do
 * outro.
 */
import type { PlanoTipo } from '@/types/db'

export const LIMITE_ALUNOS_GRATUITO = 3
export const LIMITE_GERACOES_GRATUITO = 10
export const LIMITE_GERACOES_PRO = 300

export function limiteAlunos(plano: PlanoTipo): number | null {
  return plano === 'pro' ? null : LIMITE_ALUNOS_GRATUITO
}

export function limiteGeracoes(plano: PlanoTipo): number {
  return plano === 'pro' ? LIMITE_GERACOES_PRO : LIMITE_GERACOES_GRATUITO
}
