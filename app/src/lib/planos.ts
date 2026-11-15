/**
 * Limites por plano (RF-110/111) — espelhado em
 * supabase/functions/_shared/planos.ts e na migration 0008. O front usa isto
 * só para mostrar uso e desabilitar botões (RF-112); quem realmente barra é
 * sempre o servidor (gerar-atividade valida de novo antes de chamar a IA) ou,
 * no caso de alunos, a checagem dentro da própria mutation — mude de um lado,
 * mude do outro.
 */
import type { PlanoTipo } from '@/types/db'

export type PlanoInfo = {
  nome: string
  /** O preço cheio — o do `price` no Stripe. */
  precoMensal: number
  /**
   * Preço com a promoção de lançamento, quando houver. Só VITRINE: quem
   * desconta de verdade é o cupom que o `stripe-checkout` aplica (secret
   * STRIPE_CUPOM_LANCAMENTO). Encerrou a promoção? Apague a secret E tire
   * este campo — senão a tela promete um preço que o checkout não dá.
   */
  precoLancamento?: number
  limiteAlunos: number | null // null = sem teto
  limiteGeracoes: number
  descricao: string
}

export const PLANOS: Record<PlanoTipo, PlanoInfo> = {
  gratuito: {
    nome: 'Gratuito',
    precoMensal: 0,
    limiteAlunos: 3,
    limiteGeracoes: 5,
    descricao: 'Para testar com seus primeiros alunos.',
  },
  pro: {
    nome: 'Pro',
    precoMensal: 200,
    precoLancamento: 160,
    limiteAlunos: 30,
    limiteGeracoes: 30,
    descricao: 'Para quem vive de dar aula.',
  },
  ilimitado: {
    nome: 'Ilimitado',
    precoMensal: 400,
    limiteAlunos: null,
    limiteGeracoes: 100,
    descricao: 'Para agendas cheias, sem teto de alunos.',
  },
}

export function limiteAlunos(plano: PlanoTipo): number | null {
  return PLANOS[plano].limiteAlunos
}

export function limiteGeracoes(plano: PlanoTipo): number {
  return PLANOS[plano].limiteGeracoes
}
