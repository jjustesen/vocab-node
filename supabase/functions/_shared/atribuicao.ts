import { hashDoToken } from './token.ts'

export type AtribuicaoResolvida = {
  id: string
  atividade_id: string
  aluno_id: string
  trilha_etapa_id: string | null
  prazo: string | null
  iniciada_em: string | null
  concluida_em: string | null
  revogada_em: string | null
  enviada_em: string
}

const SELECT_ATRIBUICAO =
  'id, atividade_id, aluno_id, trilha_etapa_id, prazo, iniciada_em, concluida_em, revogada_em, enviada_em'

/**
 * Duas formas de identificar a atribuição em tarefa-obter/responder/concluir:
 *
 *  - `{ token }` — link anônimo (RF-20), o modo original, sem sessão.
 *  - `{ atribuicao_id, access_token }` — aluno LOGADO (RF-28/painel).
 *    `access_token` é a sessão do Supabase Auth do ALUNO (cliente próprio em
 *    lib/supabase-aluno.ts, nunca o do professor). Validamos o JWT e
 *    conferimos que a atribuição pertence mesmo à conta desse aluno antes de
 *    devolver qualquer coisa — não confiamos no `atribuicao_id` sozinho.
 *
 * Em ambos os casos quem chama é `clienteAdmin()` — RLS não entra aqui
 * (ver cabeçalho de 0001_init.sql).
 */
export async function resolverAtribuicao(
  corpo: { token?: unknown; atribuicao_id?: unknown; access_token?: unknown },
  // deno-lint-ignore no-explicit-any
  db: any,
): Promise<AtribuicaoResolvida | null> {
  if (typeof corpo.token === 'string' && corpo.token.length >= 20) {
    const hash = await hashDoToken(corpo.token)
    const { data } = await db.from('atribuicoes').select(SELECT_ATRIBUICAO).eq('token_hash', hash).maybeSingle()
    return data ?? null
  }

  if (typeof corpo.atribuicao_id === 'string' && typeof corpo.access_token === 'string') {
    const { data: sessao } = await db.auth.getUser(corpo.access_token)
    if (!sessao?.user) return null

    const { data: conta } = await db
      .from('contas_aluno')
      .select('aluno_id')
      .eq('user_id', sessao.user.id)
      .maybeSingle()
    if (!conta) return null

    const { data } = await db
      .from('atribuicoes')
      .select(SELECT_ATRIBUICAO)
      .eq('id', corpo.atribuicao_id)
      .eq('aluno_id', conta.aluno_id)
      .maybeSingle()
    return data ?? null
  }

  return null
}
