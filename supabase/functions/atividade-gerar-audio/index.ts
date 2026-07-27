// Deno Edge Function — chamada pelo PROFESSOR autenticado depois de salvar uma
// atividade, para gerar o áudio das questões `ordenar_audio` que ainda não têm
// (mesmo padrão de auth de gerar-atividade: verify-jwt ligado, cliente com o
// Authorization do professor, RLS decide o que ele pode tocar — sem
// service_role aqui, diferente de tarefa-*, que atende o ALUNO sem sessão).
//
// `useCriarAtividade` e `useAtualizarAtividadeCompleta` sempre apagam e
// reinserem as questões (ver api.ts) — então toda `ordenar_audio` chega aqui
// com `audio_path` nulo, mesmo em edição. Não existe caso de "frase mudou mas
// o áudio antigo ficou": a linha é sempre nova.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { gerarAudioTTS } from '../_shared/ia/tts.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: { atividade_id?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }
  const atividadeId = corpo.atividade_id
  if (typeof atividadeId !== 'string') return respostaErro('atividade_id ausente.')

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: sessao, error: erroSessao } = await db.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  // RLS de `questoes` já restringe a atividades do próprio professor
  // (`prof_owns_via_atividade`) — não confiamos só na UI ter mandado o id certo.
  const { data: questoes, error: erroQuestoes } = await db
    .from('questoes')
    .select('id, resposta_correta')
    .eq('atividade_id', atividadeId)
    .eq('tipo', 'ordenar_audio')
    .is('audio_path', null)
  if (erroQuestoes) return respostaErro(erroQuestoes.message, 500)
  if (!questoes || questoes.length === 0) return respostaJson({ ok: true, gerados: 0, falharam: 0 })

  let gerados = 0
  const falhas: string[] = []

  // Sequencial, não em paralelo: é chamado no fluxo de salvar a atividade, com
  // o professor olhando a tela — não vale a pena disparar N chamadas
  // simultâneas ao Gemini por uma tela que já vai mostrar "salvando...".
  for (const questao of questoes) {
    try {
      const wav = await gerarAudioTTS(questao.resposta_correta)
      const caminho = `${sessao.user.id}/${questao.id}.wav`

      const { error: erroUpload } = await db.storage
        .from('audio-questoes')
        .upload(caminho, wav, { contentType: 'audio/wav', upsert: true })
      if (erroUpload) throw new Error(erroUpload.message)

      const { error: erroUpdate } = await db.from('questoes').update({ audio_path: caminho }).eq('id', questao.id)
      if (erroUpdate) throw new Error(erroUpdate.message)

      gerados++
    } catch (e) {
      // Uma questão falhar não derruba as outras — a atividade já foi salva;
      // o professor vê no card se sobrou pendência e pode tentar de novo.
      falhas.push(e instanceof Error ? e.message : String(e))
    }
  }

  return respostaJson({ ok: true, gerados, falharam: falhas.length, erros: falhas.slice(0, 3) })
})
