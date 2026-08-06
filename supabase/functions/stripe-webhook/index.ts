// Deno Edge Function — chamada pelo STRIPE, não por navegador nenhum.
//
// DEPLOY: `supabase functions deploy stripe-webhook --no-verify-jwt`.
// O Stripe não manda JWT do Supabase; a autenticação aqui é a assinatura
// do evento (STRIPE_WEBHOOK_SECRET), verificada antes de qualquer escrita.
//
// Este é o ÚNICO lugar que escreve `professores.plano` e `assinaturas` a
// partir de dinheiro de verdade. O fluxo inteiro:
//
//   checkout.session.completed        → primeira assinatura paga
//   customer.subscription.updated     → upgrade/downgrade/cancelamento agendado,
//                                       renovação, falha de cobrança (past_due)
//   customer.subscription.deleted     → assinatura morreu → volta ao gratuito
//
// Idempotente por construção: cada evento sincroniza o estado ATUAL da
// subscription (upsert), então evento repetido ou fora de ordem converge.
import Stripe from 'npm:stripe@18'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { clienteStripe, cryptoProvider, planoDoPrice } from '../_shared/stripe.ts'

// past_due entra como "ainda pago": o Stripe está no meio das retentativas de
// cobrança e cortar o professor no primeiro cartão recusado seria brutal. Se
// todas falharem a subscription vira canceled/unpaid e aí sim cai a régua.
const STATUS_COM_ACESSO = ['active', 'trialing', 'past_due']

async function sincronizarAssinatura(sub: Stripe.Subscription): Promise<void> {
  const admin = clienteAdmin()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  // O elo Stripe → professor: metadata gravado no checkout; se faltar (ex.:
  // subscription criada à mão no dashboard), cai para a linha do customer.
  let professorId = sub.metadata?.professor_id
  if (!professorId) {
    const { data } = await admin
      .from('assinaturas')
      .select('professor_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    professorId = data?.professor_id
  }
  if (!professorId) {
    console.error(`stripe-webhook: subscription ${sub.id} sem professor identificável (customer ${customerId})`)
    return
  }

  const item = sub.items.data[0]
  const planoPago = planoDoPrice(item?.price?.id)
  const temAcesso = STATUS_COM_ACESSO.includes(sub.status) && planoPago !== null
  const planoEfetivo = temAcesso ? planoPago! : 'gratuito'

  // `current_period_end` mudou de lugar entre versões da API do Stripe
  // (raiz → item); lemos os dois para não depender da versão pinada.
  const fimPeriodo =
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end
  const { error: erroAssinatura } = await admin.from('assinaturas').upsert({
    professor_id: professorId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plano: planoEfetivo,
    status: sub.status,
    periodo_fim: fimPeriodo ? new Date(fimPeriodo * 1000).toISOString() : null,
    cancela_no_fim: sub.cancel_at_period_end,
    atualizado_em: new Date().toISOString(),
  })
  if (erroAssinatura) throw new Error(`assinaturas: ${erroAssinatura.message}`)

  const { error: erroProfessor } = await admin
    .from('professores')
    .update({ plano: planoEfetivo })
    .eq('id', professorId)
  if (erroProfessor) throw new Error(`professores: ${erroProfessor.message}`)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método não permitido.', { status: 405 })

  const assinaturaHeader = req.headers.get('stripe-signature')
  if (!assinaturaHeader) return new Response('Sem assinatura.', { status: 400 })

  const corpo = await req.text() // cru — a verificação é sobre os bytes exatos
  const stripe = clienteStripe()

  let evento: Stripe.Event
  try {
    evento = await stripe.webhooks.constructEventAsync(
      corpo,
      assinaturaHeader,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    )
  } catch (e) {
    console.error('stripe-webhook: assinatura inválida', e)
    return new Response('Assinatura inválida.', { status: 400 })
  }

  try {
    switch (evento.type) {
      case 'checkout.session.completed': {
        const sessao = evento.data.object as Stripe.Checkout.Session
        if (sessao.mode !== 'subscription' || !sessao.subscription) break
        const subId = typeof sessao.subscription === 'string' ? sessao.subscription : sessao.subscription.id
        // O objeto da sessão não traz a subscription inteira — buscamos o
        // estado atual em vez de confiar no payload parcial.
        const sub = await stripe.subscriptions.retrieve(subId)
        await sincronizarAssinatura(sub)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await sincronizarAssinatura(evento.data.object as Stripe.Subscription)
        break
      }
      default:
        break // eventos não assinados no endpoint chegam aqui se alguém marcar demais — ignorar é correto
    }
  } catch (e) {
    console.error(`stripe-webhook: falha ao processar ${evento.type}`, e)
    // 500 → o Stripe reentrega com backoff; como a sincronização é
    // idempotente, a reentrega é segura.
    return new Response('Erro interno.', { status: 500 })
  }

  return new Response(JSON.stringify({ recebido: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
