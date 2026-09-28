// Deno Edge Function — sem sessão (quem abre ainda não tem conta). Rota
// pública /cadastro/professor/:token (0019_link_de_cadastro.sql).
//
// Valida o link por hash e devolve só a vitrine: nome do professor, até
// quando o link vale e se ainda há vaga no plano. `semVagas` vem já aqui para
// o aluno não preencher o formulário inteiro só para ouvir "não" no fim — mas
// quem barra de verdade é link-cadastro-concluir, que confere de novo.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { ehFalha, limiteDeAlunosAtingido, resolverLinkDeCadastro } from '../_shared/cadastro-aluno.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { token?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const db = clienteAdmin()
  const link = await resolverLinkDeCadastro(db, corpo.token)
  if (ehFalha(link)) return respostaErro(link.mensagem, link.status)

  const [{ data: professor }, limiteAtingido] = await Promise.all([
    db.from('professores').select('nome').eq('id', link.professor_id).single(),
    limiteDeAlunosAtingido(db, link.professor_id),
  ])

  return respostaJson({
    professorNome: professor?.nome ?? 'seu professor',
    expiraEm: link.expira_em,
    semVagas: limiteAtingido !== null,
  })
})
