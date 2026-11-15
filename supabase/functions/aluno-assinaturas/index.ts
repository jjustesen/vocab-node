// Deno Edge Function — "Minha conta" do ALUNO logado (verify-jwt ligado, como
// painel-aluno-obter). docs/TUTOR-TRILHAS.md §6.2.
//
//   listar    → as assinaturas de TODOS os professores do login, e as trilhas
//               à venda desses professores (explorar)
//   cancelar  → não renova no fim do período (cancel_at_period_end)
//   manter    → desfaz o cancelamento, enquanto o período não acabou
//   cartoes   → o portal do Stripe para cartões e recibos (a tela própria com
//               Elements é o próximo passo; o portal é a reserva do §6.2)
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { appUrlDaRequisicao, clienteStripe } from '../_shared/stripe.ts'

type Db = ReturnType<typeof clienteAdmin>
const MOTIVOS = ['caro', 'sem_tempo', 'terminei', 'nao_gostei', 'outro']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)
  const dbAluno = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao } = await dbAluno.auth.getUser()
  if (!sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  const db = clienteAdmin()
  const { data: contas } = await db
    .from('contas_aluno')
    .select('aluno_id, professor_id, professores(nome)')
    .eq('user_id', sessao.user.id)
  if (!contas?.length) return respostaErro('Conta não encontrada.', 404)
  const alunoIds = contas.map((c) => c.aluno_id as string)

  const corpo = await req.json().catch(() => ({}))
  try {
    switch (corpo?.acao) {
      case 'listar':
        return await listar(db, contas as unknown as Conta[], sessao.user.id, sessao.user)
      case 'cancelar':
        return await alterarRenovacao(db, alunoIds, String(corpo.assinaturaId ?? ''), true, String(corpo.motivo ?? ''))
      case 'manter':
        return await alterarRenovacao(db, alunoIds, String(corpo.assinaturaId ?? ''), false, '')
      case 'cartoes':
        return await portal(req, db, sessao.user.id)
      default:
        return respostaErro('Ação desconhecida.')
    }
  } catch (e) {
    console.error('aluno-assinaturas:', e)
    return respostaErro(e instanceof Error ? e.message : 'Falha inesperada.', 502)
  }
})

type Conta = { aluno_id: string; professor_id: string; professores: { nome: string } | null }

async function listar(db: Db, contas: Conta[], userId: string, user: { email?: string; user_metadata?: Record<string, unknown> }): Promise<Response> {
  const alunoIds = contas.map((c) => c.aluno_id)
  const professorIds = [...new Set(contas.map((c) => c.professor_id))]
  const nomeDoProfessor = new Map(contas.map((c) => [c.professor_id, c.professores?.nome ?? 'Professor']))

  const [{ data: assinaturas }, { data: planos }, { data: cliente }] = await Promise.all([
    db
      .from('assinaturas_aluno')
      .select('id, plano_id, professor_id, aluno_id, status, cancela_no_fim, periodo_inicio, periodo_fim, preco_centavos, praticas_mes, praticas_extra, pago_por, encerrada_em, motivo_encerramento, planos_aluno(nome, slug)')
      .in('aluno_id', alunoIds)
      .order('criado_em', { ascending: false }),
    db
      .from('planos_aluno')
      .select('id, professor_id, nome, descricao, preco_centavos, praticas_mes, slug, planos_aluno_trilhas(trilhas(nome, nivel))')
      .in('professor_id', professorIds)
      .eq('aceitando', true)
      .eq('mostrar_no_painel', true),
    db.from('clientes_stripe').select('stripe_customer_id').eq('user_id', userId).maybeSingle(),
  ])

  // Práticas usadas no período atual de cada assinatura ativa.
  const usadas = new Map<string, number>()
  await Promise.all(
    (assinaturas ?? [])
      .filter((a) => a.status === 'ativa')
      .map(async (a) => {
        const { count } = await db
          .from('tutor_sessoes')
          .select('id', { count: 'exact', head: true })
          .eq('aluno_id', a.aluno_id)
          .eq('professor_id', a.professor_id)
          .eq('teste', false)
          .gte('iniciada_em', a.periodo_inicio)
        usadas.set(a.id, count ?? 0)
      }),
  )

  // Só a última assinatura de cada plano (assinar de novo cria outra).
  const vistos = new Set<string>()
  const lista = (assinaturas ?? []).filter((a) => {
    if (vistos.has(a.plano_id)) return false
    vistos.add(a.plano_id)
    return true
  })
  const assinadosAtivos = new Set(lista.filter((a) => a.status === 'ativa').map((a) => a.plano_id))

  return respostaJson({
    nome: String(user.user_metadata?.nome ?? ''),
    email: user.email ?? '',
    temCartao: Boolean(cliente),
    assinaturas: lista.map((a) => {
      const plano = a.planos_aluno as unknown as { nome: string; slug: string } | null
      return {
        id: a.id,
        planoNome: plano?.nome ?? 'Plano',
        slug: plano?.slug ?? null,
        professorNome: nomeDoProfessor.get(a.professor_id) ?? 'Professor',
        status: a.status,
        cancelaNoFim: a.cancela_no_fim,
        periodoFim: a.periodo_fim,
        precoCentavos: a.preco_centavos,
        praticas: a.praticas_mes + a.praticas_extra,
        praticasUsadas: usadas.get(a.id) ?? null,
        contratadaPeloProfessor: a.pago_por === 'professor',
        encerradaEm: a.encerrada_em,
        motivoEncerramento: a.motivo_encerramento,
      }
    }),
    explorar: (planos ?? []).map((p) => ({
      slug: p.slug,
      nome: p.nome,
      descricao: p.descricao,
      precoCentavos: p.preco_centavos,
      praticasMes: p.praticas_mes,
      professorNome: nomeDoProfessor.get(p.professor_id) ?? 'Professor',
      trilhas: ((p.planos_aluno_trilhas as unknown as { trilhas: { nome: string; nivel: string } | null }[]) ?? [])
        .map((v) => v.trilhas)
        .filter(Boolean),
      assinado: assinadosAtivos.has(p.id),
    })),
  })
}

async function alterarRenovacao(db: Db, alunoIds: string[], assinaturaId: string, cancelar: boolean, motivo: string) {
  const { data: a } = await db
    .from('assinaturas_aluno')
    .select('id, stripe_subscription_id, forma, status')
    .eq('id', assinaturaId)
    .in('aluno_id', alunoIds)
    .maybeSingle()
  if (!a || a.status !== 'ativa') return respostaErro('Assinatura não encontrada.', 404)
  // A contratada pelo professor, quem cancela é ele (§6.2).
  if (a.forma !== 'stripe' || !a.stripe_subscription_id) return respostaErro('Esta assinatura é do seu professor. Fale com ele.', 409)

  await clienteStripe().subscriptions.update(a.stripe_subscription_id, { cancel_at_period_end: cancelar })
  await db
    .from('assinaturas_aluno')
    .update({ cancela_no_fim: cancelar, motivo_cancelamento: cancelar ? (MOTIVOS.includes(motivo) ? motivo : null) : null })
    .eq('id', a.id)
  return respostaJson({ ok: true })
}

async function portal(req: Request, db: Db, userId: string): Promise<Response> {
  const { data: cliente } = await db.from('clientes_stripe').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
  if (!cliente) return respostaErro('Você ainda não tem cartão cadastrado.', 404)
  const sessao = await clienteStripe().billingPortal.sessions.create({
    customer: cliente.stripe_customer_id,
    return_url: `${appUrlDaRequisicao(req)}/painel/conta`,
  })
  return respostaJson({ url: sessao.url })
}
