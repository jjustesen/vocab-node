// Deno Edge Function — chamada pelo PROFESSOR autenticado (verify-jwt ligado).
// Abre o Billing Portal do Stripe: trocar de plano, trocar cartão, baixar
// fatura e cancelar acontecem lá — nada disso é tela nossa. O resultado de
// qualquer mudança volta pelo webhook.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { appUrl, clienteStripe } from '../_shared/stripe.ts'

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

  const { data: assinatura, error } = await clienteAdmin()
    .from('assinaturas')
    .select('stripe_customer_id')
    .eq('professor_id', sessao.user.id)
    .maybeSingle()
  if (error) return respostaErro(error.message, 500)
  if (!assinatura?.stripe_customer_id) {
    return respostaErro('Você ainda não tem assinatura — escolha um plano primeiro.', 404)
  }

  const portal = await clienteStripe().billingPortal.sessions.create({
    customer: assinatura.stripe_customer_id,
    return_url: `${appUrl()}/plano`,
  })

  return respostaJson({ url: portal.url })
})
