// Deno Edge Function — a página de venda de um plano (/p/:slug), docs/TUTOR-TRILHAS.md §6.
//
// DEPLOY: `supabase functions deploy plano-venda --no-verify-jwt`. A página é
// pública: quem compra pode não ter conta. Se o navegador mandar o JWT de um
// aluno logado, ele é conferido aqui e a compra vai para a conta dele (§6.1).
//
//   obter     → o plano, as trilhas e, se logado, "Assinando como…"
//   checkout  → Checkout do Stripe em modo assinatura, na conta da plataforma
//   pronto    → a volta do Stripe: espera o webhook e, se a compra criou a
//               conta, troca o session_id por um login UMA vez, em até 30 min
//
// Quem cria a conta e a assinatura é o webhook, nunca esta função.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { appUrlDaRequisicao, clienteStripe } from '../_shared/stripe.ts'
import { TIPO_PLANO_ALUNO } from '../_shared/assinatura-aluno.ts'

type Db = ReturnType<typeof clienteAdmin>
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TROCA_VALE_MS = 30 * 60_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const corpo = await req.json().catch(() => ({}))
  const db = clienteAdmin()
  const usuario = await usuarioLogado(req)

  try {
    switch (corpo?.acao) {
      case 'obter':
        return await obter(db, String(corpo.slug ?? ''), usuario)
      case 'checkout':
        return await checkout(req, db, corpo, usuario)
      case 'pronto':
        return await pronto(db, String(corpo.sessionId ?? ''))
      default:
        return respostaErro('Ação desconhecida.')
    }
  } catch (e) {
    console.error('plano-venda:', e)
    return respostaErro(e instanceof Error ? e.message : 'Falha ao falar com o pagamento.', 502)
  }
})

type Usuario = { id: string; email: string; nome: string }

/** O aluno logado, se o navegador mandou o JWT dele. A chave anon não é usuário. */
async function usuarioLogado(req: Request): Promise<Usuario | null> {
  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return null
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data } = await db.auth.getUser()
  if (!data.user?.email) return null
  return { id: data.user.id, email: data.user.email, nome: String(data.user.user_metadata?.nome ?? '') }
}

async function planoPeloSlug(db: Db, slug: string) {
  const { data: plano } = await db
    .from('planos_aluno')
    .select('id, professor_id, nome, descricao, preco_centavos, praticas_mes, aceitando, slug, stripe_product_id, stripe_price_id, stripe_price_centavos')
    .eq('slug', slug)
    .maybeSingle()
  return plano
}

async function obter(db: Db, slug: string, usuario: Usuario | null): Promise<Response> {
  const plano = await planoPeloSlug(db, slug)
  if (!plano) return respostaErro('Este plano não existe mais. Peça o link novo ao seu professor.', 404)

  const [{ data: professor }, { data: vinculos }] = await Promise.all([
    db.from('professores').select('nome').eq('id', plano.professor_id).single(),
    db.from('planos_aluno_trilhas').select('trilhas(id, nome, nivel, descricao)').eq('plano_id', plano.id),
  ])
  const trilhas = (vinculos ?? []).map((v) => v.trilhas as unknown as { id: string; nome: string; nivel: string; descricao: string | null })
  const ids = trilhas.map((t) => t.id)
  const { data: passos } = ids.length
    ? await db.from('trilha_etapas').select('trilha_id, atividade_id, material_id, licao_tutor_id').in('trilha_id', ids)
    : { data: [] }
  const contar = (id: string, campo: 'atividade_id' | 'material_id' | 'licao_tutor_id') =>
    (passos ?? []).filter((p) => p.trilha_id === id && p[campo]).length

  // Logado: já assina este plano? A tela troca o botão por "Abrir a trilha".
  let jaAssina = false
  if (usuario) {
    const { data: conta } = await db
      .from('contas_aluno')
      .select('aluno_id')
      .eq('user_id', usuario.id)
      .eq('professor_id', plano.professor_id)
      .maybeSingle()
    if (conta) {
      const { data: ativa } = await db
        .from('assinaturas_aluno')
        .select('id')
        .eq('plano_id', plano.id)
        .eq('aluno_id', conta.aluno_id)
        .eq('status', 'ativa')
        .maybeSingle()
      jaAssina = Boolean(ativa)
    }
  }

  return respostaJson({
    plano: {
      nome: plano.nome,
      descricao: plano.descricao,
      precoCentavos: plano.preco_centavos,
      praticasMes: plano.praticas_mes,
      aceitando: plano.aceitando,
    },
    professorNome: professor?.nome ?? 'Seu professor',
    trilhas: trilhas.map((t) => ({
      nome: t.nome,
      nivel: t.nivel,
      descricao: t.descricao,
      materiais: contar(t.id, 'material_id'),
      atividades: contar(t.id, 'atividade_id'),
      licoes: contar(t.id, 'licao_tutor_id'),
    })),
    usuario: usuario ? { nome: usuario.nome, email: usuario.email } : null,
    jaAssina,
  })
}

