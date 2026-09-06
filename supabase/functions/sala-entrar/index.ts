// Deno Edge Function — devolve o token de acesso à sala de vídeo (LiveKit).
//
// ── O que o token da sala significa ─────────────────────────────────────────
//
// Na sala 1:1 (0012), o token é ENDEREÇO E IDENTIDADE ao mesmo tempo: quem
// abre `/s/<token>` não só sabe qual sala é, ele É aquele aluno, porque o
// token pertence à linha dele.
//
// Na sala de TURMA (0015) isso não se sustenta — são várias pessoas atrás do
// mesmo link. Ali o token é SÓ ENDEREÇO, e a identidade vem de outro lugar:
// a conta do aluno, ou um e-mail que já esteja cadastrado na turma. Sem
// e-mail conhecido, não entra: é o que impede o link de virar porta aberta
// depois de ser encaminhado (ver o cabeçalho de 0015 para a troca completa).
//
// Portas:
//   { alunoId }             + JWT do professor → 1:1, o professor
//   { turmaId }             + JWT do professor → turma, o professor
//   {}                      + JWT do aluno     → 1:1 do aluno com conta
//   { token }               + JWT do aluno     → turma, identificado pela conta
//   { token }                                  → 1:1, aluno sem conta
//   { token, nome, email }                     → turma, aluno sem conta
//
// A função roda com --no-verify-jwt por causa das duas últimas: quem chega
// pelo link pode não ter sessão nenhuma.
//
// Nenhum id vindo do corpo é usado como identidade: `alunoId`/`turmaId` só
// dizem QUAL sala se quer, e só passam depois de o JWT provar que o professor
// é dono.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { hashDoToken } from '../_shared/token.ts'
import { configLiveKit, nomeDaSala, tokenDoLiveKit } from '../_shared/livekit.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

type Papel = 'professor' | 'aluno'

type Contexto =
  | { tipo: 'aluno'; alunoId: string; alunoNome: string }
  | { tipo: 'turma'; turmaId: string; turmaNome: string }

