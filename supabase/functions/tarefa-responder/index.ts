// Deno Edge Function — persiste a resposta. O feedback ao aluno já foi
// mostrado no cliente (corrigir() local, ver app/src/types/questao.ts); esta
// chamada roda em segundo plano, sem bloquear a tela do aluno.
//
// `correta` é RECALCULADO aqui a partir do que o servidor sabe — nunca
// confiamos no valor que o cliente eventualmente mande, mesmo sendo barato
// recalcular. O que o cliente decide é só a experiência; o registro que o
// professor vê vem sempre do servidor.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { resolverAtribuicao } from '../_shared/atribuicao.ts'
import { corrigir } from '../_shared/correcao.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: {
    token?: unknown
    atribuicao_id?: unknown
    access_token?: unknown
    questao_id?: unknown
    valor?: unknown
    tempo_ms?: unknown
  }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const { questao_id: questaoId, valor, tempo_ms: tempoMs } = corpo
  if (typeof questaoId !== 'string') return respostaErro('Questão inválida.')
  if (typeof valor !== 'string' || !valor.trim()) return respostaErro('Envie uma resposta.')

  const db = clienteAdmin()
  const atribuicao = await resolverAtribuicao(corpo, db)

  if (!atribuicao) return respostaErro('Link inválido ou expirado.', 404)
  if (atribuicao.revogada_em) return respostaErro('Este link foi desativado pelo professor.', 410)
  if (atribuicao.concluida_em) return respostaErro('Esta atividade já foi concluída.', 409)

  const { data: questao } = await db
    .from('questoes')
    .select('id, atividade_id, tipo, resposta_correta, respostas_aceitas, pares')
    .eq('id', questaoId)
    .maybeSingle()

  if (!questao || questao.atividade_id !== atribuicao.atividade_id) {
    return respostaErro('Questão não pertence a esta atividade.', 400)
  }

  const correta = corrigir(
    questao.tipo,
    questao.resposta_correta,
    questao.respostas_aceitas,
    valor,
    questao.pares,
  )

  const { error: erroResposta } = await db.from('respostas').upsert(
    {
      atribuicao_id: atribuicao.id,
      questao_id: questaoId,
      valor,
      correta,
      tempo_ms: typeof tempoMs === 'number' ? tempoMs : null,
    },
    { onConflict: 'atribuicao_id,questao_id' },
  )
  if (erroResposta) return respostaErro(erroResposta.message, 500)

  return respostaJson({ ok: true, correta })
})
