// Deno Edge Function — o tutor oral para o ALUNO logado (JWT próprio, cliente
// separado em lib/supabase-aluno.ts). Mesma identidade de painel-aluno-obter:
// o JWT diz quem é, `contas_aluno` diz de qual professor, e daí em diante tudo
// é lido com service_role (o RLS deste banco serve só ao professor).
//
// Ouvir, avaliar e falar são os mesmos do laboratório (_shared/tutor/). O que
// esta porta acrescenta é QUEM pode e QUANTO:
//
//   licoes       → as lições liberadas para o aluno e quantas sessões restam
//   licao        → o roteiro de uma lição liberada (não abre sessão)
//   iniciar      → abre uma sessão — é ela que conta no limite do mês
//   avaliar      → um turno do aluno, dentro de uma sessão aberta
//   falar_stream → a voz do tutor, dentro de uma sessão aberta
//   concluir     → grava o resumo do fim da aula
//
// Toda chamada confere de novo se o tutor continua ligado: o professor que
// desliga no meio da aula corta o próximo turno, não o próximo mês.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { avaliarTurno } from '../_shared/tutor/avaliar.ts'
import { type Custo, ErroDePedido } from '../_shared/tutor/comum.ts'
import { falarEmStream, type Parte, textoDaFala } from '../_shared/tutor/falar.ts'
import { custoEmUsd, gastoPorServico } from '../_shared/tutor/precos.ts'

/** Uma aula do roteiro leva ~15 min; 2 h é a aba esquecida aberta, não uma aula. */
const DURACAO_MAX_MS = 2 * 60 * 60 * 1000
/** Uma sessão normal fica em centavos. Acima disto, algo está em loop. */
const TETO_POR_SESSAO_USD = 0.5
/** O contexto de um turno tem ~1–2 KB; muito acima disso não é o controlador. */
const CONTEXTO_MAX = 16 * 1024

type Acao = 'licoes' | 'licao' | 'iniciar' | 'avaliar' | 'falar_stream' | 'concluir'

type Pedido = {
  acao?: Acao
  licaoId?: string
  sessaoId?: string
  // avaliar
  itemId?: string
  audio?: { base64: string; mimeType: string }
  texto?: string
  contexto?: Record<string, unknown>
  // falar_stream
  fala?: Parte[]
  // concluir
  resumo?: unknown
}

type Db = ReturnType<typeof clienteAdmin>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)

  let pedido: Pedido
  try {
    pedido = await req.json()
  } catch {
    return respostaErro('Corpo inválido.')
  }

  const dbAluno = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao, error: erroSessao } = await dbAluno.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  const db = clienteAdmin()

  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id, professor_id')
    .eq('user_id', sessao.user.id)
    .maybeSingle()
  if (!conta) return respostaErro('Conta não encontrada.', 404)

  const [{ data: aluno }, { data: acesso }, { data: professor }] = await Promise.all([
    db.from('alunos').select('tutor_ativo, status').eq('id', conta.aluno_id).single(),
    db.from('tutor_acesso').select('max_sessoes_mes').eq('professor_id', conta.professor_id).maybeSingle(),
    db
      .from('professores')
      .select('tutor_voz_natural, tutor_escuta_automatica, tutor_sessoes_mes')
      .eq('id', conta.professor_id)
      .single(),
  ])
  if (!aluno?.tutor_ativo || aluno.status !== 'ativo' || !acesso || !professor) {
    return respostaErro('O tutor não está ligado para você. Fale com seu professor.', 403)
  }

  const limite = Math.min(professor.tutor_sessoes_mes, acesso.max_sessoes_mes)
  const ctx = { db, alunoId: conta.aluno_id as string, professorId: conta.professor_id as string, limite, professor }

  try {
    switch (pedido.acao) {
      case 'licoes':
        return await listarLicoes(ctx)
      case 'licao':
        return await abrirLicao(ctx, pedido)
      case 'iniciar':
        return await iniciar(ctx, pedido)
      case 'avaliar':
        return await avaliar(ctx, pedido)
      case 'falar_stream':
        return await falar(ctx, pedido)
      case 'concluir':
        return await concluir(ctx, pedido)
      default:
        return respostaErro('Ação desconhecida.')
    }
  } catch (e) {
    if (e instanceof ErroDePedido) return respostaErro(e.message, e.status)
    console.error('tutor-aluno:', e)
    return respostaErro(e instanceof Error ? e.message : 'Falha ao falar com a IA.', 502)
  }
})

type Contexto = {
  db: Db
  alunoId: string
  professorId: string
  limite: number
  professor: { tutor_voz_natural: boolean; tutor_escuta_automatica: boolean }
}

// ── Lições ───────────────────────────────────────────────────────────────────

