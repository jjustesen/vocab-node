// Deno Edge Function — devolve o token de acesso à sala de vídeo (LiveKit).
//
// Três portas de entrada, porque este produto tem três tipos de visitante e a
// sala precisa servir aos três (ver cabeçalho de 0001_init.sql):
//
//   { alunoId }  + JWT do professor  → o professor, dono do aluno
//   {}           + JWT do aluno      → aluno com conta, entrando pelo painel
//   { token }                        → aluno SEM conta, pelo link do WhatsApp
//
// A última é a razão de a função rodar com --no-verify-jwt: quem chega pelo
// link não tem sessão nenhuma, e a autorização vem da posse do token,
// validada por hash — mesma regra de `tarefa-obter`.
//
// Nenhum id vindo do corpo é usado como identidade: `alunoId` só diz QUAL sala
// se quer, e só passa depois de o JWT provar que o professor é dono do aluno.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { hashDoToken } from '../_shared/token.ts'
import { configLiveKit, nomeDaSala, tokenDoLiveKit } from '../_shared/livekit.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

type Papel = 'professor' | 'aluno'

/** Sala + os nomes das duas pontas, que a tela mostra antes de conectar. */
type Contexto = {
  salaId: string
  alunoId: string
  professorNome: string
  alunoNome: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { alunoId?: unknown; token?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const db = clienteAdmin()
  const autorizacao = req.headers.get('Authorization')

  let papel: Papel
  let contexto: Contexto | null

  if (typeof corpo.token === 'string') {
    papel = 'aluno'
    contexto = await porToken(db, corpo.token)
    if (!contexto) {
      return respostaErro(
        'Esta sala não existe ou o link foi substituído por um novo. Peça o link atual ao professor.',
        404,
      )
    }
  } else {
    if (!autorizacao) return respostaErro('Não autenticado.', 401)
    const usuarioId = await usuarioDoJwt(autorizacao)
    if (!usuarioId) return respostaErro('Sessão inválida ou expirada.', 401)

    if (typeof corpo.alunoId === 'string') {
      papel = 'professor'
      contexto = await comoProfessor(db, usuarioId, corpo.alunoId)
      if (!contexto) return respostaErro('Aluno não encontrado.', 404)
    } else {
      papel = 'aluno'
      contexto = await comoAlunoLogado(db, usuarioId)
      // 404 aqui é identidade, não indisponibilidade — o painel usa esse
      // status para derrubar quem entrou pela porta errada.
      if (!contexto) return respostaErro('Conta não encontrada.', 404)
    }
  }

  const config = configLiveKit()
  const nomeExibido = papel === 'professor' ? contexto.professorNome : contexto.alunoNome

  const tokenSala = await tokenDoLiveKit(config, {
    sala: nomeDaSala(contexto.salaId),
    // A identidade carrega o papel: se o professor abrir a sala em duas abas,
    // o LiveKit derruba a primeira em vez de mostrar dois "Professor" na tela.
    identidade: `${papel}-${contexto.alunoId}`,
    nomeExibido,
  })

  return respostaJson({
    url: config.url,
    token: tokenSala,
    papel,
    nomeExibido,
    professorNome: contexto.professorNome,
    alunoNome: contexto.alunoNome,
  })
})

/** JWT (professor ou aluno — mesmo GoTrue) → id do usuário, ou null. */
async function usuarioDoJwt(autorizacao: string): Promise<string | null> {
  const cliente = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data, error } = await cliente.auth.getUser()
  return error || !data.user ? null : data.user.id
}

type Db = ReturnType<typeof clienteAdmin>

/**
 * A sala nasce aqui, na primeira vez que o professor abre — e só aqui. O aluno
 * nunca cria sala: entrar num link que não existe tem que falhar, senão o
 * "link errado" viraria silenciosamente uma sala vazia onde ninguém aparece.
 */
async function comoProfessor(db: Db, usuarioId: string, alunoId: string): Promise<Contexto | null> {
  const { data: aluno } = await db
    .from('alunos')
    .select('id, nome, professor_id')
    .eq('id', alunoId)
    .maybeSingle()
  if (!aluno || aluno.professor_id !== usuarioId) return null

  const { data: professor } = await db
    .from('professores')
    .select('nome')
    .eq('id', usuarioId)
    .maybeSingle()

  const { data: sala } = await db.from('salas').select('id').eq('aluno_id', alunoId).maybeSingle()
  if (!sala) return null

  return {
    salaId: sala.id,
    alunoId,
    professorNome: professor?.nome ?? 'Professor',
    alunoNome: aluno.nome,
  }
}

async function comoAlunoLogado(db: Db, usuarioId: string): Promise<Contexto | null> {
  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id, professor_id')
    .eq('user_id', usuarioId)
    .maybeSingle()
  if (!conta) return null

  const { data: sala } = await db.from('salas').select('id').eq('aluno_id', conta.aluno_id).maybeSingle()
  if (!sala) return null

  const [{ data: aluno }, { data: professor }] = await Promise.all([
    db.from('alunos').select('nome').eq('id', conta.aluno_id).maybeSingle(),
    db.from('professores').select('nome').eq('id', conta.professor_id).maybeSingle(),
  ])

  return {
    salaId: sala.id,
    alunoId: conta.aluno_id,
    professorNome: professor?.nome ?? 'seu professor',
    alunoNome: aluno?.nome ?? 'aluno',
  }
}

async function porToken(db: Db, token: string): Promise<Contexto | null> {
  if (token.length < 20) return null

  const { data: sala } = await db
    .from('salas')
    .select('id, aluno_id, professor_id')
    .eq('token_hash', await hashDoToken(token))
    .maybeSingle()
  if (!sala) return null

  const [{ data: aluno }, { data: professor }] = await Promise.all([
    db.from('alunos').select('nome').eq('id', sala.aluno_id).maybeSingle(),
    db.from('professores').select('nome').eq('id', sala.professor_id).maybeSingle(),
  ])

  return {
    salaId: sala.id,
    alunoId: sala.aluno_id,
    professorNome: professor?.nome ?? 'seu professor',
    alunoNome: aluno?.nome ?? 'aluno',
  }
}
