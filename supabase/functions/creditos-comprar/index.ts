// Deno Edge Function — "Adicionar créditos" (professor logado, verify-jwt
// ligado). Cria um Checkout do Stripe de pagamento ÚNICO, na conta da
// plataforma, e devolve a URL. docs/TUTOR-TRILHAS.md §5.3.
//
// O crédito NÃO entra aqui nem na página de volta: quem soma é o webhook
// (stripe-webhook), quando o Stripe confirma o pagamento — na hora, no cartão;
// alguns segundos depois, no Pix (checkout.session.async_payment_succeeded).
//
// As formas de pagamento (cartão, Pix) são as ligadas no painel do Stripe:
// a sessão não fixa `payment_method_types`, para o Pix aparecer assim que a
// conta tiver o Pix ativo, sem novo deploy.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { appUrlDaRequisicao, clienteStripe } from '../_shared/stripe.ts'

const MINIMO_REAIS = 20
const MAXIMO_REAIS = 2000

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

  const corpo = await req.json().catch(() => ({}))
  const valor = Number(corpo?.valor)
  if (!Number.isInteger(valor) || valor < MINIMO_REAIS || valor > MAXIMO_REAIS) {
    return respostaErro(`Escolha um valor inteiro entre R$ ${MINIMO_REAIS} e R$ ${MAXIMO_REAIS}.`)
  }

  const { data: professor } = await db.from('professores').select('nome').eq('id', professorId).single()

  try {
    const stripe = clienteStripe()
    const admin = clienteAdmin()

    // O mesmo customer da assinatura do professor, quando já existe: o cartão
    // salvo de um aparece no outro. A linha de `assinaturas` é só do servidor.
    const { data: assinatura } = await admin
      .from('assinaturas')
      .select('stripe_customer_id')
      .eq('professor_id', professorId)
      .maybeSingle()
    let customerId = assinatura?.stripe_customer_id as string | null | undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: sessao.user.email ?? undefined,
        name: professor?.nome ?? undefined,
        metadata: { professor_id: professorId },
      })
      customerId = customer.id
      const { error } = await admin.from('assinaturas').upsert({
        professor_id: professorId,
        stripe_customer_id: customerId,
        atualizado_em: new Date().toISOString(),
      })
      if (error) return respostaErro(error.message, 500)
    }

    const metadata = { tipo: 'creditos', professor_id: professorId, valor_centavos: String(valor * 100) }
    const base = appUrlDaRequisicao(req)
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: valor * 100,
            product_data: {
              name: `Créditos de IA — R$ ${valor}`,
              description: 'Créditos para o tutor: gravar falas, testar e gerar lições. Não expiram.',
            },
          },
        },
      ],
      success_url: `${base}/creditos?compra=ok`,
      cancel_url: `${base}/creditos`,
      metadata,
      payment_intent_data: { metadata },
    })
    return respostaJson({ url: checkout.url })
  } catch (e) {
    console.error('creditos-comprar:', e)
    return respostaErro(e instanceof Error ? e.message : 'Falha ao abrir o pagamento.', 502)
  }
})
