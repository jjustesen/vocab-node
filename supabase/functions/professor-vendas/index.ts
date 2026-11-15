// Deno Edge Function — a venda do tutor, do lado do PROFESSOR logado
// (verify-jwt ligado). docs/TUTOR-TRILHAS.md §5.1 e §5.4.
//
//   connect_status   → a conta de recebimento está pronta para receber?
//   connect_link     → cria a conta Express (se não há) e abre o cadastro no Stripe
//   connect_painel   → o painel Express (dados bancários, transferências)
//   contratar        → o professor põe um aluno num plano, pagando com créditos
//   cancelar         → plano contratado: não renova no fim do período
//   dar_praticas     → soma práticas avulsas ao período atual de um assinante
//
// Escritas com service_role: as tabelas da 0033 não têm policy de escrita.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { appUrlDaRequisicao, clienteStripe } from '../_shared/stripe.ts'
import { debitarCreditos, emReais, SemCreditos } from '../_shared/creditos.ts'
import { umMesDepois } from '../_shared/assinatura-aluno.ts'

type Db = ReturnType<typeof clienteAdmin>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)
  const dbProfessor = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao } = await dbProfessor.auth.getUser()
  if (!sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)
  const professorId = sessao.user.id

  const db = clienteAdmin()
  const { data: professor } = await db.from('professores').select('nome').eq('id', professorId).maybeSingle()
  if (!professor) return respostaErro('Só professores.', 403)

  const corpo = await req.json().catch(() => ({}))
  try {
    switch (corpo?.acao) {
      case 'connect_status':
        return respostaJson(await statusDaConta(db, professorId))
      case 'connect_link':
        return await linkDeCadastro(req, db, professorId, sessao.user.email ?? undefined)
      case 'connect_painel':
        return await painelExpress(db, professorId)
      case 'contratar':
        return await contratar(db, professorId, String(corpo.alunoId ?? ''), String(corpo.planoId ?? ''))
      case 'cancelar':
        return await cancelar(db, professorId, String(corpo.assinaturaId ?? ''))
      case 'dar_praticas':
        return await darPraticas(db, professorId, String(corpo.assinaturaId ?? ''), Number(corpo.quantidade))
      default:
        return respostaErro('Ação desconhecida.')
    }
  } catch (e) {
    console.error('professor-vendas:', e)
    return respostaErro(e instanceof Error ? e.message : 'Falha inesperada.', 502)
  }
})

// ── Conta de recebimento ────────────────────────────────────────────────────

async function statusDaConta(db: Db, professorId: string) {
  const { data: conta } = await db.from('contas_recebimento').select('stripe_account_id, pronta').eq('professor_id', professorId).maybeSingle()
  if (!conta) return { existe: false, pronta: false }
  // Pergunta ao Stripe: o cadastro pode ter terminado (ou caído) fora daqui.
  const conta2 = await clienteStripe().accounts.retrieve(conta.stripe_account_id)
  const pronta = Boolean(conta2.payouts_enabled && conta2.capabilities?.transfers === 'active')
  if (pronta !== conta.pronta) {
    await db.from('contas_recebimento').update({ pronta, atualizado_em: new Date().toISOString() }).eq('professor_id', professorId)
  }
  return { existe: true, pronta, pendencias: conta2.requirements?.currently_due?.length ?? 0 }
}

async function linkDeCadastro(req: Request, db: Db, professorId: string, email: string | undefined): Promise<Response> {
  const stripe = clienteStripe()
  const { data: conta } = await db.from('contas_recebimento').select('stripe_account_id').eq('professor_id', professorId).maybeSingle()
  let contaId = conta?.stripe_account_id as string | undefined
  if (!contaId) {
    const nova = await stripe.accounts.create({
      type: 'express',
      country: 'BR',
      email,
      capabilities: { transfers: { requested: true } },
      metadata: { professor_id: professorId },
    })
    contaId = nova.id
    await db.from('contas_recebimento').insert({ professor_id: professorId, stripe_account_id: contaId })
  }
  const base = appUrlDaRequisicao(req)
  const link = await stripe.accountLinks.create({
    account: contaId,
    type: 'account_onboarding',
    refresh_url: `${base}/tutor?aba=repasses&connect=refazer`,
    return_url: `${base}/tutor?aba=repasses&connect=voltou`,
  })
  return respostaJson({ url: link.url })
}

