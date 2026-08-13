// Deno Edge Function — rota pública /a/:token (link aberto de atividade).
//
// Sem sessão obrigatória: valida o token por hash (padrão de tarefa-obter) e
// devolve só a vitrine da atividade — título, nível, nº de questões, professor
// — mais o estado da janela de cadastro (12h a partir da geração, ver
// 0010_link_aberto.sql). Se vier `access_token`, diz também quem é a sessão:
// já vinculada a este professor (entra direto) ou não (pode vincular se a
// janela estiver aberta). Quem cria/retoma atribuição é link-aberto-entrar.
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

  const db = clienteAdmin()
  const hash = await hashDoToken(token)

  const { data: link } = await db
    .from('links_abertos')
    .select('id, atividade_id, professor_id, cadastro_expira_em')
    .eq('token_hash', hash)
    .maybeSingle()
  if (!link) return respostaErro('Este link não existe ou foi substituído por um novo. Peça o link atual ao professor.', 404)

  const [{ data: atividade }, { data: professor }, { count: questoes }] = await Promise.all([
    db.from('atividades').select('titulo, nivel').eq('id', link.atividade_id).single(),
    db.from('professores').select('nome').eq('id', link.professor_id).single(),
    db.from('questoes').select('*', { count: 'exact', head: true }).eq('atividade_id', link.atividade_id),
  ])
  if (!atividade) return respostaErro('Atividade não encontrada.', 404)

  // Sessão é opcional e falha nela não derruba a vitrine — o front só perde o
  // atalho "você já está logado" e cai no fluxo de login normal.
  let sessao: { email: string; alunoNome: string | null; vinculada: boolean } | null = null
  if (typeof accessToken === 'string' && accessToken) {
    const { data: dadosSessao } = await db.auth.getUser(accessToken)
    if (dadosSessao?.user) {
      const { data: conta } = await db
        .from('contas_aluno')
        .select('aluno_id')
        .eq('user_id', dadosSessao.user.id)
        .eq('professor_id', link.professor_id)
        .maybeSingle()

      let alunoNome: string | null = null
      if (conta) {
        const { data: aluno } = await db.from('alunos').select('nome').eq('id', conta.aluno_id).single()
        alunoNome = aluno?.nome ?? null
      }
      sessao = { email: dadosSessao.user.email ?? '', alunoNome, vinculada: Boolean(conta) }
    }
  }

  return respostaJson({
    atividadeTitulo: atividade.titulo,
    nivel: atividade.nivel,
    questoes: questoes ?? 0,
    professorNome: professor?.nome ?? 'seu professor',
    cadastroAberto: new Date(link.cadastro_expira_em) > new Date(),
    cadastroExpiraEm: link.cadastro_expira_em,
    sessao,
  })
})
