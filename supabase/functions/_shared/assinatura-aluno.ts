/**
 * Assinatura do aluno (migration 0033, docs/TUTOR-TRILHAS.md §5–§6).
 *
 * Usado pelo webhook (a fonte da verdade do pagamento), pela página de venda,
 * pelo plano contratado pelo professor e pelo job diário do repasse.
 */
import type Stripe from 'npm:stripe@18'
import type { clienteAdmin } from './cliente-admin.ts'
import { REAIS_POR_DOLAR } from './creditos.ts'

type Db = ReturnType<typeof clienteAdmin>

/** Marca as assinaturas do Stripe que são de aluno, e não do plano do professor. */
export const TIPO_PLANO_ALUNO = 'plano_aluno'

/** Taxa da plataforma: 10%, mínimo de R$ 6 (§5.1). Espelha `taxa_da_plataforma_centavos` (0031). */
export function taxaCentavos(precoCentavos: number): number {
  return Math.max(Math.ceil(precoCentavos * 0.1), 600)
}

/** Início e fim do período atual. Na API recente o período mora no item, não na assinatura. */
export function periodoDa(sub: Stripe.Subscription): { inicio: string; fim: string } {
  const item = sub.items.data[0] as unknown as { current_period_start?: number; current_period_end?: number }
  const raiz = sub as unknown as { current_period_start?: number; current_period_end?: number }
  const inicio = item?.current_period_start ?? raiz.current_period_start ?? sub.start_date
  const fim = item?.current_period_end ?? raiz.current_period_end ?? inicio + 30 * 86400
  return { inicio: new Date(inicio * 1000).toISOString(), fim: new Date(fim * 1000).toISOString() }
}

export function umMesDepois(iso: string): string {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

/**
 * O aluno deste professor ligado a este login, criando o que faltar:
 *   1. já tem conta com o professor → esse aluno;
 *   2. o professor já tem um aluno com o e-mail, sem conta → liga a conta a ele;
 *   3. senão → aluno novo, `origem = 'loja'` (fora do limite do plano do professor).
 */
export async function alunoDoLogin(
  db: Db,
  { professorId, userId, email, nome }: { professorId: string; userId: string; email: string; nome: string },
): Promise<string> {
  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id')
    .eq('professor_id', professorId)
    .eq('user_id', userId)
    .maybeSingle()
  if (conta) return conta.aluno_id as string

  const { data: semConta } = await db
    .from('alunos')
    .select('id, contas_aluno(id)')
    .eq('professor_id', professorId)
    .ilike('email', email)
    .limit(5)
  const livre = (semConta ?? []).find((a) => !(a.contas_aluno as unknown[] | null)?.length)
  let alunoId = livre?.id as string | undefined
  if (!alunoId) {
    const { data: novo, error } = await db
      .from('alunos')
      .insert({ professor_id: professorId, nome, email, origem: 'loja' })
      .select('id')
      .single()
    if (error || !novo) throw new Error(`aluno: ${error?.message}`)
    alunoId = novo.id as string
  }
  const { error } = await db.from('contas_aluno').insert({ aluno_id: alunoId, professor_id: professorId, user_id: userId, email })
  if (error && error.code !== '23505') throw new Error(`contas_aluno: ${error.message}`)
  await db.from('eventos_acesso_aluno').insert({ aluno_id: alunoId, tipo: 'conta_criada', email_novo: email })
  return alunoId
}

/** O login deste e-mail; sem login, cria um sem senha, com o e-mail já confirmado (§6). */
export async function loginDoEmail(db: Db, email: string, nome: string): Promise<{ userId: string; novo: boolean }> {
  const { data: existente } = await db.rpc('usuario_por_email', { p_email: email })
  if (existente) return { userId: existente as string, novo: false }
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { nome } })
  if (error || !data.user) {
    // Corrida com outro evento do mesmo checkout: o usuário acabou de nascer.
    const { data: deNovo } = await db.rpc('usuario_por_email', { p_email: email })
    if (deNovo) return { userId: deNovo as string, novo: false }
    throw new Error(`createUser: ${error?.message}`)
  }
  return { userId: data.user.id, novo: true }
}

