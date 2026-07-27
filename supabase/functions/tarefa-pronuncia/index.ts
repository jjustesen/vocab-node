// Deno Edge Function — grava a resposta de uma questão de pronúncia.
//
// A nota NÃO sai daqui de forma independente: quem transcreve é o
// `SpeechRecognition` do navegador do aluno (decisão de 26/07/2026 — custo zero
// no lugar de uma chamada paga por gravação). O que chega é a TRANSCRIÇÃO.
//
// O que este endpoint faz de próprio, e é o ponto: recalcula a nota a partir da
// transcrição, com a mesma fórmula do cliente. Vale a mesma regra de
// `tarefa-responder` — o cliente decide a experiência, o servidor decide o
// registro que o professor vê. Se confiássemos na nota enviada, bastaria o
// aluno editar um POST para tirar 100.
//
// Existe separado de `tarefa-responder` por causa do áudio: a gravação vai para
// o bucket e o caminho fica em `respostas.audio_path`, para o professor ouvir.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { resolverAtribuicao } from '../_shared/atribuicao.ts'
import { corretaPorPontuacao, pontuarPronuncia } from '../_shared/correcao.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

/** ~1,5 MB de base64 ≈ 1,1 MB de áudio ≈ 60s de webm/opus mono. */
const MAXIMO_BASE64 = 1_500_000
const MIMES_ACEITOS = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: {
    token?: unknown
    atribuicao_id?: unknown
    access_token?: unknown
    questao_id?: unknown
    transcricao?: unknown
    audio_base64?: unknown
    mime_type?: unknown
    tempo_ms?: unknown
  }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const {
    questao_id: questaoId,
    transcricao,
    audio_base64: audioBase64,
    mime_type: mimeType,
    tempo_ms: tempoMs,
  } = corpo

  if (typeof questaoId !== 'string') return respostaErro('Questão inválida.')
  // Transcrição vazia é resultado LEGÍTIMO: o aluno pode ter gravado silêncio,
  // ou o reconhecedor pode não ter entendido nada. Isso vira nota 0, não erro
  // de requisição — o aluno precisa poder registrar a tentativa e seguir.
  if (typeof transcricao !== 'string') return respostaErro('Transcrição ausente.')

  // O áudio é opcional: se o upload não vier (navegador sem MediaRecorder, por
  // exemplo), o professor perde a gravação mas o aluno não perde a resposta.
  const temAudio = typeof audioBase64 === 'string' && audioBase64.length > 0
  if (temAudio && audioBase64.length > MAXIMO_BASE64) {
    return respostaErro('Gravação longa demais — grave até cerca de 1 minuto.', 413)
  }
  // O mime vem do MediaRecorder e varia por navegador ("audio/webm;codecs=opus").
  const mimeBase = typeof mimeType === 'string' ? mimeType.split(';')[0].trim() : ''
  if (temAudio && !MIMES_ACEITOS.includes(mimeBase)) {
    return respostaErro('Formato de áudio não suportado.', 415)
  }

  const db = clienteAdmin()
  const atribuicao = await resolverAtribuicao(corpo, db)

  if (!atribuicao) return respostaErro('Link inválido ou expirado.', 404)
  if (atribuicao.revogada_em) return respostaErro('Este link foi desativado pelo professor.', 410)
  if (atribuicao.concluida_em) return respostaErro('Esta atividade já foi concluída.', 409)

  const { data: questao } = await db
    .from('questoes')
    .select('id, atividade_id, tipo, resposta_correta')
    .eq('id', questaoId)
    .maybeSingle()

  if (!questao || questao.atividade_id !== atribuicao.atividade_id) {
    return respostaErro('Questão não pertence a esta atividade.', 400)
  }
  if (questao.tipo !== 'pronuncia') return respostaErro('Esta questão não é de pronúncia.', 400)

  const pontuacao = pontuarPronuncia(questao.resposta_correta, transcricao)
  const correta = corretaPorPontuacao(pontuacao)

  let audioPath: string | null = null
  if (temAudio) {
    // O dono do arquivo é o PROFESSOR, não o aluno: o primeiro segmento do path
    // é o que a policy do bucket usa para decidir quem lê (migration 0005).
    // `atribuicoes` não guarda professor_id — ele vem pela atividade.
    const { data: atividade } = await db
      .from('atividades')
      .select('professor_id')
      .eq('id', atribuicao.atividade_id)
      .maybeSingle()

    if (atividade) {
      const extensao = mimeBase.split('/')[1] ?? 'webm'
      const caminho = `${atividade.professor_id}/${atribuicao.id}/${questaoId}.${extensao}`
      const { error: erroUpload } = await db.storage
        .from('audio-respostas')
        .upload(caminho, base64ParaBytes(audioBase64 as string), {
          contentType: mimeBase,
          // Regravar sobrescreve: o professor ouve a tentativa que valeu, e não
          // acumulamos um arquivo por tentativa por questão por aluno.
          upsert: true,
        })
      // Falha de upload não invalida a nota — perde-se o áudio, não o resultado.
      if (!erroUpload) audioPath = caminho
    }
  }

  const { error: erroResposta } = await db.from('respostas').upsert(
    {
      atribuicao_id: atribuicao.id,
      questao_id: questaoId,
      valor: transcricao,
      correta,
      pontuacao,
      audio_path: audioPath,
      tempo_ms: typeof tempoMs === 'number' ? tempoMs : null,
    },
    { onConflict: 'atribuicao_id,questao_id' },
  )
  if (erroResposta) return respostaErro(erroResposta.message, 500)

  return respostaJson({ ok: true, correta, pontuacao })
})

function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}
