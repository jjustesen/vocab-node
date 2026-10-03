// Deno Edge Function — chamada pelo PROFESSOR (JWT dele, verify-jwt ligado).
//
// As três saídas que o professor tem quando o login de um aluno dá problema e
// ele precisa resolver sozinho, sem depender de suporte:
//
//   - `excluir-login`:   apaga o usuário de login do aluno no Supabase Auth.
//                        Libera o e-mail para um cadastro novo; a ficha e todo
//                        o histórico ficam. (O "Resetar acesso" antigo só
//                        apagava `contas_aluno`: o usuário continuava no Auth
//                        segurando o e-mail, e o aluno não conseguia se
//                        cadastrar de novo com ele.)
//   - `redefinir-senha`: troca a senha do login do aluno pela que o professor
//                        digitou, para ele repassar.
//   - `excluir-aluno`:   apaga o login (como acima), os áudios de pronúncia no
//                        Storage e o aluno — o cascade leva tarefas, respostas,
//                        aulas e pagamentos.
//
// Precisa de service_role (auth.admin não existe para o JWT do professor).
// Por isso a função decide a posse sozinha: o aluno tem de ser deste
// professor, e o usuário de Auth só é tocado se for um login de aluno que
// pertence SÓ a ele — nunca a conta de um professor, nem um login que outro
// professor também usa (aí só o vínculo deste professor é desfeito).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

// deno-lint-ignore no-explicit-any
type Db = any

const ACOES = ['excluir-login', 'redefinir-senha', 'excluir-aluno'] as const
type Acao = (typeof ACOES)[number]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)
  const professorId = await usuarioDoJwt(autorizacao)
  if (!professorId) return respostaErro('Sessão inválida ou expirada.', 401)

  let corpo: { acao?: unknown; alunoId?: unknown; senha?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }
  const acao = corpo.acao as Acao
  if (!ACOES.includes(acao)) return respostaErro('Ação desconhecida.')
  if (typeof corpo.alunoId !== 'string') return respostaErro('Aluno não informado.')

  const db = clienteAdmin()

  const { data: aluno } = await db
    .from('alunos')
    .select('id, professor_id')
    .eq('id', corpo.alunoId)
    .maybeSingle()
  if (!aluno || aluno.professor_id !== professorId) return respostaErro('Aluno não encontrado.', 404)

  const { data: conta } = await db
    .from('contas_aluno')
    .select('id, user_id, email')
    .eq('aluno_id', aluno.id)
    .maybeSingle()

  if (acao === 'redefinir-senha') {
    if (!conta) return respostaErro('Este aluno não tem login. Gere um link de cadastro.', 409)
    const senha = typeof corpo.senha === 'string' ? corpo.senha : ''
    // Mesmo mínimo do cadastro pelo link (link-cadastro-concluir).
    if (senha.length < 6) return respostaErro('A senha precisa ter pelo menos 6 caracteres.')
    if (!(await loginSoDeste(db, conta.user_id, professorId))) {
      return respostaErro(
        'Este login também é usado em outra conta, então a senha não pode ser trocada por aqui. Use "Excluir login" e peça um cadastro novo.',
        409,
      )
    }
    const { error } = await db.auth.admin.updateUserById(conta.user_id, { password: senha })
    if (error) {
      if (/weak|pwned/i.test(error.message)) {
        return respostaErro('Senha fraca demais. Use uma senha mais longa, misturando letras e números.')
      }
      return respostaErro(error.message, 500)
    }
    return respostaJson({ ok: true, email: conta.email })
  }

  // excluir-login e excluir-aluno começam igual: tirar o login do caminho.
  if (conta) {
    const falha = await excluirLogin(db, conta, aluno.id, professorId)
    if (falha) return respostaErro(falha, 500)
  } else if (acao === 'excluir-login') {
    return respostaErro('Este aluno já está sem login.', 409)
  }

  if (acao === 'excluir-login') return respostaJson({ ok: true })

  // excluir-aluno: os áudios primeiro — o cascade do banco apaga as respostas,
  // mas não os arquivos que elas apontam. Falha aqui não impede a exclusão:
  // arquivo órfão é lixo, não vazamento (o bucket é privado).
  await apagarAudiosDoAluno(db, aluno.id)

  const { error: erroAluno } = await db.from('alunos').delete().eq('id', aluno.id)
  if (erroAluno) return respostaErro(erroAluno.message, 500)
  return respostaJson({ ok: true })
})

