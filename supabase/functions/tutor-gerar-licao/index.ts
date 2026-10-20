// Deno Edge Function — "Nova lição com IA" da página Tutor (professor logado,
// verify-jwt ligado).
//
// O professor manda o material da aula — foto, PDF ou texto da página de
// drillings —; o Gemini monta a lição (_shared/tutor/licao-ia.ts) e ela entra
// como RASCUNHO do professor em tutor_licoes. O editor abre em seguida: é lá
// que ele revisa, corrige o que o validarRoteiro acusar e publica.
//
// Não gasta a cota de geração de atividades do plano: no beta o tutor é por
// nossa conta, com teto próprio de lições geradas por dia.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { GeminiProvider } from '../_shared/ia/gemini.ts'
import { validarMaterial } from '../_shared/ia/material.ts'
import { mensagemUsuarioDoErro, type MaterialGeracao } from '../_shared/ia/tipos.ts'
import { blocoDoPedido, INSTRUCAO_LICAO, LICAO_GERADA_SCHEMA, paraRoteiro } from '../_shared/tutor/licao-ia.ts'

const LICOES_POR_DIA = 20
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1']
/** A lição inteira sai bem maior que uma atividade: uma tentativa longa, e repetir só erro rápido. */
const TIMEOUT_MS = 120_000
const ORCAMENTO_MS = 125_000

type Pedido = { material?: unknown; nivel?: string; titulo?: string }

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

  const dbProfessor = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao, error: erroSessao } = await dbProfessor.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)
  const professorId = sessao.user.id

  const material = validarMaterial(pedido.material)
  if ('erro' in material) return respostaErro(material.erro)
  const nivel = NIVEIS.includes(String(pedido.nivel)) ? String(pedido.nivel) : 'A1'
  const titulo = typeof pedido.titulo === 'string' ? pedido.titulo.trim().slice(0, 120) : ''

  const db = clienteAdmin()
  const [{ data: acesso }, { count: geradasHoje }] = await Promise.all([
    db.from('tutor_acesso').select('professor_id').eq('professor_id', professorId).maybeSingle(),
    db
      .from('tutor_licoes')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', professorId)
      .eq('gerada_por_ia', true)
      .gte('criado_em', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])
  if (!acesso) return respostaErro('O tutor não está liberado para a sua conta.', 403)
  if ((geradasHoje ?? 0) >= LICOES_POR_DIA) {
    return respostaErro(`Você já gerou ${LICOES_POR_DIA} lições nas últimas 24 horas. Tente de novo amanhã.`, 429)
  }

  let dados: unknown
  try {
    const gemini = new GeminiProvider()
    const r = await gemini.gerarJson({
      sistema: INSTRUCAO_LICAO,
      schema: LICAO_GERADA_SCHEMA,
      parts: partesDoMaterial(material, blocoDoPedido(nivel, titulo)),
      timeoutMs: TIMEOUT_MS,
      orcamentoMs: ORCAMENTO_MS,
    })
    dados = r.dados
    console.log('tutor-gerar-licao uso:', JSON.stringify(r.uso))
  } catch (e) {
    console.error('tutor-gerar-licao:', e)
    return respostaErro(mensagemUsuarioDoErro(e).replace('a atividade', 'a lição'), 502)
  }

  const id = crypto.randomUUID()
  const roteiro = paraRoteiro(dados, id)
  if (!roteiro.blocos.length) {
    return respostaErro('A IA não encontrou exercícios neste material. Confira se a foto está legível e tente de novo.', 422)
  }
  if (titulo) roteiro.titulo = titulo

  const { error } = await db.from('tutor_licoes').insert({
    id,
    professor_id: professorId,
    titulo: roteiro.titulo,
    descricao: roteiro.abertura,
    nivel_cefr: nivel,
    roteiro,
    publicada: false,
    gerada_por_ia: true,
  })
  if (error) {
    console.error('tutor-gerar-licao insert:', error)
    return respostaErro('Gerei a lição, mas não consegui guardar. Tente de novo.', 500)
  }

  return respostaJson({ id })
})

/** Texto vai no próprio prompt; foto, PDF e páginas vão como partes anexadas. */
function partesDoMaterial(material: MaterialGeracao, pedido: string): unknown[] {
  if (material.tipo === 'texto') return [{ text: `${pedido}\n\n## Material da aula\n${material.conteudo}` }]
  if (material.tipo === 'paginas') {
    return [
      { text: `${pedido}\n\n## Material da aula\nAnexado a seguir (${material.paginas.length} página(s), em ordem).` },
      ...material.paginas.map((p) => ({ inline_data: { mime_type: p.mimeType, data: p.conteudo } })),
    ]
  }
  return [
    { text: `${pedido}\n\n## Material da aula\nAnexado a seguir (${material.tipo === 'pdf' ? 'PDF' : 'foto'}). Negrito na página = frase-modelo.` },
    { inline_data: { mime_type: material.mimeType, data: material.conteudo } },
  ]
}