/** O Price do Stripe deste preço. Mudou o preço: Price novo; quem já assina fica no antigo (§5.1). */
async function priceDoPlano(db: Db, plano: NonNullable<Awaited<ReturnType<typeof planoPeloSlug>>>): Promise<string> {
  if (plano.stripe_price_id && plano.stripe_price_centavos === plano.preco_centavos) return plano.stripe_price_id
  const stripe = clienteStripe()
  let produto = plano.stripe_product_id
  if (!produto) {
    const p = await stripe.products.create({
      name: plano.nome,
      metadata: { tipo: TIPO_PLANO_ALUNO, plano_id: plano.id, professor_id: plano.professor_id },
    })
    produto = p.id
  }
  const price = await stripe.prices.create({
    product: produto,
    currency: 'brl',
    unit_amount: plano.preco_centavos,
    recurring: { interval: 'month' },
    metadata: { plano_id: plano.id },
  })
  await db
    .from('planos_aluno')
    .update({ stripe_product_id: produto, stripe_price_id: price.id, stripe_price_centavos: plano.preco_centavos })
    .eq('id', plano.id)
  return price.id
}

async function checkout(req: Request, db: Db, corpo: Record<string, unknown>, usuario: Usuario | null): Promise<Response> {
  const plano = await planoPeloSlug(db, String(corpo.slug ?? ''))
  if (!plano) return respostaErro('Este plano não existe mais.', 404)
  if (!plano.aceitando) return respostaErro('Este plano não está aceitando novas assinaturas agora.', 409)

  const email = (usuario?.email ?? String(corpo.email ?? '')).trim().toLowerCase()
  const nome = (String(corpo.nome ?? '').trim() || usuario?.nome || '').slice(0, 120)
  if (!usuario && (!EMAIL.test(email) || !nome)) return respostaErro('Preencha seu nome e um e-mail válido.')

  // O tutor do aluno só liga com o professor no beta (trigger da 0028).
  const { data: acesso } = await db.from('tutor_acesso').select('professor_id').eq('professor_id', plano.professor_id).maybeSingle()
  if (!acesso) return respostaErro('Este professor ainda não pode vender planos com o tutor.', 409)

  const stripe = clienteStripe()
  const price = await priceDoPlano(db, plano)

  // Logado: o customer dele (um por login), com o e-mail travado no Checkout.
  let customer: string | undefined
  if (usuario) {
    const { data: cliente } = await db.from('clientes_stripe').select('stripe_customer_id').eq('user_id', usuario.id).maybeSingle()
    customer = cliente?.stripe_customer_id
    if (!customer) {
      const c = await stripe.customers.create({ email, name: nome || undefined, metadata: { user_id: usuario.id } })
      customer = c.id
      await db.from('clientes_stripe').insert({ user_id: usuario.id, stripe_customer_id: customer })
    }
  }

  const metadata: Record<string, string> = {
    tipo: TIPO_PLANO_ALUNO,
    plano_id: plano.id,
    professor_id: plano.professor_id,
    email,
    nome,
    ...(usuario ? { user_id: usuario.id } : {}),
  }
  const base = appUrlDaRequisicao(req)
  const sessao = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: email }),
    metadata,
    subscription_data: { metadata },
    success_url: `${base}/p/${plano.slug}/pronto?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/p/${plano.slug}`,
  })
  return respostaJson({ url: sessao.url })
}

/**
 * A volta do Stripe. Estados: 'pendente' (o pagamento não fechou), 'processando'
 * (o webhook ainda não criou a assinatura; a página tenta de novo),
 * 'pronto' com `tokenHash` (entra direto) ou sem (já tinha conta: entra com a senha).
 */
async function pronto(db: Db, sessionId: string): Promise<Response> {
  if (!sessionId.startsWith('cs_')) return respostaErro('Pagamento não encontrado.', 404)
  const stripe = clienteStripe()
  const sessao = await stripe.checkout.sessions.retrieve(sessionId)
  if (sessao.metadata?.tipo !== TIPO_PLANO_ALUNO) return respostaErro('Pagamento não encontrado.', 404)
  if (sessao.status !== 'complete' || !sessao.subscription) return respostaJson({ estado: 'pendente' })

  const subId = typeof sessao.subscription === 'string' ? sessao.subscription : sessao.subscription.id
  const { data: assinatura } = await db
    .from('assinaturas_aluno')
    .select('id, conta_nova, login_trocado_em, planos_aluno(nome)')
    .eq('stripe_subscription_id', subId)
    .maybeSingle()
  if (!assinatura) return respostaJson({ estado: 'processando' })

  const email = String(sessao.metadata.email ?? '')
  const planoNome = (assinatura.planos_aluno as unknown as { nome: string } | null)?.nome ?? ''
  const recente = Date.now() - sessao.created * 1000 < TROCA_VALE_MS
  // Login automático SÓ para a conta que esta compra criou (§6.1): quem digita o
  // e-mail de outra pessoa e paga não entra na conta dela.
  if (!assinatura.conta_nova || assinatura.login_trocado_em || !recente || sessao.metadata.user_id) {
    return respostaJson({ estado: 'pronto', email, planoNome, entrar: !sessao.metadata.user_id })
  }

  // Marca antes de gerar: duas abas não trocam duas vezes.
  const { data: marcada } = await db
    .from('assinaturas_aluno')
    .update({ login_trocado_em: new Date().toISOString() })
    .eq('id', assinatura.id)
    .is('login_trocado_em', null)
    .select('id')
    .maybeSingle()
  if (!marcada) return respostaJson({ estado: 'pronto', email, planoNome, entrar: true })

  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !link.properties?.hashed_token) {
    console.error('plano-venda generateLink:', error)
    return respostaJson({ estado: 'pronto', email, planoNome, entrar: true })
  }
  return respostaJson({ estado: 'pronto', email, planoNome, tokenHash: link.properties.hashed_token })
}
