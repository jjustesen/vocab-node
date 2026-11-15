// Deno Edge Function — o job diário da venda do tutor (docs/TUTOR-TRILHAS.md
// §5.1 e §5.4). Chamado pelo agendador do banco (pg_cron + pg_net), uma vez
// por dia; pode rodar de novo sem estrago.
//
// DEPLOY: `supabase functions deploy repasses-diario --no-verify-jwt`.
// Quem chama prova com o cabeçalho `x-cron-secret` = secret CRON_SECRET.
//
//   1. Plano contratado pelo professor que venceu: renova debitando os
//      créditos; sem saldo, ou marcado para não renovar, encerra.
//   2. Cobranças cujo período terminou: calcula o repasse (valor − tarifa do
//      cartão − taxa − IA real do período − estorno) e transfere para a conta
//      Connect do professor. Sem conta pronta, fica 'sem_conta' e tenta amanhã.
//      Negativo: a diferença sai dos créditos do professor.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { respostaErro, respostaJson } from '../_shared/cors.ts'
import { clienteStripe } from '../_shared/stripe.ts'
import { debitarCreditos, SemCreditos } from '../_shared/creditos.ts'
import { custoIaDoPeriodo, encerrarAssinatura, taxaCentavos, umMesDepois } from '../_shared/assinatura-aluno.ts'

type Db = ReturnType<typeof clienteAdmin>

Deno.serve(async (req) => {
  const segredo = Deno.env.get('CRON_SECRET')
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) return respostaErro('Não autorizado.', 401)

  const db = clienteAdmin()
  const renovadas = await renovarContratadas(db)
  const repasses = await fazerRepasses(db)
  console.log('repasses-diario:', JSON.stringify({ renovadas, repasses }))
  return respostaJson({ renovadas, repasses })
})

async function renovarContratadas(db: Db) {
  const { data: vencidas } = await db
    .from('assinaturas_aluno')
    .select('id, plano_id, professor_id, aluno_id, periodo_fim, preco_centavos, cancela_no_fim, planos_aluno(nome, preco_centavos, praticas_mes), alunos(nome)')
    .eq('forma', 'creditos')
    .eq('status', 'ativa')
    .lte('periodo_fim', new Date().toISOString())
  const resultado = { renovadas: 0, encerradas: 0 }

  for (const a of vencidas ?? []) {
    if (a.cancela_no_fim) {
      await encerrarAssinatura(db, a.id, 'cancelada')
      resultado.encerradas++
      continue
    }
    const plano = a.planos_aluno as unknown as { nome: string; preco_centavos: number; praticas_mes: number }
    const aluno = a.alunos as unknown as { nome: string }
    const inicio = a.periodo_fim
    const fim = umMesDepois(inicio)
    try {
      await debitarCreditos(db, a.professor_id, plano.preco_centavos / 100, 'assinatura', `${a.id}:${inicio}`, `Plano ${plano.nome} para ${aluno.nome} (renovação)`)
    } catch (e) {
      if (!(e instanceof SemCreditos)) throw e
      // Sem saldo: termina como uma cobrança recusada (§5.4).
      await encerrarAssinatura(db, a.id, 'sem_creditos')
      resultado.encerradas++
      continue
    }
    await db
      .from('assinaturas_aluno')
      .update({ periodo_inicio: inicio, periodo_fim: fim, preco_centavos: plano.preco_centavos, praticas_mes: plano.praticas_mes, praticas_extra: 0 })
      .eq('id', a.id)
    await db.from('cobrancas_aluno').insert({
      assinatura_id: a.id,
      professor_id: a.professor_id,
      aluno_id: a.aluno_id,
      periodo_inicio: inicio,
      periodo_fim: fim,
      valor_centavos: plano.preco_centavos,
      tarifa_centavos: 0,
    })
    resultado.renovadas++
  }
  return resultado
}