async function listarLicoes({ db, alunoId, limite }: Contexto): Promise<Response> {
  const { data: liberadas } = await db.from('tutor_licoes_alunos').select('licao_id').eq('aluno_id', alunoId)
  const ids = (liberadas ?? []).map((l) => l.licao_id as string)

  const [{ data: licoes }, { data: sessoes }, usadas] = await Promise.all([
    ids.length
      ? db
          .from('tutor_licoes')
          .select('id, titulo, descricao, nivel_cefr, ordem')
          .in('id', ids)
          .eq('publicada', true)
          .order('ordem')
      : Promise.resolve({ data: [] as { id: string; titulo: string; descricao: string | null; nivel_cefr: string | null }[] }),
    db
      .from('tutor_sessoes')
      .select('licao_id, iniciada_em, concluida_em, resumo')
      .eq('aluno_id', alunoId)
      .order('iniciada_em', { ascending: false })
      .limit(200),
    sessoesDoMes(db, alunoId),
  ])

  // A mais recente de cada lição — a lista já vem do mais novo para o mais velho.
  const ultima = new Map<string, { em: string; concluida: boolean; resumo: Resumo | null }>()
  for (const s of sessoes ?? []) {
    if (ultima.has(s.licao_id)) continue
    ultima.set(s.licao_id, { em: s.concluida_em ?? s.iniciada_em, concluida: Boolean(s.concluida_em), resumo: s.resumo })
  }

  return respostaJson({
    licoes: (licoes ?? []).map((l) => ({
      id: l.id,
      titulo: l.titulo,
      descricao: l.descricao,
      nivel: l.nivel_cefr,
      ultima: ultima.get(l.id) ?? null,
    })),
    limite,
    restantes: Math.max(0, limite - usadas),
  })
}