async function usuarioDoJwt(autorizacao: string): Promise<string | null> {
  const cliente = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data, error } = await cliente.auth.getUser()
  return error || !data.user ? null : data.user.id
}

/**
 * O usuário de Auth é um login de aluno que só este professor usa? Só então
 * ele pode ser apagado ou ter a senha trocada. `contas_aluno.user_id` não é
 * unique no schema — o mesmo e-mail poderia, em tese, estar ligado a alunos de
 * professores diferentes.
 */
async function loginSoDeste(db: Db, userId: string, professorId: string): Promise<boolean> {
  const [{ data: professor }, { data: contas }] = await Promise.all([
    db.from('professores').select('id').eq('id', userId).maybeSingle(),
    db.from('contas_aluno').select('professor_id').eq('user_id', userId),
  ])
  if (professor) return false
  return (contas ?? []).every((c: { professor_id: string }) => c.professor_id === professorId)
}

/** Devolve a mensagem de erro, ou null se deu certo. */
async function excluirLogin(
  db: Db,
  conta: { id: string; user_id: string; email: string },
  alunoId: string,
  professorId: string,
): Promise<string | null> {
  if (await loginSoDeste(db, conta.user_id, professorId)) {
    // `contas_aluno.user_id` é `on delete cascade`: a linha vai junto.
    const { error } = await db.auth.admin.deleteUser(conta.user_id)
    if (error) return error.message
  } else {
    const { error } = await db.from('contas_aluno').delete().eq('id', conta.id)
    if (error) return error.message
  }

  // Mesmo rastro do "Resetar acesso" (RF-26): é o que alimenta o "Último reset"
  // do menu. O check de `tipo` não tem um valor próprio para isto, e para o
  // professor o efeito é o mesmo — o acesso antigo deixou de existir.
  await db
    .from('eventos_acesso_aluno')
    .insert({ aluno_id: alunoId, tipo: 'acesso_resetado', email_antigo: conta.email })
  return null
}

/**
 * Só os arquivos que nenhum OUTRO aluno usa: "Copiar dados" (0021) faz a
 * resposta copiada apontar para o mesmo `audio_path`. Sem este filtro, copiar
 * A→B e depois excluir A apagaria os áudios de B.
 */
async function apagarAudiosDoAluno(db: Db, alunoId: string) {
  const { data: atribuicoes } = await db.from('atribuicoes').select('id').eq('aluno_id', alunoId)
  const ids = (atribuicoes ?? []).map((a: { id: string }) => a.id)
  const doAluno = new Set<string>(ids)
  for (let i = 0; i < ids.length; i += 100) {
    const { data: respostas } = await db
      .from('respostas')
      .select('audio_path')
      .in('atribuicao_id', ids.slice(i, i + 100))
      .not('audio_path', 'is', null)
    const caminhos: string[] = [...new Set<string>((respostas ?? []).map((r: { audio_path: string }) => r.audio_path))]
    if (caminhos.length === 0) continue

    const { data: usos } = await db.from('respostas').select('audio_path, atribuicao_id').in('audio_path', caminhos)
    const emUsoPorOutro = new Set(
      (usos ?? [])
        .filter((u: { atribuicao_id: string }) => !doAluno.has(u.atribuicao_id))
        .map((u: { audio_path: string }) => u.audio_path),
    )
    const livres = caminhos.filter((c) => !emUsoPorOutro.has(c))
    if (livres.length > 0) await db.storage.from('audio-respostas').remove(livres)
  }
}