async function fazerRepasses(db: Db) {
  const { data: vencidas } = await db
    .from('cobrancas_aluno')
    .select('*')
    .in('status', ['aguardando', 'sem_conta'])
    .lte('periodo_fim', new Date().toISOString())
    .order('periodo_fim')
    .limit(200)
  const stripe = clienteStripe()
  const contas = new Map<string, { id: string; pronta: boolean } | null>()
  const resultado = { transferidos: 0, semConta: 0, negativos: 0, falhas: 0 }

  for (const c of vencidas ?? []) {
    try {
      // Tarifa e estorno vêm da cobrança no Stripe; o plano pago com créditos não tem.
      let tarifa = c.tarifa_centavos ?? 0
      let estorno = 0
      if (c.stripe_charge_id) {
        const carga = await stripe.charges.retrieve(c.stripe_charge_id, { expand: ['balance_transaction'] })
        const bt = carga.balance_transaction as { fee?: number } | null
        tarifa = bt?.fee ?? 0
        estorno = carga.amount_refunded + (carga.disputed ? carga.amount - carga.amount_refunded : 0)
      }
      const taxa = taxaCentavos(c.valor_centavos)
      const ia = await custoIaDoPeriodo(db, c)
      const liquido = c.valor_centavos - tarifa - taxa - ia - estorno
      const base = { tarifa_centavos: tarifa, taxa_centavos: taxa, custo_ia_centavos: ia, estorno_centavos: estorno }

      if (estorno >= c.valor_centavos) {
        await db.from('cobrancas_aluno').update({ ...base, repasse_centavos: 0, status: 'estornado', repassado_em: new Date().toISOString() }).eq('id', c.id)
        continue
      }
      if (liquido <= 0) {
        // §5.1, repasse negativo: a diferença sai dos créditos. Sem saldo, o
        // débito fica para a próxima compra de créditos (acerto manual por ora).
        if (liquido < 0) {
          await debitarCreditos(db, c.professor_id, -liquido / 100, 'assinatura', `repasse:${c.id}`, 'IA acima do repasse de um assinante').catch(
            (e) => console.error('repasse negativo sem saldo:', c.id, e),
          )
        }
        await db
          .from('cobrancas_aluno')
          .update({ ...base, repasse_centavos: 0, debito_creditos: liquido < 0 ? -liquido / 100 : 0, status: 'negativo', repassado_em: new Date().toISOString() })
          .eq('id', c.id)
        resultado.negativos++
        continue
      }

      if (!contas.has(c.professor_id)) {
        const { data } = await db.from('contas_recebimento').select('stripe_account_id, pronta').eq('professor_id', c.professor_id).maybeSingle()
        contas.set(c.professor_id, data ? { id: data.stripe_account_id, pronta: data.pronta } : null)
      }
      const conta = contas.get(c.professor_id)
      if (!conta?.pronta) {
        await db.from('cobrancas_aluno').update({ ...base, repasse_centavos: liquido, status: 'sem_conta' }).eq('id', c.id)
        resultado.semConta++
        continue
      }

      const transferencia = await stripe.transfers.create(
        {
          amount: liquido,
          currency: 'brl',
          destination: conta.id,
          ...(c.stripe_charge_id ? { source_transaction: c.stripe_charge_id } : {}),
          metadata: { cobranca_id: c.id, assinatura_id: c.assinatura_id },
        },
        // Rodar duas vezes no mesmo dia não transfere duas vezes.
        { idempotencyKey: `repasse-${c.id}` },
      )
      await db
        .from('cobrancas_aluno')
        .update({ ...base, repasse_centavos: liquido, stripe_transfer_id: transferencia.id, status: 'transferido', repassado_em: new Date().toISOString() })
        .eq('id', c.id)
      resultado.transferidos++
    } catch (e) {
      console.error('repasse:', c.id, e)
      resultado.falhas++
    }
  }
  return resultado
}