async function abrirLicao(ctx: Contexto, pedido: Pedido): Promise<Response> {
  const licao = await licaoLiberada(ctx, pedido.licaoId)
  const usadas = await sessoesDoMes(ctx.db, ctx.alunoId)
  return respostaJson({
    licao: { id: licao.id, titulo: licao.titulo, nivel: licao.nivel_cefr },
    roteiro: licao.roteiro,
    falasGravadas: licao.falas_gravadas,
    urlFalas: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/tutor-falas/`,
    opcoes: { vozNatural: ctx.professor.tutor_voz_natural, escutaAutomatica: ctx.professor.tutor_escuta_automatica },
    restantes: Math.max(0, ctx.limite - usadas),
  })
}

async function licaoLiberada({ db, alunoId }: Contexto, licaoId: string | undefined) {
  if (!licaoId) throw new ErroDePedido('Falta a lição.')
  const [{ data: vinculo }, { data: licao }] = await Promise.all([
    db.from('tutor_licoes_alunos').select('licao_id').eq('aluno_id', alunoId).eq('licao_id', licaoId).maybeSingle(),
    db
      .from('tutor_licoes')
      .select('id, titulo, nivel_cefr, roteiro, falas_gravadas')
      .eq('id', licaoId)
      .eq('publicada', true)
      .maybeSingle(),
  ])
  if (!vinculo || !licao) throw new ErroDePedido('Esta lição não está liberada para você.', 404)
  return licao
}

// ── Sessão ───────────────────────────────────────────────────────────────────

async function iniciar(ctx: Contexto, pedido: Pedido): Promise<Response> {
  const licao = await licaoLiberada(ctx, pedido.licaoId)
  const usadas = await sessoesDoMes(ctx.db, ctx.alunoId)
  if (usadas >= ctx.limite) {
    throw new ErroDePedido(`Você já fez as ${ctx.limite} sessões deste mês. No mês que vem tem mais!`, 429)
  }
  const { data, error } = await ctx.db
    .from('tutor_sessoes')
    .insert({ aluno_id: ctx.alunoId, professor_id: ctx.professorId, licao_id: licao.id })
    .select('id')
    .single()
  if (error || !data) throw new Error('Não consegui abrir a sessão.')
  return respostaJson({ sessaoId: data.id, restantes: Math.max(0, ctx.limite - usadas - 1) })
}

/** A sessão aberta DESTE aluno, ainda dentro do tempo e do teto de custo. */
async function sessaoAberta({ db, alunoId }: Contexto, sessaoId: string | undefined) {
  if (!sessaoId) throw new ErroDePedido('Falta a sessão.')
  const { data: s } = await db
    .from('tutor_sessoes')
    .select('id, licao_id, iniciada_em, concluida_em, custo_usd')
    .eq('id', sessaoId)
    .eq('aluno_id', alunoId)
    .maybeSingle()
  if (!s) throw new ErroDePedido('Sessão não encontrada.', 404)
  if (s.concluida_em) throw new ErroDePedido('Esta sessão já terminou.', 410)
  if (Date.now() - new Date(s.iniciada_em).getTime() > DURACAO_MAX_MS) {
    throw new ErroDePedido('A sessão expirou. Comece a lição de novo.', 410)
  }
  if (Number(s.custo_usd) >= TETO_POR_SESSAO_USD) {
    throw new ErroDePedido('Esta sessão ficou longa demais. Comece a lição de novo.', 429)
  }
  return s
}

async function avaliar(ctx: Contexto, pedido: Pedido): Promise<Response> {
  const s = await sessaoAberta(ctx, pedido.sessaoId)
  if (pedido.contexto && JSON.stringify(pedido.contexto).length > CONTEXTO_MAX) {
    throw new ErroDePedido('Contexto grande demais.', 413)
  }

  // O roteiro vem do banco: é ele que diz quais itens existem e quais notas de
  // gramática o avaliador respeita — o navegador não escolhe o prompt.
  const { data: licao } = await ctx.db.from('tutor_licoes').select('roteiro').eq('id', s.licao_id).single()
  const roteiro = (licao?.roteiro ?? {}) as Roteiro
  if (!pedido.itemId || !idsDoRoteiro(roteiro).has(pedido.itemId)) {
    throw new ErroDePedido('Item fora desta lição.')
  }

  const chave = chaveGemini()
  const resultado = await avaliarTurno(chave, {
    audio: pedido.audio,
    texto: pedido.texto,
    contexto: pedido.contexto,
    notasDoMaterial: roteiro.notasParaAvaliador,
  })
  await somarGasto(ctx.db, s.id, resultado.custos)
  return respostaJson(resultado)
}

async function falar(ctx: Contexto, pedido: Pedido): Promise<Response> {
  // Com a voz natural desligada a página usa a voz do aparelho; pedir o
  // Gemini mesmo assim é contornar a escolha do professor (e o custo dele).
  if (!ctx.professor.tutor_voz_natural) throw new ErroDePedido('A voz natural está desligada.', 403)
  const s = await sessaoAberta(ctx, pedido.sessaoId)
  const texto = textoDaFala(pedido.fala)
  return await falarEmStream(chaveGemini(), texto, (custos) => somarGasto(ctx.db, s.id, custos))
}

async function concluir(ctx: Contexto, pedido: Pedido): Promise<Response> {
  if (!pedido.sessaoId) throw new ErroDePedido('Falta a sessão.')
  const resumo = resumoLimpo(pedido.resumo)
  const { data } = await ctx.db
    .from('tutor_sessoes')
    .update({ concluida_em: new Date().toISOString(), resumo })
    .eq('id', pedido.sessaoId)
    .eq('aluno_id', ctx.alunoId)
    .is('concluida_em', null)
    .select('id')
    .maybeSingle()
  // Concluir duas vezes (o "Refazer" no meio de um envio lento) não é erro.
  return respostaJson({ ok: true, gravado: Boolean(data) })
}

// ── Apoio ────────────────────────────────────────────────────────────────────

type Resumo = { autonomos: string[]; comAjuda: string[]; pendentes: string[]; paraRevisar: string[]; recuperadas: string[] }

/** O resumo vem do navegador: só listas curtas de textos curtos entram no banco. */
function resumoLimpo(bruto: unknown): Resumo {
  const r = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const lista = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === 'string')
      .slice(0, 60)
      .map((x) => x.slice(0, 300))
  return {
    autonomos: lista(r.autonomos),
    comAjuda: lista(r.comAjuda),
    pendentes: lista(r.pendentes),
    paraRevisar: lista(r.paraRevisar),
    recuperadas: lista(r.recuperadas),
  }
}

/** O pedaço do `Roteiro` (poc-tutor/src/tipos.ts) que a função precisa ler. */
type Roteiro = {
  notasParaAvaliador?: string
  blocos?: { itens?: { id: string }[] }[]
  apoios?: Record<string, { degraus?: { id: string }[] }>
  conversa?: { id: string }[]
  recuperacao?: Record<string, { id: string }>
}

function idsDoRoteiro(r: Roteiro): Set<string> {
  const ids = new Set<string>()
  for (const b of r.blocos ?? []) for (const i of b.itens ?? []) ids.add(i.id)
  for (const a of Object.values(r.apoios ?? {})) for (const d of a.degraus ?? []) ids.add(d.id)
  for (const i of r.conversa ?? []) ids.add(i.id)
  for (const i of Object.values(r.recuperacao ?? {})) ids.add(i.id)
  return ids
}

async function somarGasto(db: Db, sessaoId: string, custos: Custo[]) {
  if (!custos.length) return
  const { error } = await db.rpc('tutor_somar_gasto', {
    p_sessao: sessaoId,
    p_custo_usd: custoEmUsd(custos),
    p_gasto: gastoPorServico(custos),
  })
  if (error) console.error('tutor-aluno somar gasto:', error)
}

/** Sessões abertas neste mês — o mês do Brasil, não o do servidor (UTC). */
async function sessoesDoMes(db: Db, alunoId: string): Promise<number> {
  const { count } = await db
    .from('tutor_sessoes')
    .select('id', { count: 'exact', head: true })
    .eq('aluno_id', alunoId)
    .gte('iniciada_em', inicioDoMesNoBrasil())
  return count ?? 0
}

function inicioDoMesNoBrasil(): string {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date())
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value
  // O Brasil não tem horário de verão desde 2019: meia-noite é sempre -03:00.
  return new Date(`${parte('year')}-${parte('month')}-01T00:00:00-03:00`).toISOString()
}

function chaveGemini(): string {
  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) throw new Error('GEMINI_API_KEY não configurada.')
  return chave
}