async function painelExpress(db: Db, professorId: string): Promise<Response> {
  const { data: conta } = await db.from('contas_recebimento').select('stripe_account_id').eq('professor_id', professorId).maybeSingle()
  if (!conta) return respostaErro('Conecte a conta de recebimento primeiro.', 409)
  const link = await clienteStripe().accounts.createLoginLink(conta.stripe_account_id)
  return respostaJson({ url: link.url })
}

// ── Plano contratado pelo professor (§5.4) ──────────────────────────────────

async function contratar(db: Db, professorId: string, alunoId: string, planoId: string): Promise<Response> {
  const [{ data: aluno }, { data: plano }] = await Promise.all([
    db.from('alunos').select('id, nome').eq('id', alunoId).eq('professor_id', professorId).maybeSingle(),
    db.from('planos_aluno').select('id, nome, preco_centavos, praticas_mes').eq('id', planoId).eq('professor_id', professorId).maybeSingle(),
  ])
  if (!aluno || !plano) return respostaErro('Aluno ou plano não encontrado.', 404)

  const { data: ativa } = await db
    .from('assinaturas_aluno')
    .select('id')
    .eq('plano_id', plano.id)
    .eq('aluno_id', aluno.id)
    .eq('status', 'ativa')
    .maybeSingle()
  if (ativa) return respostaErro(`${aluno.nome} já está neste plano.`, 409)

  const inicio = new Date().toISOString()
  const fim = umMesDepois(inicio)
  const { data: assinatura, error } = await db
    .from('assinaturas_aluno')
    .insert({
      plano_id: plano.id,
      professor_id: professorId,
      aluno_id: aluno.id,
      periodo_inicio: inicio,
      periodo_fim: fim,
      preco_centavos: plano.preco_centavos,
      praticas_mes: plano.praticas_mes,
      pago_por: 'professor',
      forma: 'creditos',
    })
    .select('id')
    .single()
  if (error || !assinatura) return respostaErro('Não consegui criar a assinatura.', 500)

  try {
    await debitarCreditos(db, professorId, plano.preco_centavos / 100, 'assinatura', assinatura.id, `Plano ${plano.nome} para ${aluno.nome}`)
  } catch (e) {
    await db.from('assinaturas_aluno').delete().eq('id', assinatura.id)
    if (e instanceof SemCreditos) {
      return respostaJson(
        {
          erro: `O plano custa ${emReais(plano.preco_centavos / 100)} e seu saldo é ${emReais(e.saldo)}. Adicione créditos.`,
          codigo: 'sem_creditos',
        },
        402,
      )
    }
    throw e
  }

  await db.from('cobrancas_aluno').insert({
    assinatura_id: assinatura.id,
    professor_id: professorId,
    aluno_id: aluno.id,
    periodo_inicio: inicio,
    periodo_fim: fim,
    valor_centavos: plano.preco_centavos,
    tarifa_centavos: 0,
  })
  const { error: erroAtivar } = await db.rpc('ativar_assinatura_aluno', { p_assinatura: assinatura.id })
  if (erroAtivar) throw new Error(`ativar: ${erroAtivar.message}`)
  return respostaJson({ ok: true, assinaturaId: assinatura.id })
}

/** Só a contratada pelo professor: a do aluno, quem cancela é o aluno (Minha conta). */
async function cancelar(db: Db, professorId: string, assinaturaId: string): Promise<Response> {
  const { data } = await db
    .from('assinaturas_aluno')
    .update({ cancela_no_fim: true, motivo_cancelamento: 'professor' })
    .eq('id', assinaturaId)
    .eq('professor_id', professorId)
    .eq('pago_por', 'professor')
    .eq('status', 'ativa')
    .select('id')
    .maybeSingle()
  if (!data) return respostaErro('Assinatura não encontrada.', 404)
  return respostaJson({ ok: true })
}

async function darPraticas(db: Db, professorId: string, assinaturaId: string, quantidade: number): Promise<Response> {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 100) return respostaErro('Escolha de 1 a 100 práticas.')
  const { data: a } = await db
    .from('assinaturas_aluno')
    .select('id, praticas_extra')
    .eq('id', assinaturaId)
    .eq('professor_id', professorId)
    .eq('status', 'ativa')
    .maybeSingle()
  if (!a) return respostaErro('Assinatura não encontrada.', 404)
  await db.from('assinaturas_aluno').update({ praticas_extra: a.praticas_extra + quantidade }).eq('id', a.id)
  return respostaJson({ ok: true })
}
