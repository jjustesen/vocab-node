/**
 * Peças do "aluno que se cadastra sozinho" — hoje usadas pelo link de
 * cadastro do professor (0019, link-cadastro-*). O link aberto de atividade
 * (link-aberto-entrar) faz o mesmo par de inserts à mão e pode migrar para cá
 * quando for mexido.
 *
 * Sempre com `clienteAdmin()`: quem chama não tem sessão de professor, então
 * RLS não ajuda — a autorização já foi decidida pela posse do token.
 */
import { limiteAlunos } from './planos.ts'
import { hashDoToken } from './token.ts'

// deno-lint-ignore no-explicit-any
type Db = any

export type Falha = { status: number; mensagem: string }

export type LinkDeCadastro = { id: string; professor_id: string; expira_em: string }

/**
 * Valida o token do link de cadastro (0019) por hash. Vencido e inexistente
 * têm mensagens diferentes porque pedem a mesma ação, mas por motivos que o
 * aluno entende de jeitos diferentes ("expirou" vs. "foi trocado").
 */
export async function resolverLinkDeCadastro(db: Db, token: unknown): Promise<LinkDeCadastro | Falha> {
  if (typeof token !== 'string' || token.length < 20) return { status: 404, mensagem: 'Link de cadastro inválido.' }

  const { data: link } = await db
    .from('links_cadastro')
    .select('id, professor_id, expira_em')
    .eq('token_hash', await hashDoToken(token))
    .maybeSingle()

  if (!link) {
    return {
      status: 404,
      mensagem: 'Este link de cadastro não existe ou foi substituído por um novo. Peça o link atual ao seu professor.',
    }
  }
  if (new Date(link.expira_em) <= new Date()) {
    return { status: 410, mensagem: 'Este link de cadastro expirou. Peça um novo ao seu professor.' }
  }
  return link
}

export function ehFalha(valor: object): valor is Falha {
  return 'mensagem' in valor && 'status' in valor
}

/**
 * `null` = há vaga; senão, o teto do plano que já foi atingido.
 *
 * A contagem é a mesma de useCriarAluno no front (alunos ATIVOS do
 * professor). Não é atômica: dois cadastros no mesmo segundo, com uma vaga
 * sobrando, podem passar ambos. Aceito de propósito — estourar o teto por um
 * aluno é barato, e travar a tabela por isso não seria.
 */
export async function limiteDeAlunosAtingido(db: Db, professorId: string): Promise<number | null> {
  const { data: professor } = await db.from('professores').select('plano').eq('id', professorId).single()
  const limite = limiteAlunos(professor?.plano ?? 'gratuito')
  if (limite === null) return null

  const { count } = await db
    .from('alunos')
    .select('*', { count: 'exact', head: true })
    .eq('professor_id', professorId)
    .eq('status', 'ativo')
  return (count ?? 0) >= limite ? limite : null
}

/**
 * Cria `alunos` + `contas_aluno` + auditoria para um usuário de auth que JÁ
 * existe. Se `contas_aluno` falhar, desfaz o `alunos` — sem conta, o aluno
 * apareceria na lista do professor sem nunca conseguir entrar.
 */
export async function criarAlunoComConta(
  db: Db,
  { professorId, userId, email, nome }: { professorId: string; userId: string; email: string; nome: string },
): Promise<{ alunoId: string } | Falha> {
  const { data: aluno, error: erroAluno } = await db
    .from('alunos')
    .insert({ professor_id: professorId, nome, email })
    .select('id')
    .single()
  if (erroAluno) return { status: 500, mensagem: erroAluno.message }

  const { error: erroConta } = await db.from('contas_aluno').insert({
    aluno_id: aluno.id,
    professor_id: professorId,
    user_id: userId,
    email,
  })
  if (erroConta) {
    await db.from('alunos').delete().eq('id', aluno.id)
    if (erroConta.code === '23505') {
      return { status: 409, mensagem: 'Este e-mail já está cadastrado com este professor. Entre em vez de se cadastrar.' }
    }
    return { status: 500, mensagem: erroConta.message }
  }

  await db.from('eventos_acesso_aluno').insert({ aluno_id: aluno.id, tipo: 'conta_criada', email_novo: email })
  return { alunoId: aluno.id }
}
