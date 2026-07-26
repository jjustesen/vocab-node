// Deno Edge Function — fecha a tarefa e devolve o placar final. Sem sessão.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { resolverAtribuicao } from '../_shared/atribuicao.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { token?: unknown; atribuicao_id?: unknown; access_token?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const db = clienteAdmin()
  const atribuicao = await resolverAtribuicao(corpo, db)

  if (!atribuicao) return respostaErro('Link inválido ou expirado.', 404)
  if (atribuicao.revogada_em) return respostaErro('Este link foi desativado pelo professor.', 410)

  const [{ count: totalQuestoes }, { data: respostas }] = await Promise.all([
    db
      .from('questoes')
      .select('*', { count: 'exact', head: true })
      .eq('atividade_id', atribuicao.atividade_id),
    db.from('respostas').select('correta, tempo_ms').eq('atribuicao_id', atribuicao.id),
  ])

  const total = totalQuestoes ?? 0
  const respondidas = respostas?.length ?? 0

  // Defesa contra cliente adulterado: só marca concluída se todas as
  // questões têm resposta gravada — nunca confiamos só no que o front manda.
  if (respondidas < total) {
    return respostaErro(`Ainda faltam ${total - respondidas} questão(ões) para concluir.`, 409)
  }

  if (!atribuicao.concluida_em) {
    await db.from('atribuicoes').update({ concluida_em: new Date().toISOString() }).eq('id', atribuicao.id)
  }

  const acertos = respostas?.filter((r) => r.correta).length ?? 0
  const tempoTotalMs = respostas?.reduce((soma, r) => soma + (r.tempo_ms ?? 0), 0) ?? null

  return respostaJson({
    acertos,
    total,
    tempo_total_ms: tempoTotalMs,
    proxima_etapa: await proximaEtapaDaTrilha(db, atribuicao),
  })
})

type ProximaEtapa = {
  atribuicao_id: string
  titulo: string
  ordem: number
  total_etapas: number
  trilha_nome: string
  /** Quantas etapas o aluno já fechou, incluindo a que acabou de concluir. */
  etapas_concluidas: number
  total_questoes: number
}

/**
 * RF-139: emendar a trilha numa sentada. Devolve a próxima etapa ainda não
 * concluída deste aluno na mesma trilha.
 *
 * Só serve ao aluno LOGADO: a continuação abre por `atribuicao_id`, e o token
 * do link anônimo não é recuperável (só o hash fica no banco). Para quem entrou
 * por link, o front simplesmente não mostra o botão.
 */
async function proximaEtapaDaTrilha(
  // deno-lint-ignore no-explicit-any
  db: any,
  atribuicao: { trilha_etapa_id: string | null; aluno_id: string },
): Promise<ProximaEtapa | null> {
  if (!atribuicao.trilha_etapa_id) return null

  const { data: etapaAtual } = await db
    .from('trilha_etapas')
    .select('trilha_id, ordem')
    .eq('id', atribuicao.trilha_etapa_id)
    .maybeSingle()
  if (!etapaAtual) return null

  const { data: trilha } = await db
    .from('trilhas')
    .select('nome')
    .eq('id', etapaAtual.trilha_id)
    .maybeSingle()

  const { data: etapas } = await db
    .from('trilha_etapas')
    .select('id, ordem, atividade_id')
    .eq('trilha_id', etapaAtual.trilha_id)
    .order('ordem')
  if (!etapas || etapas.length === 0) return null

  // A "próxima" é a primeira etapa DEPOIS desta que ainda não foi concluída —
  // e não simplesmente `ordem + 1`, que travaria o aluno se ele tivesse pulado
  // uma etapa (RF-135: a ordem é sugestão, não trava).
  const seguintes = etapas.filter((e: { ordem: number }) => e.ordem > etapaAtual.ordem)

  // Uma consulta cobre as duas necessidades: achar a próxima pendente e contar
  // quantas etapas o aluno já fechou (a barra segmentada da tela de fim).
  const { data: doAluno } = await db
    .from('atribuicoes')
    .select('id, trilha_etapa_id, atividade_id, concluida_em, revogada_em, enviada_em')
    .eq('aluno_id', atribuicao.aluno_id)
    .in('trilha_etapa_id', etapas.map((e: { id: string }) => e.id))
    .order('enviada_em', { ascending: false })

  // Só a tentativa mais recente de cada etapa conta: reatribuir a trilha como
  // reforço (RF-122/127) reabre a etapa, e contar tentativas antigas mostraria
  // a trilha como concluída enquanto o aluno ainda tem etapas para fazer.
  const concluidasPorEtapa = new Set<string>()
  const jaVistas = new Set<string>()
  for (const a of doAluno ?? []) {
    if (jaVistas.has(a.trilha_etapa_id)) continue
    jaVistas.add(a.trilha_etapa_id)
    if (a.concluida_em) concluidasPorEtapa.add(a.trilha_etapa_id)
  }

  // Pela mesma razão, a próxima etapa é buscada entre as atribuições mais
  // recentes — uma tentativa antiga em aberto não é o que o aluno deve abrir.
  const idsSeguintes = new Set(seguintes.map((e: { id: string }) => e.id))
  const recentesPorEtapa = new Map<string, (typeof doAluno)[number]>()
  for (const a of doAluno ?? []) {
    if (!recentesPorEtapa.has(a.trilha_etapa_id)) recentesPorEtapa.set(a.trilha_etapa_id, a)
  }
  const pendentes = [...recentesPorEtapa.values()].filter(
    (a) => idsSeguintes.has(a.trilha_etapa_id) && !a.concluida_em && !a.revogada_em,
  )
  if (pendentes.length === 0) return null

  const ordemPorEtapa = new Map(etapas.map((e: { id: string; ordem: number }) => [e.id, e.ordem]))
  const proxima = pendentes.sort(
    (a: { trilha_etapa_id: string }, b: { trilha_etapa_id: string }) =>
      (ordemPorEtapa.get(a.trilha_etapa_id) ?? 0) - (ordemPorEtapa.get(b.trilha_etapa_id) ?? 0),
  )[0]

  const [{ data: atividade }, { count: totalQuestoes }] = await Promise.all([
    db.from('atividades').select('titulo').eq('id', proxima.atividade_id).maybeSingle(),
    db
      .from('questoes')
      .select('*', { count: 'exact', head: true })
      .eq('atividade_id', proxima.atividade_id),
  ])

  return {
    atribuicao_id: proxima.id,
    titulo: atividade?.titulo ?? 'Próxima etapa',
    ordem: (ordemPorEtapa.get(proxima.trilha_etapa_id) as number) ?? 0,
    total_etapas: etapas.length,
    trilha_nome: trilha?.nome ?? 'Sua trilha',
    etapas_concluidas: concluidasPorEtapa.size,
    total_questoes: totalQuestoes ?? 0,
  }
}