export type AssinaturaRow = {
  id: string
  plano_id: string
  professor_id: string
  aluno_id: string
  status: 'ativa' | 'encerrada'
  periodo_inicio: string
  periodo_fim: string
  preco_centavos: number
  conta_nova: boolean
  login_trocado_em: string | null
  cancela_no_fim: boolean
}

/**
 * A assinatura do Stripe na nossa tabela, criando conta, aluno e matrícula na
 * primeira vez. Idempotente pelo id da assinatura do Stripe: o checkout e a
 * primeira fatura chegam em qualquer ordem, e cada evento pode chegar duas vezes.
 */
export async function garantirAssinatura(db: Db, sub: Stripe.Subscription): Promise<AssinaturaRow | null> {
  const meta = sub.metadata ?? {}
  if (meta.tipo !== TIPO_PLANO_ALUNO) return null
  const periodo = periodoDa(sub)

  const { data: existente } = await db.from('assinaturas_aluno').select('*').eq('stripe_subscription_id', sub.id).maybeSingle()
  if (existente) {
    // Período novo: as práticas avulsas eram do anterior.
    const virou = existente.periodo_inicio !== periodo.inicio && new Date(periodo.inicio) > new Date(existente.periodo_inicio)
    const { data } = await db
      .from('assinaturas_aluno')
      .update({
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
        cancela_no_fim: sub.cancel_at_period_end,
        ...(virou ? { praticas_extra: 0 } : {}),
      })
      .eq('id', existente.id)
      .select('*')
      .single()
    return (data ?? existente) as AssinaturaRow
  }

  const { data: plano } = await db
    .from('planos_aluno')
    .select('id, professor_id, nome, preco_centavos, praticas_mes')
    .eq('id', meta.plano_id)
    .single()
  if (!plano) throw new Error(`plano ${meta.plano_id} não existe`)

  const email = String(meta.email ?? '').trim().toLowerCase()
  const nome = String(meta.nome ?? '').trim() || email.split('@')[0]
  const login = meta.user_id ? { userId: meta.user_id, novo: false } : await loginDoEmail(db, email, nome)
  const alunoId = await alunoDoLogin(db, { professorId: plano.professor_id, userId: login.userId, email, nome })

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  await db.from('clientes_stripe').upsert({ user_id: login.userId, stripe_customer_id: customerId }, { onConflict: 'user_id', ignoreDuplicates: true })

  const { data: criada, error } = await db
    .from('assinaturas_aluno')
    .insert({
      plano_id: plano.id,
      professor_id: plano.professor_id,
      aluno_id: alunoId,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      preco_centavos: plano.preco_centavos,
      praticas_mes: plano.praticas_mes,
      stripe_subscription_id: sub.id,
      cancela_no_fim: sub.cancel_at_period_end,
      conta_nova: login.novo,
    })
    .select('*')
    .single()
  if (error) {
    // O outro evento ganhou a corrida.
    const { data } = await db.from('assinaturas_aluno').select('*').eq('stripe_subscription_id', sub.id).maybeSingle()
    if (data) return data as AssinaturaRow
    throw new Error(`assinaturas_aluno: ${error.message}`)
  }
  const { error: erroAtivar } = await db.rpc('ativar_assinatura_aluno', { p_assinatura: criada.id })
  if (erroAtivar) throw new Error(`ativar: ${erroAtivar.message}`)
  return criada as AssinaturaRow
}

export async function encerrarAssinatura(db: Db, assinaturaId: string, motivo: string) {
  const { error } = await db.rpc('encerrar_assinatura_aluno', { p_assinatura: assinaturaId, p_motivo: motivo })
  if (error) throw new Error(`encerrar: ${error.message}`)
}

/** Custo de IA real do aluno com este professor no período (centavos, arredondado para cima). */
export async function custoIaDoPeriodo(db: Db, c: { aluno_id: string; professor_id: string; periodo_inicio: string; periodo_fim: string }) {
  const { data } = await db
    .from('tutor_sessoes')
    .select('custo_usd')
    .eq('aluno_id', c.aluno_id)
    .eq('professor_id', c.professor_id)
    .eq('teste', false)
    .gte('iniciada_em', c.periodo_inicio)
    .lt('iniciada_em', c.periodo_fim)
  const usd = (data ?? []).reduce((t, s) => t + Number(s.custo_usd), 0)
  return Math.ceil(usd * REAIS_POR_DOLAR * 100)
}
