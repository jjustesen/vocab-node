// Deno Edge Function — sem verify-jwt (o aluno acabou de se cadastrar; quem
// chama é o front, não sabemos ainda se o JWT dele é válido até checarmos).
//
// RF-23/24: cria a conta vinculada ao aluno já existente, preservando todo o
// histórico (nada em `atribuicoes`/`respostas` muda — só nasce uma linha em
// `contas_aluno` apontando pro mesmo `aluno_id`).
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { hashDoToken } from '../_shared/token.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { token?: unknown; access_token?: unknown }
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

  const { data: convite } = await db
    .from('convites_aluno')
    .select('id, aluno_id, expira_em, usado_em')
    .eq('token_hash', hash)
    .maybeSingle()

  if (!convite) return respostaErro('Link de cadastro inválido.', 404)
  if (convite.usado_em) return respostaErro('Este link já foi usado.', 410)
  if (new Date(convite.expira_em) < new Date()) return respostaErro('Este link expirou.', 410)

  // Nunca confiamos num user_id vindo do corpo — validamos o JWT que o
  // signUp devolveu e pegamos o id/e-mail direto do provedor de auth.
  const { data: sessao, error: erroSessao } = await db.auth.getUser(accessToken)
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  const { data: aluno } = await db
    .from('alunos')
    .select('id, nome, professor_id')
    .eq('id', convite.aluno_id)
    .single()
  if (!aluno) return respostaErro('Aluno não encontrado.', 404)

  const { error: erroConta } = await db.from('contas_aluno').insert({
    aluno_id: aluno.id,
    professor_id: aluno.professor_id,
    user_id: sessao.user.id,
    email: sessao.user.email,
  })
  if (erroConta) {
    // unique_violation: (professor_id, email) já usado (RF-27) ou este
    // aluno já tem conta (aluno_id é unique em contas_aluno).
    if (erroConta.code === '23505') {
      return respostaErro('Este e-mail já está em uso, ou este aluno já tem uma conta criada.', 409)
    }
    return respostaErro(erroConta.message, 500)
  }

  await db.from('convites_aluno').update({ usado_em: new Date().toISOString() }).eq('id', convite.id)
  await db
    .from('eventos_acesso_aluno')
    .insert({ aluno_id: aluno.id, tipo: 'conta_criada', email_novo: sessao.user.email })

  return respostaJson({ ok: true, alunoNome: aluno.nome })
})
