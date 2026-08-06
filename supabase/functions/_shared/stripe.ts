/**
 * Stripe dentro das Edge Functions (Deno).
 *
 * O SDK precisa dos dois adaptadores explícitos: fetch como HTTP client (o
 * default do stripe-node é o http do Node, que não existe aqui) e SubtleCrypto
 * para verificar a assinatura do webhook de forma assíncrona (a verificação
 * síncrona padrão usa crypto do Node).
 *
 * Segredos esperados (supabase secrets set):
 *   STRIPE_SECRET_KEY       chave sk_... (test ou live)
 *   STRIPE_WEBHOOK_SECRET   whsec_... do endpoint do webhook
 *   STRIPE_PRICE_PRO        price_... do plano Pro (R$ 100/mês)
 *   STRIPE_PRICE_ILIMITADO  price_... do plano Ilimitado (R$ 300/mês)
 *   APP_URL                 origem do app (ex.: https://app.vocabnode.com)
 */
import Stripe from 'npm:stripe@18'

export function clienteStripe(): Stripe {
  return new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider()

/** Planos compráveis (o gratuito não passa pelo Stripe). */
export const PLANOS_PAGOS = ['pro', 'ilimitado'] as const
export type PlanoPago = (typeof PLANOS_PAGOS)[number]

export function priceDoPlano(plano: PlanoPago): string {
  const price = Deno.env.get(plano === 'pro' ? 'STRIPE_PRICE_PRO' : 'STRIPE_PRICE_ILIMITADO')
  if (!price) throw new Error(`Secret STRIPE_PRICE_${plano.toUpperCase()} não configurado.`)
  return price
}

/** Inverso de priceDoPlano — usado pelo webhook para saber que plano foi pago. */
export function planoDoPrice(priceId: string | undefined): PlanoPago | null {
  if (!priceId) return null
  if (priceId === Deno.env.get('STRIPE_PRICE_PRO')) return 'pro'
  if (priceId === Deno.env.get('STRIPE_PRICE_ILIMITADO')) return 'ilimitado'
  return null
}

export function appUrl(): string {
  const url = Deno.env.get('APP_URL')
  if (!url) throw new Error('Secret APP_URL não configurado.')
  return url.replace(/\/$/, '')
}
