// Deno Edge Function — conclui o fluxo do link aberto para uma sessão de
// aluno válida (recém-criada por signUp ou já existente).
//
// Regra das 12h (0010_link_aberto.sql), aplicada AQUI e não no front:
//   - janela aberta  → sessão sem vínculo com o professor ganha `alunos` +
//     `contas_aluno` na hora (é o "cadastro" do link aberto);
//   - janela fechada → só quem já tem vínculo passa; o resto recebe 410.
//
// Em ambos os casos a saída é a mesma: a atribuição desta atividade para esse
// aluno — reaproveitada se já existe (abrir o link duas vezes não duplica
// tentativa), criada se não. O aluno está logado, então o front navega para
// /painel/tarefa/:atribuicaoId — o token da atribuição nasce no servidor e
// não precisa voltar na resposta.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { gerarTokenDeAcesso, hashDoToken } from '../_shared/token.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { token?: unknown; access_token?: unknown; nome?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const { token, access_token: accessToken } = corpo
  if (typeof token !== 'string' || token.length < 20) return respostaErro('Link inválido.', 404)
  if (typeof accessToken !== 'string' || !accessToken) return respostaErro('Sessão inválida.', 401)

  const db = clienteAdmin()
  const hash = await hashDoToken(token)

  const { data: link } = await db
    .from('links_abertos')
    .select('id, atividade_id, professor_id, cadastro_expira_em')
    .eq('token_hash', hash)
    .maybeSingle()
  if (!link) return respostaErro('Este link não existe ou foi substituído por um novo. Peça o link atual ao professor.', 404)

  // Nunca confiamos em ids vindos do corpo — a identidade sai do JWT.
  const { data: sessao, error: erroSessao } = await db.auth.getUser(accessToken)
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id')
    .eq('user_id', sessao.user.id)
    .eq('professor_id', link.professor_id)
    .maybeSingle()

  let alunoId = conta?.aluno_id ?? null
  let contaCriada = false

  if (!alunoId) {
    if (new Date(link.cadastro_expira_em) <= new Date()) {
      return respostaErro(
        'O período de cadastro deste link terminou. Se você já tem conta, entre com ela; senão, peça um novo link ao professor.',
        410,
      )
    }

    // O painel do aluno resolve a conta por user_id com maybeSingle — uma
    // segunda linha em contas_aluno para o mesmo usuário quebraria o login de
    // TUDO para essa pessoa. Enquanto o produto não suportar multi-professor
    // de fato, barramos aqui com uma mensagem acionável.
    const { data: contaEmOutroProfessor } = await db
      .from('contas_aluno')
      .select('id')
      .eq('user_id', sessao.user.id)
      .maybeSingle()
    if (contaEmOutroProfessor) {
      return respostaErro('Esta conta já está vinculada a outro professor. Use outro e-mail para se cadastrar aqui.', 409)
    }

    const nome =
      (typeof corpo.nome === 'string' && corpo.nome.trim()) ||
      (typeof sessao.user.user_metadata?.nome === 'string' && sessao.user.user_metadata.nome.trim()) ||
      sessao.user.email?.split('@')[0] ||
      'Aluno'

    const { data: aluno, error: erroAluno } = await db
      .from('alunos')
      .insert({ professor_id: link.professor_id, nome, email: sessao.user.email })
      .select('id')
      .single()
    if (erroAluno) return respostaErro(erroAluno.message, 500)

    const { error: erroConta } = await db.from('contas_aluno').insert({
      aluno_id: aluno.id,
      professor_id: link.professor_id,
      user_id: sessao.user.id,
      email: sessao.user.email,
    })
    if (erroConta) {
      // Não deixar o aluno órfão de conta — sem esta linha ele apareceria na
      // lista do professor sem nunca conseguir entrar.
      await db.from('alunos').delete().eq('id', aluno.id)
      if (erroConta.code === '23505') {
        return respostaErro('Este e-mail já está em uso com este professor. Tente entrar em vez de se cadastrar.', 409)
      }
      return respostaErro(erroConta.message, 500)
    }

    await db.from('eventos_acesso_aluno').insert({ aluno_id: aluno.id, tipo: 'conta_criada', email_novo: sessao.user.email })
    alunoId = aluno.id
    contaCriada = true
  } else {
    await db.from('contas_aluno').update({ ultimo_login: new Date().toISOString() }).eq('aluno_id', alunoId)
  }

  // Reaproveita a atribuição mais recente ainda válida — reabrir o link não
  // cria tentativa nova (isso continua sendo gesto do professor, RF-127).
  const { data: existente } = await db
    .from('atribuicoes')
    .select('id, tentativa')
    .eq('atividade_id', link.atividade_id)
    .eq('aluno_id', alunoId)
    .is('revogada_em', null)
    .order('tentativa', { ascending: false })
    .limit(1)
    .maybeSingle()

  let atribuicaoId = existente?.id ?? null
  if (!atribuicaoId) {
    const { count } = await db
      .from('atribuicoes')
      .select('*', { count: 'exact', head: true })
      .eq('atividade_id', link.atividade_id)
      .eq('aluno_id', alunoId)

    const { hash: hashAtribuicao } = await gerarTokenDeAcesso()
    const { data: criada, error: erroAtribuicao } = await db
      .from('atribuicoes')
      .insert({
        atividade_id: link.atividade_id,
        aluno_id: alunoId,
        token_hash: hashAtribuicao,
        tentativa: (count ?? 0) + 1,
        link_aberto_id: link.id,
      })
      .select('id')
      .single()
    if (erroAtribuicao) return respostaErro(erroAtribuicao.message, 500)
    atribuicaoId = criada.id
  }

  const { data: aluno } = await db.from('alunos').select('nome').eq('id', alunoId).single()

  return respostaJson({ atribuicaoId, alunoNome: aluno?.nome ?? 'Aluno', contaCriada })
})
