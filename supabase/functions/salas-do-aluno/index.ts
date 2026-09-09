// Deno Edge Function — as salas de vídeo que ESTE aluno pode abrir.
//
// Mesmo padrão de painel-aluno-obter e materiais-aluno-obter: a identidade sai
// do JWT do aluno (cliente separado, ver app/src/lib/supabase-aluno.ts) e as
// leituras vão por service_role, porque o RLS deste banco serve só ao
// professor (cabeçalho de 0001_init.sql).
//
// ── Por que uma LISTA, e não uma sala ───────────────────────────────────────
//
// Até 0015 o aluno tinha no máximo uma sala — a 1:1 — e `sala-entrar` com
// corpo vazio bastava. Com turmas isso deixou de ser verdade: o mesmo aluno
// pode ter a sala individual dele E uma sala por turma em que está. Abrir
// "a" sala virou uma pergunta sem resposta única, e a resposta errada era
// pior que nenhuma: quem só tem turma recebia 404 na aba "Aula ao vivo".
//
// Esta função NÃO devolve token de LiveKit nem o token do link: ela é só o
// índice. Entrar continua sendo com `sala-entrar`, que é quem confere o
// vínculo de novo antes de assinar qualquer coisa — listar não é autorizar.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

/**
 * Uma porta na lista. `turmaId` só existe no tipo 'turma' — é ele que vai no
 * corpo de `sala-entrar` depois; a sala individual não precisa de id nenhum,
 * porque o JWT já diz de quem ela é.
 */
type SalaDoAluno =
  | { tipo: 'aluno'; nome: string }
  | { tipo: 'turma'; turmaId: string; nome: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)

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
  // 404 é identidade, não indisponibilidade — o painel usa esse status para
  // derrubar a sessão de quem entrou pela porta errada (features/painel/api.ts).
  if (!conta) return respostaErro('Conta não encontrada.', 404)

  const { data: professor } = await db
    .from('professores')
    .select('nome')
    .eq('id', conta.professor_id)
    .maybeSingle()
  const professorNome = professor?.nome ?? 'seu professor'

  const salas: SalaDoAluno[] = []

  // ── A sala individual ─────────────────────────────────────────────────────
  // Só entra na lista se a linha existir: a sala 1:1 nasce quando o professor
  // abre a ficha do aluno pela primeira vez (ver `sala-entrar`), e oferecer um
  // botão que devolve "Sala não encontrada" é pior que não oferecer nada.
  const { data: salaIndividual } = await db
    .from('salas')
    .select('id')
    .eq('aluno_id', conta.aluno_id)
    .maybeSingle()
  if (salaIndividual) salas.push({ tipo: 'aluno', nome: `Aula com ${professorNome}` })

  // ── As salas de turma ─────────────────────────────────────────────────────
  // `turmas_alunos` é a lista de quem é esperado na turma — a mesma que a
  // antessala do link consulta (0015). Aqui ela responde a pergunta inversa:
  // de quais turmas este aluno faz parte.
  const { data: vinculos } = await db
    .from('turmas_alunos')
    .select('turma_id')
    .eq('aluno_id', conta.aluno_id)

  const turmaIds = (vinculos ?? []).map((v) => v.turma_id)
  if (turmaIds.length > 0) {
    // Só as turmas que já têm sala criada, pelo mesmo motivo do 1:1 acima.
    const { data: salasDeTurma } = await db
      .from('salas')
      .select('turma_id')
      .in('turma_id', turmaIds)

    const comSala = (salasDeTurma ?? []).map((s) => s.turma_id as string)
    if (comSala.length > 0) {
      const { data: turmas } = await db
        .from('turmas')
        .select('id, nome')
        .in('id', comSala)
        .order('nome')

      for (const turma of turmas ?? []) {
        salas.push({ tipo: 'turma', turmaId: turma.id, nome: turma.nome })
      }
    }
  }

  return respostaJson({ salas, professorNome })
})
