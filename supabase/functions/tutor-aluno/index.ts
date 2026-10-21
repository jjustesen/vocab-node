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
//
// ── Modo professor ──────────────────────────────────────────────────────────
//
// Com `modo: 'professor'` (e o JWT de um professor no beta), a mesma porta
// serve o "Experimentar como aluno" do editor: abre as lições dele, inclusive
// em rascunho, e as globais publicadas. A sessão nasce com `teste = true`, sem
// aluno — não conta no limite de ninguém — e há um teto de testes por dia.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { avaliarTurno, MODELOS_DE_TRANSCRICAO } from '../_shared/tutor/avaliar.ts'
import { type Custo, ErroDePedido } from '../_shared/tutor/comum.ts'
import { falarEmStream, type Parte, textoDaFala } from '../_shared/tutor/falar.ts'
import { custoEmUsd, gastoPorServico } from '../_shared/tutor/precos.ts'

/** Uma aula do roteiro leva ~15 min; 2 h é a aba esquecida aberta, não uma aula. */
const DURACAO_MAX_MS = 2 * 60 * 60 * 1000
/** Uma sessão normal fica em centavos. Acima disto, algo está em loop. */
const TETO_POR_SESSAO_USD = 0.5
/** O contexto de um turno tem ~1–2 KB; muito acima disso não é o controlador. */
const CONTEXTO_MAX = 16 * 1024
/** Testes do professor em 24 h: experimentar a lição enquanto edita, não dar aula com ela. */
const TESTES_POR_DIA = 30

type Acao = 'licoes' | 'licao' | 'iniciar' | 'avaliar' | 'falar_stream' | 'concluir' | 'token_voz'

/**
 * Transcrição ao vivo: o navegador manda o áudio do aluno ao Gemini Live
 * ENQUANTO ele fala, e quando ele termina o texto já está pronto. A chave do
 * Google não sai daqui: o navegador recebe um token de poucos minutos, preso a
 * este modelo e a esta configuração (só ouvir e transcrever).
 */
const MODELO_VOZ_AO_VIVO = Deno.env.get('TUTOR_MODELO_AO_VIVO') ?? 'gemini-3.8-live'
const TOKEN_VOZ_MINUTOS = 30

type Pedido = {
  acao?: Acao
  /** 'professor': o "Experimentar como aluno" do editor de lições. */
  modo?: 'aluno' | 'professor'
  licaoId?: string
  sessaoId?: string
  // avaliar
  itemId?: string
  audio?: { base64: string; mimeType: string }
  texto?: string
  /** Só no teste do professor: comparar modelos de transcrição. */
  modeloTranscricao?: string
  contexto?: Record<string, unknown>
  // falar_stream
  fala?: Parte[]
  // concluir
  resumo?: unknown
}

type Db = ReturnType<typeof clienteAdmin>

/** Supabase: segura a função viva depois da resposta (o gasto é gravado sem o aluno esperar). */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

function depoisDeResponder(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(p)
  else void p
}

/**
 * Quem está chamando, lido do próprio JWT. A assinatura e a validade já foram
 * conferidas pelo gateway (a função é publicada com verify-jwt ligado), então
 * perguntar de novo ao Auth (`getUser`) era uma viagem a mais em todo turno.
 * A chave anon também passa no gateway: ela não tem `sub`, e cai aqui.
 */
function usuarioDoJwt(autorizacao: string): string | null {
  try {
    const carga = autorizacao.replace(/^Bearer\s+/i, '').split('.')[1]
    const json = JSON.parse(atob(carga.replace(/-/g, '+').replace(/_/g, '/')))
    if (json.role !== 'authenticated' || typeof json.sub !== 'string') return null
    if (typeof json.exp === 'number' && json.exp * 1000 < Date.now()) return null
    return json.sub
  } catch {
    return null
  }
}

