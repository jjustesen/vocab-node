// Deno Edge Function — sem sessão (o aluno ainda não tem conta). Valida o
// link de cadastro/reset (RF-22/23/25) por hash, mesmo padrão de tarefa-obter.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { hashDoToken } from '../_shared/token.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { token?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const token = corpo.token
  if (typeof token !== 'string' || token.length < 20) return respostaErro('Link inválido.', 404)

  const db = clienteAdmin()
  const hash = await hashDoToken(token)

  const { data: convite } = await db
    .from('convites_aluno')
    .select('id, aluno_id, expira_em, usado_em')
    .eq('token_hash', hash)
    .maybeSingle()

  if (!convite) return respostaErro('Link de cadastro inválido.', 404)
  if (convite.usado_em) return respostaErro('Este link já foi usado. Peça um novo ao seu professor.', 410)
  if (new Date(convite.expira_em) < new Date()) {
    return respostaErro('Este link expirou. Peça um novo ao seu professor.', 410)
  }

  const { data: aluno } = await db.from('alunos').select('nome, professor_id').eq('id', convite.aluno_id).single()
  if (!aluno) return respostaErro('Aluno não encontrado.', 404)

  const { data: professor } = await db.from('professores').select('nome').eq('id', aluno.professor_id).single()

  return respostaJson({ alunoNome: aluno.nome, professorNome: professor?.nome ?? 'seu professor' })
})
