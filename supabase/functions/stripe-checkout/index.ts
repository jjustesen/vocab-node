// Deno Edge Function — chamada pelo PROFESSOR autenticado (verify-jwt ligado,
// padrão do deploy, como gerar-atividade). Cria a sessão de Checkout do
// Stripe para assinar o plano pedido e devolve a URL de pagamento.
//
// Quem muda `professores.plano` NUNCA é esta função: é o webhook, depois que
// o Stripe confirma o pagamento. Aqui só criamos customer + sessão.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { appUrl, clienteStripe, priceDoPlano, PLANOS_PAGOS, type PlanoPago } from '../_shared/stripe.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao, error: erroSessao } = await db.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)
  const professorId = sessao.user.id

  let corpo: { plano?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }
  const plano = corpo.plano
  if (typeof plano !== 'string' || !(PLANOS_PAGOS as readonly string[]).includes(plano)) {
    return respostaErro('Plano inválido — escolha "pro" ou "ilimitado".')
  }

  const { data: professor, error: erroProfessor } = await db
    .from('professores')
    .select('nome')
    .eq('id', professorId)
    .single()
  if (erroProfessor) return respostaErro(erroProfessor.message, 500)

  const stripe = clienteStripe()
  // admin (service_role): a linha de assinaturas é escrita só pelo servidor —
  // o professor não tem policy de escrita nela, de propósito.
  const admin = clienteAdmin()

  const { data: assinatura, error: erroAssinatura } = await admin
    .from('assinaturas')
    .select('*')
    .eq('professor_id', professorId)
    .maybeSingle()
  if (erroAssinatura) return respostaErro(erroAssinatura.message, 500)

  // Já assina? Troca de plano e cartão é papel do portal, não de um segundo
  // checkout — dois subscriptions ativos cobrariam duas vezes.
  if (assinatura?.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(assinatura.status)) {
    return respostaErro('Você já tem uma assinatura ativa. Use "Gerenciar assinatura" para trocar de plano.', 409)
  }

  let customerId = assinatura?.stripe_customer_id as string | null | undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: sessao.user.email ?? undefined,
      name: professor.nome,
      metadata: { professor_id: professorId },
    })
    customerId = customer.id
    const { error: erroUpsert } = await admin.from('assinaturas').upsert({
      professor_id: professorId,
      stripe_customer_id: customerId,
      atualizado_em: new Date().toISOString(),
    })
    if (erroUpsert) return respostaErro(erroUpsert.message, 500)
  }

  const sessaoCheckout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceDoPlano(plano as PlanoPago), quantity: 1 }],
    success_url: `${appUrl()}/plano?checkout=sucesso`,
    cancel_url: `${appUrl()}/plano`,
    allow_promotion_codes: true,
    // O webhook lê este metadata para saber de quem é a assinatura — é o elo
    // entre o mundo Stripe e o professor, então vai nos dois lugares.
    subscription_data: { metadata: { professor_id: professorId, plano } },
    metadata: { professor_id: professorId, plano },
  })

  return respostaJson({ url: sessaoCheckout.url })
})