/** Embutido pelo PostgREST: um para um às vezes vem objeto, às vezes lista de um. */
function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

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

  const userId = usuarioDoJwt(autorizacao)
  if (!userId) return respostaErro('Sessão inválida ou expirada.', 401)

  const db = clienteAdmin()
  const inicio = Date.now()

  // Num turno, a sessão (com o roteiro) é buscada JUNTO com a identidade: duas
  // consultas em paralelo, e só então se confere se a sessão é de quem pede.
  const precisaDeSessao = pedido.acao === 'avaliar' || pedido.acao === 'falar_stream'
  const sessaoP = precisaDeSessao ? buscarSessao(db, pedido.sessaoId, pedido.acao === 'avaliar') : null
  const ctx = pedido.modo === 'professor' ? await comoProfessor(db, userId) : await comoAluno(db, userId)
  if (ctx instanceof Response) return ctx
  ctx.sessaoBuscada = sessaoP ?? undefined
  ctx.inicio = inicio
  if (ctx.teste && pedido.acao === 'licoes') return respostaErro('No modo professor, a lição abre pelo editor.')

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
      case 'token_voz':
        return await tokenDeVoz(ctx, pedido)
      default:
        return respostaErro('Ação desconhecida.')
    }
  } catch (e) {
    if (e instanceof ErroDePedido) return respostaErro(e.message, e.status)
    console.error('tutor-aluno:', e)
    return respostaErro(e instanceof Error ? e.message : 'Falha ao falar com a IA.', 502)
  }
})

const COLUNAS_PREFERENCIAS = 'tutor_voz_natural, tutor_escuta_automatica, tutor_sessoes_mes'

type Preferencias = { tutor_voz_natural: boolean; tutor_escuta_automatica: boolean; tutor_sessoes_mes: number }

/** O aluno logado: a conta dele, o tutor ligado e o professor no beta — numa consulta só. */
async function comoAluno(db: Db, userId: string): Promise<Contexto | Response> {
  const { data: conta } = await db
    .from('contas_aluno')
    .select(`aluno_id, professor_id, alunos(tutor_ativo, status), professores(${COLUNAS_PREFERENCIAS}, tutor_acesso(max_sessoes_mes))`)
    .eq('user_id', userId)
    .maybeSingle()
  if (!conta) return respostaErro('Conta não encontrada.', 404)

  const aluno = um(conta.alunos as unknown as { tutor_ativo: boolean; status: string } | null)
  const professor = um(conta.professores as unknown as (Preferencias & { tutor_acesso: unknown }) | null)
  const acesso = um(professor?.tutor_acesso as { max_sessoes_mes: number } | { max_sessoes_mes: number }[] | null)
  if (!aluno?.tutor_ativo || aluno.status !== 'ativo' || !acesso || !professor) {
    return respostaErro('O tutor não está ligado para você. Fale com seu professor.', 403)
  }

  const limite = Math.min(professor.tutor_sessoes_mes, acesso.max_sessoes_mes)
  return { db, alunoId: conta.aluno_id as string, professorId: conta.professor_id as string, teste: false, limite, professor }
}

/** O professor experimentando a lição: precisa estar no beta. */
async function comoProfessor(db: Db, userId: string): Promise<Contexto | Response> {
  const { data: professor } = await db
    .from('professores')
    .select(`${COLUNAS_PREFERENCIAS}, tutor_acesso(professor_id)`)
    .eq('id', userId)
    .maybeSingle()
  if (!professor || !um(professor.tutor_acesso as unknown)) return respostaErro('O tutor não está liberado para a sua conta.', 403)
  return { db, alunoId: null, professorId: userId, teste: true, limite: TESTES_POR_DIA, professor: professor as unknown as Preferencias }
}

type SessaoBuscada = {
  id: string
  aluno_id: string | null
  professor_id: string
  teste: boolean
  licao_id: string
  iniciada_em: string
  concluida_em: string | null
  custo_usd: number
  tutor_licoes?: { roteiro: unknown } | { roteiro: unknown }[] | null
}

function buscarSessao(db: Db, sessaoId: string | undefined, comRoteiro: boolean): Promise<SessaoBuscada | null> {
  if (!sessaoId) return Promise.resolve(null)
  const colunas = 'id, aluno_id, professor_id, teste, licao_id, iniciada_em, concluida_em, custo_usd'
  return Promise.resolve(
    db
      .from('tutor_sessoes')
      .select(comRoteiro ? `${colunas}, tutor_licoes(roteiro)` : colunas)
      .eq('id', sessaoId)
      .maybeSingle(),
  ).then(({ data }) => (data as SessaoBuscada | null) ?? null)
}

type Contexto = {
  db: Db
  /** null no modo professor (sessão de teste). */
  alunoId: string | null
  professorId: string
  teste: boolean
  /** Aluno: sessões no mês. Professor: testes em 24 h. */
  limite: number
  professor: { tutor_voz_natural: boolean; tutor_escuta_automatica: boolean }
  /** Nos turnos: a sessão, já a caminho desde o começo da chamada. */
  sessaoBuscada?: Promise<SessaoBuscada | null>
  inicio?: number
}

// ── Lições ───────────────────────────────────────────────────────────────────

