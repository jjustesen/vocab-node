/**
 * Qual conta de aluno usar quando um login tem mais de um professor
 * (docs/TUTOR-TRILHAS.md §6.1: `contas_aluno` é única por professor e e-mail,
 * então a mesma pessoa pode ter uma conta com cada professor).
 *
 * O app manda o professor escolhido no cabeçalho `x-professor` (o "Trocar" do
 * painel). Sem cabeçalho, ou com um professor que não é dele, vale a conta mais
 * antiga — o mesmo de antes para quem tem um professor só.
 */
import type { clienteAdmin } from './cliente-admin.ts'

type Db = ReturnType<typeof clienteAdmin>

export type ContaDoAluno = { aluno_id: string; professor_id: string }

export async function contasDoLogin(db: Db, userId: string) {
  const { data } = await db
    .from('contas_aluno')
    .select('aluno_id, professor_id, criado_em, professores(nome)')
    .eq('user_id', userId)
    .order('criado_em')
  return (data ?? []) as unknown as (ContaDoAluno & { professores: { nome: string } | null })[]
}

export async function contaDoAluno(db: Db, userId: string, req: Request): Promise<ContaDoAluno | null> {
  const contas = await contasDoLogin(db, userId)
  const escolhido = req.headers.get('x-professor')
  const conta = contas.find((c) => c.professor_id === escolhido) ?? contas[0]
  return conta ? { aluno_id: conta.aluno_id, professor_id: conta.professor_id } : null
}

/**
 * Para as consultas que já leem `contas_aluno` com colunas embutidas:
 * `.match(filtroDoProfessor(req)).order('criado_em').limit(1)` escolhe a mesma
 * conta que `contaDoAluno`, desde que o cabeçalho seja de um professor do login
 * (o app só manda os que o painel listou).
 */
export function filtroDoProfessor(req: Request): Record<string, string> {
  const escolhido = req.headers.get('x-professor')
  return escolhido && /^[0-9a-f-]{36}$/i.test(escolhido) ? { professor_id: escolhido } : {}
}