/** Sala + quem é quem, que a tela mostra antes de conectar. */
type Acesso = {
  salaId: string
  papel: Papel
  /**
   * Identidade estável do participante — `prof-<id>` ou `aluno-<id>`.
   *
   * É ela que vai para o LiveKit, e é o motivo de a turma ser possível: o
   * LiveKit derruba quem repete identidade (proposital, para o professor não
   * aparecer duas vezes ao abrir duas abas). Enquanto a identidade era
   * `${papel}-${alunoId}`, três alunos da mesma turma receberiam a MESMA
   * string e se expulsariam em rodízio.
   *
   * O convidado de turma que se identifica por e-mail recebe o `aluno-<id>`
   * dele — ou seja, é a mesma pessoa que entraria logada. É justamente o que
   * o e-mail compra.
   */
  participanteId: string
  nomeExibido: string
  professorNome: string
  contexto: Contexto
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { alunoId?: unknown; turmaId?: unknown; token?: unknown; nome?: unknown; email?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const db = clienteAdmin()
  const autorizacao = req.headers.get('Authorization')

  /**
   * `precisaIdentificar` NÃO é erro, é um estado da porta: a sala é de turma e
   * quem chegou não disse quem é. Vai como 200 com uma marca, e não como 400,
   * para a tela distinguir isso de "deu errado" sem ter que ler mensagem de
   * erro — texto de erro é para humano, não para lógica de cliente.
   */
  let acesso: Acesso | { erro: string; status: number } | { precisaIdentificar: true; turmaNome: string } | null

  if (typeof corpo.token === 'string') {
    const usuarioId = autorizacao ? await usuarioDoJwt(autorizacao) : null
    acesso = await porToken(db, corpo.token, usuarioId, corpo.nome, corpo.email)
  } else {
    if (!autorizacao) return respostaErro('Não autenticado.', 401)
    const usuarioId = await usuarioDoJwt(autorizacao)
    if (!usuarioId) return respostaErro('Sessão inválida ou expirada.', 401)

    if (typeof corpo.alunoId === 'string') {
      acesso = await comoProfessorDoAluno(db, usuarioId, corpo.alunoId)
    } else if (typeof corpo.turmaId === 'string') {
      acesso = await comoProfessorDaTurma(db, usuarioId, corpo.turmaId)
    } else {
      // 404 aqui é identidade, não indisponibilidade — o painel usa esse
      // status para derrubar quem entrou pela porta errada.
      acesso = await comoAlunoLogado(db, usuarioId)
    }
  }

  if (!acesso) return respostaErro('Sala não encontrada.', 404)
  if ('erro' in acesso) return respostaErro(acesso.erro, acesso.status)
  if ('precisaIdentificar' in acesso) return respostaJson(acesso)

  const config = configLiveKit()
  const tokenSala = await tokenDoLiveKit(config, {
    sala: nomeDaSala(acesso.salaId),
    identidade: acesso.participanteId,
    nomeExibido: acesso.nomeExibido,
  })

  return respostaJson({
    url: config.url,
    token: tokenSala,
    papel: acesso.papel,
    participanteId: acesso.participanteId,
    nomeExibido: acesso.nomeExibido,
    professorNome: acesso.professorNome,
    contexto: acesso.contexto,
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

async function nomeDoProfessor(db: Db, professorId: string): Promise<string> {
  const { data } = await db.from('professores').select('nome').eq('id', professorId).maybeSingle()
  return data?.nome ?? 'seu professor'
}

/**
 * A sala 1:1 nasce aqui, na primeira vez que o professor abre — e só aqui. O
 * aluno nunca cria sala: entrar num link que não existe tem que falhar, senão
 * o "link errado" viraria silenciosamente uma sala vazia onde ninguém aparece.
 */
async function comoProfessorDoAluno(db: Db, usuarioId: string, alunoId: string): Promise<Acesso | null> {
  const { data: aluno } = await db
    .from('alunos')
    .select('id, nome, professor_id')
    .eq('id', alunoId)
    .maybeSingle()
  if (!aluno || aluno.professor_id !== usuarioId) return null

  const { data: sala } = await db.from('salas').select('id').eq('aluno_id', alunoId).maybeSingle()
  if (!sala) return null

  return {
    salaId: sala.id,
    papel: 'professor',
    participanteId: `prof-${usuarioId}`,
    nomeExibido: await nomeDoProfessor(db, usuarioId),
    professorNome: await nomeDoProfessor(db, usuarioId),
    contexto: { tipo: 'aluno', alunoId, alunoNome: aluno.nome },
  }
}

async function comoProfessorDaTurma(db: Db, usuarioId: string, turmaId: string): Promise<Acesso | null> {
  const { data: turma } = await db
    .from('turmas')
    .select('id, nome, professor_id')
    .eq('id', turmaId)
    .maybeSingle()
  if (!turma || turma.professor_id !== usuarioId) return null

  const { data: sala } = await db.from('salas').select('id').eq('turma_id', turmaId).maybeSingle()
  if (!sala) return null

  const nome = await nomeDoProfessor(db, usuarioId)
  return {
    salaId: sala.id,
    papel: 'professor',
    participanteId: `prof-${usuarioId}`,
    nomeExibido: nome,
    professorNome: nome,
    contexto: { tipo: 'turma', turmaId, turmaNome: turma.nome },
  }
}

async function comoAlunoLogado(db: Db, usuarioId: string): Promise<Acesso | null> {
  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id, professor_id')
    .eq('user_id', usuarioId)
    .maybeSingle()
  if (!conta) return null

  const { data: sala } = await db.from('salas').select('id').eq('aluno_id', conta.aluno_id).maybeSingle()
  if (!sala) return null

  const { data: aluno } = await db.from('alunos').select('nome').eq('id', conta.aluno_id).maybeSingle()

  return {
    salaId: sala.id,
    papel: 'aluno',
    participanteId: `aluno-${conta.aluno_id}`,
    nomeExibido: aluno?.nome ?? 'aluno',
    professorNome: await nomeDoProfessor(db, conta.professor_id),
    contexto: { tipo: 'aluno', alunoId: conta.aluno_id, alunoNome: aluno?.nome ?? 'aluno' },
  }
}

/**
 * A porta do link. Duas salas muito diferentes saem daqui:
 *
 *   1:1   → o token IDENTIFICA o aluno. Entra direto, como sempre entrou.
 *   turma → o token só diz qual sala. Quem é a pessoa vem da conta (se tiver
 *           sessão) ou do e-mail digitado, que precisa estar na turma.
 */
async function porToken(
  db: Db,
  token: string,
  usuarioId: string | null,
  nome: unknown,
  email: unknown,
): Promise<Acesso | { erro: string; status: number } | { precisaIdentificar: true; turmaNome: string } | null> {
  if (token.length < 20) return null

  const { data: sala } = await db
    .from('salas')
    .select('id, aluno_id, turma_id, professor_id')
    .eq('token_hash', await hashDoToken(token))
    .maybeSingle()
  if (!sala) {
    return {
      erro: 'Esta sala não existe ou o link foi substituído por um novo. Peça o link atual ao professor.',
      status: 404,
    }
  }

  const professorNome = await nomeDoProfessor(db, sala.professor_id)

  // ── 1:1: o token é a identidade ───────────────────────────────────────────
  if (sala.aluno_id) {
    const { data: aluno } = await db.from('alunos').select('nome').eq('id', sala.aluno_id).maybeSingle()
    return {
      salaId: sala.id,
      papel: 'aluno',
      participanteId: `aluno-${sala.aluno_id}`,
      nomeExibido: aluno?.nome ?? 'aluno',
      professorNome,
      contexto: { tipo: 'aluno', alunoId: sala.aluno_id, alunoNome: aluno?.nome ?? 'aluno' },
    }
  }

  // ── turma: o token é só o endereço ────────────────────────────────────────
  const { data: turma } = await db
    .from('turmas')
    .select('id, nome')
    .eq('id', sala.turma_id!)
    .maybeSingle()
  if (!turma) return null

  const contexto: Contexto = { tipo: 'turma', turmaId: turma.id, turmaNome: turma.nome }

  // Quem já tem sessão de aluno nem precisa digitar nada: a conta é uma
  // identidade melhor que um e-mail digitado, e o e-mail dela pode até ser
  // outro (a conta é criada por convite, ver 0001).
  if (usuarioId) {
    const { data: conta } = await db
      .from('contas_aluno')
      .select('aluno_id')
      .eq('user_id', usuarioId)
      .maybeSingle()
    if (conta) {
      const naTurma = await pertenceATurma(db, turma.id, conta.aluno_id)
      if (naTurma) {
        const { data: aluno } = await db
          .from('alunos')
          .select('nome')
          .eq('id', conta.aluno_id)
          .maybeSingle()
        return {
          salaId: sala.id,
          papel: 'aluno',
          participanteId: `aluno-${conta.aluno_id}`,
          nomeExibido: aluno?.nome ?? 'aluno',
          professorNome,
          contexto,
        }
      }
    }
  }

  // Sem sessão: o e-mail é a chave. `nome` é pedido junto na antessala porque
  // é o que a pessoa espera preencher, mas quem manda é o e-mail — o nome
  // exibido sai do CADASTRO, não do que foi digitado, senão bastaria escrever
  // "Professor" na caixa para aparecer como ele na lista de participantes.
  const emailLimpo = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!emailLimpo) return { precisaIdentificar: true, turmaNome: turma.nome }
  void nome

  const aluno = await alunoPorEmail(db, sala.professor_id, emailLimpo)

  // Uma mensagem só para "e-mail não cadastrado" e para "cadastrado mas não é
  // desta turma": quem tem o link não deve conseguir descobrir, testando
  // e-mails, quem é aluno de quem.
  const naTurma = aluno ? await pertenceATurma(db, turma.id, aluno.id) : false
  if (!aluno || !naTurma) {
    return {
      erro: 'Não encontrei este e-mail entre os alunos desta aula. Confira o endereço ou peça ao professor para incluir você na turma.',
      status: 403,
    }
  }

  return {
    salaId: sala.id,
    papel: 'aluno',
    participanteId: `aluno-${aluno.id}`,
    nomeExibido: aluno.nome,
    professorNome,
    contexto,
  }
}

/**
 * Acha o aluno pelo e-mail, olhando os DOIS lugares onde ele pode estar.
 *
 * `alunos.email` é o contato que o professor digitou na ficha, e é opcional —
 * hoje a maioria das fichas está sem. `contas_aluno.email` é o endereço com
 * que o aluno criou a conta, e esse é o que ele lembra e vai digitar.
 *
 * Olhar só a ficha barraria justamente quem já tem conta no produto, que é o
 * caso mais bem resolvido de todos. Os dois valem, e o da conta é consultado
 * primeiro por ser o mais confiável: ele passou por um convite.
 */
async function alunoPorEmail(
  db: Db,
  professorId: string,
  email: string,
): Promise<{ id: string; nome: string } | null> {
  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id')
    .eq('professor_id', professorId)
    .ilike('email', email)
    .maybeSingle()

  if (conta) {
    const { data } = await db.from('alunos').select('id, nome').eq('id', conta.aluno_id).maybeSingle()
    if (data) return data
  }

  const { data } = await db
    .from('alunos')
    .select('id, nome')
    .eq('professor_id', professorId)
    .ilike('email', email)
    .maybeSingle()
  return data ?? null
}

async function pertenceATurma(db: Db, turmaId: string, alunoId: string): Promise<boolean> {
  const { data } = await db
    .from('turmas_alunos')
    .select('aluno_id')
    .eq('turma_id', turmaId)
    .eq('aluno_id', alunoId)
    .maybeSingle()
  return Boolean(data)
}
