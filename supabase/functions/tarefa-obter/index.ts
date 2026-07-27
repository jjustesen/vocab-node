// Deno Edge Function — sem sessão, sem RLS. Ver supabase/functions/_shared/cliente-admin.ts.
//
// DECISÃO DE PRODUTO (26/07/2026): o gabarito completo (resposta_correta,
// respostas_aceitas, pares, explicacao) é devolvido para TODAS as questões
// já na primeira chamada — não só as já respondidas. Isso permite corrigir
// no navegador do aluno, sem esperar uma viagem ao servidor a cada resposta.
//
// Custo assumido conscientemente: um aluno que abrir o DevTools vê o
// gabarito inteiro antes de responder. Aceito porque o público é lição de
// casa de inglês, não uma prova — ver `docs/CONTRATO-QUESTOES.md` §7.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { resolverAtribuicao } from '../_shared/atribuicao.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { token?: unknown; atribuicao_id?: unknown; access_token?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const db = clienteAdmin()
  const atribuicao = await resolverAtribuicao(corpo, db)

  if (!atribuicao) return respostaErro('Link inválido ou expirado.', 404)
  if (atribuicao.revogada_em) return respostaErro('Este link foi desativado pelo professor.', 410)

  if (!atribuicao.iniciada_em) {
    await db.from('atribuicoes').update({ iniciada_em: new Date().toISOString() }).eq('id', atribuicao.id)
  }

  const [{ data: atividade }, { data: questoesRaw }, { data: respostas }] = await Promise.all([
    db.from('atividades').select('titulo, nivel, professor_id').eq('id', atribuicao.atividade_id).single(),
    db
      .from('questoes')
      .select('id, ordem, tipo, enunciado, opcoes, pares, resposta_correta, respostas_aceitas, explicacao, audio_path')
      .eq('atividade_id', atribuicao.atividade_id)
      .order('ordem'),
    db.from('respostas').select('questao_id, valor, correta').eq('atribuicao_id', atribuicao.id),
  ])

  if (!atividade) return respostaErro('Atividade não encontrada.', 404)

  const [{ data: professor }, { data: aluno }] = await Promise.all([
    db.from('professores').select('nome').eq('id', atividade.professor_id).single(),
    db.from('alunos').select('nome').eq('id', atribuicao.aluno_id).single(),
  ])

  const respostaPorQuestao = new Map((respostas ?? []).map((r) => [r.questao_id, r]))

  // Assinatura em lote: uma chamada para todos os áudios da tarefa, não uma por
  // questão — o aluno nunca fala com o Storage direto (RNF-10), então isto é o
  // único jeito de ele tocar o áudio sem ver o bucket. 1h cobre com folga
  // qualquer tarefa: a mais longa do produto é minutos, não horas.
  const caminhosDeAudio = (questoesRaw ?? [])
    .map((q) => q.audio_path)
    .filter((p): p is string => Boolean(p))
  const { data: assinadas } =
    caminhosDeAudio.length > 0
      ? await db.storage.from('audio-questoes').createSignedUrls(caminhosDeAudio, 3600)
      : { data: [] as { path: string | null; signedUrl: string }[] | null }
  const urlPorCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]))

  const questoes = (questoesRaw ?? []).map((q) => {
    const dada = respostaPorQuestao.get(q.id)
    return {
      id: q.id,
      ordem: q.ordem,
      tipo: q.tipo,
      enunciado: q.enunciado,
      opcoes: q.opcoes,
      pares: q.pares,
      resposta_correta: q.resposta_correta,
      respostas_aceitas: q.respostas_aceitas,
      explicacao: q.explicacao,
      // Nulo tanto quando a questão não é ordenar_audio quanto quando a
      // geração de áudio falhou ao salvar — os dois casos tratados do mesmo
      // jeito no cliente: sem URL, cai no fallback de texto.
      audio_url: q.audio_path ? (urlPorCaminho.get(q.audio_path) ?? null) : null,
      respondida: Boolean(dada),
      resposta_dada: dada?.valor ?? null,
      correta: dada?.correta ?? null,
    }
  })

  return respostaJson({
    atividade: { titulo: atividade.titulo, nivel: atividade.nivel },
    professor_nome: professor?.nome ?? 'seu professor',
    aluno_nome: aluno?.nome ?? 'aluno',
    prazo: atribuicao.prazo,
    concluida: Boolean(atribuicao.concluida_em),
    questoes,
  })
})