async function listarLicoes({ db, alunoId, professorId, limite }: Contexto): Promise<Response> {
  const { data: liberadas } = await db.from('tutor_licoes_alunos').select('licao_id').eq('aluno_id', alunoId!)
  const ids = (liberadas ?? []).map((l) => l.licao_id as string)

  const [{ data: licoes }, { data: sessoes }, usadas] = await Promise.all([
    ids.length
      ? db
          .from('tutor_licoes')
          .select('id, titulo, descricao, nivel_cefr, ordem')
          .in('id', ids)
          .eq('publicada', true)
          .or(`professor_id.is.null,professor_id.eq.${professorId}`)
          .order('ordem')
      : Promise.resolve({ data: [] as { id: string; titulo: string; descricao: string | null; nivel_cefr: string | null }[] }),
    db
      .from('tutor_sessoes')
      .select('licao_id, iniciada_em, concluida_em, resumo')
      .eq('aluno_id', alunoId!)
      .order('iniciada_em', { ascending: false })
      .limit(200),
    sessoesDoMes(db, alunoId!),
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
  const usadas = await sessoesUsadas(ctx)
  return respostaJson({
    licao: { id: licao.id, titulo: licao.titulo, nivel: licao.nivel_cefr },
    roteiro: licao.roteiro,
    falasGravadas: licao.falas_gravadas,
    urlFalas: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/tutor-falas/`,
    opcoes: { vozNatural: ctx.professor.tutor_voz_natural, escutaAutomatica: ctx.professor.tutor_escuta_automatica },
    restantes: Math.max(0, ctx.limite - usadas),
  })
}

const COLUNAS_LICAO = 'id, titulo, nivel_cefr, roteiro, falas_gravadas'

/**
 * Aluno: liberada para ele, publicada, e da biblioteca ou do professor dele.
 * Professor: dele (até em rascunho) ou da biblioteca, publicada.
 */
async function licaoLiberada({ db, alunoId, professorId, teste }: Contexto, licaoId: string | undefined) {
  if (!licaoId) throw new ErroDePedido('Falta a lição.')
  if (teste) {
    const { data: licao } = await db
      .from('tutor_licoes')
      .select(COLUNAS_LICAO)
      .eq('id', licaoId)
      .or(`professor_id.eq.${professorId},and(professor_id.is.null,publicada.eq.true)`)
      .maybeSingle()
    if (!licao) throw new ErroDePedido('Lição não encontrada.', 404)
    return licao
  }
  const [{ data: vinculo }, { data: licao }] = await Promise.all([
    db.from('tutor_licoes_alunos').select('licao_id').eq('aluno_id', alunoId!).eq('licao_id', licaoId).maybeSingle(),
    db
      .from('tutor_licoes')
      .select(COLUNAS_LICAO)
      .eq('id', licaoId)
      .eq('publicada', true)
      .or(`professor_id.is.null,professor_id.eq.${professorId}`)
      .maybeSingle(),
  ])
  if (!vinculo || !licao) throw new ErroDePedido('Esta lição não está liberada para você.', 404)
  return licao
}

// ── Sessão ───────────────────────────────────────────────────────────────────

async function iniciar(ctx: Contexto, pedido: Pedido): Promise<Response> {
  const licao = await licaoLiberada(ctx, pedido.licaoId)
  const usadas = await sessoesUsadas(ctx)
  if (usadas >= ctx.limite) {
    throw new ErroDePedido(
      ctx.teste
        ? `Você já fez ${ctx.limite} testes nas últimas 24 horas. Tente de novo amanhã.`
        : `Você já fez as ${ctx.limite} sessões deste mês. No mês que vem tem mais!`,
      429,
    )
  }
  const { data, error } = await ctx.db
    .from('tutor_sessoes')
    .insert({ aluno_id: ctx.alunoId, professor_id: ctx.professorId, licao_id: licao.id, teste: ctx.teste })
    .select('id')
    .single()
  if (error || !data) throw new Error('Não consegui abrir a sessão.')
  return respostaJson({ sessaoId: data.id, restantes: Math.max(0, ctx.limite - usadas - 1) })
}

/** A sessão aberta DESTE aluno (ou o teste DESTE professor), ainda dentro do tempo e do teto de custo. */
async function sessaoAberta(ctx: Contexto, sessaoId: string | undefined) {
  if (!sessaoId) throw new ErroDePedido('Falta a sessão.')
  const s = await (ctx.sessaoBuscada ?? buscarSessao(ctx.db, sessaoId, false))
  const deQuemPede = s && (ctx.teste ? s.teste && s.professor_id === ctx.professorId : s.aluno_id === ctx.alunoId)
  if (!s || !deQuemPede) throw new ErroDePedido('Sessão não encontrada.', 404)
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

  // O roteiro vem do banco (junto com a sessão): é ele que diz quais itens
  // existem e quais notas de gramática o avaliador respeita — o navegador não
  // escolhe o prompt.
  const roteiro = (um(s.tutor_licoes)?.roteiro ?? {}) as Roteiro
  const antesDaIaMs = Date.now() - (ctx.inicio ?? Date.now())
  if (!pedido.itemId || !idsDoRoteiro(roteiro).has(pedido.itemId)) {
    throw new ErroDePedido('Item fora desta lição.')
  }

  const chave = chaveGemini()
  const resultado = await avaliarTurno(chave, {
    audio: pedido.audio,
    texto: pedido.texto,
    contexto: pedido.contexto,
    notasDoMaterial: roteiro.notasParaAvaliador,
    modeloTranscricao:
      ctx.teste && MODELOS_DE_TRANSCRICAO.includes(String(pedido.modeloTranscricao)) ? pedido.modeloTranscricao : undefined,
  })
  depoisDeResponder(somarGasto(ctx.db, s.id, resultado.custos))
  return respostaJson({
    ...resultado,
    tempos: { ...resultado.tempos, antesDaIaMs, regiao: Deno.env.get('SB_REGION') ?? null },
  })
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
  const consulta = ctx.db
    .from('tutor_sessoes')
    .update({ concluida_em: new Date().toISOString(), resumo })
    .eq('id', pedido.sessaoId)
    .is('concluida_em', null)
  const { data } = await (ctx.teste
    ? consulta.eq('professor_id', ctx.professorId).eq('teste', true)
    : consulta.eq('aluno_id', ctx.alunoId!)
  )
    .select('id')
    .maybeSingle()
  // Concluir duas vezes (o "Refazer" no meio de um envio lento) não é erro.
  return respostaJson({ ok: true, gravado: Boolean(data) })
}

/**
 * Um token efêmero do Gemini Live para esta sessão. As restrições ficam no
 * token: o navegador não consegue trocar o modelo nem pedir outra coisa.
 * A detecção de fala é do nosso microfone (activityStart / activityEnd), e o
 * modelo é instruído a não responder — só a transcrição interessa.
 */
async function tokenDeVoz(ctx: Contexto, pedido: Pedido): Promise<Response> {
  await sessaoAberta(ctx, pedido.sessaoId)
  const agora = Date.now()
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': chaveGemini(), 'Content-Type': 'application/json' },
    // Uma conexão por token (o padrão): se a conexão cair, a página pede outro.
    body: JSON.stringify({
      expireTime: new Date(agora + TOKEN_VOZ_MINUTOS * 60_000).toISOString(),
      newSessionExpireTime: new Date(agora + 2 * 60_000).toISOString(),
      bidiGenerateContentSetup: { model: `models/${MODELO_VOZ_AO_VIVO}`, ...CONFIG_VOZ_AO_VIVO },
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.name) {
    console.error('tutor-aluno token_voz:', r.status, JSON.stringify(j).slice(0, 300))
    // No teste do professor, o motivo do Google ajuda a acertar a configuração.
    throw new Error(ctx.teste ? `Transcrição ao vivo indisponível: ${r.status} ${JSON.stringify(j).slice(0, 400)}` : 'Transcrição ao vivo indisponível.')
  }
  return respostaJson({ token: j.name, modelo: MODELO_VOZ_AO_VIVO })
}

const CONFIG_VOZ_AO_VIVO = {
  // A resposta do modelo é jogada fora: 1 token de saída é o mínimo que dá para pagar.
  generationConfig: { responseModalities: ['AUDIO'], maxOutputTokens: 1 },
  inputAudioTranscription: {},
  realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
  systemInstruction: {
    parts: [{ text: 'Você só escuta. Nunca responda nada; o que importa é a transcrição do que foi dito.' }],
  },
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

/** O que conta no limite: sessões do aluno no mês, ou testes do professor em 24 h. */
async function sessoesUsadas(ctx: Contexto): Promise<number> {
  if (!ctx.teste) return sessoesDoMes(ctx.db, ctx.alunoId!)
  const { count } = await ctx.db
    .from('tutor_sessoes')
    .select('id', { count: 'exact', head: true })
    .eq('professor_id', ctx.professorId)
    .eq('teste', true)
    .gte('iniciada_em', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  return count ?? 0
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
