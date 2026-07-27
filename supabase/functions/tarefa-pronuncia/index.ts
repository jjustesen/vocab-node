// Deno Edge Function — pontua uma leitura em voz alta.
//
// É a EXCEÇÃO ao §7 do CONTRATO-QUESTOES.md: todo outro tipo é corrigido no
// navegador do aluno e persistido em segundo plano; aqui a tela espera, porque
// a nota só existe depois da chamada à IA (que precisa de chave de API).
//
// Custo por RESPOSTA, não por geração: cada gravação é uma chamada paga. Daí o
// teto de tentativas por questão e o limite de tamanho do áudio — sem isso, um
// aluno segurando o botão de gravar vira uma conta aberta.
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { resolverAtribuicao } from '../_shared/atribuicao.ts'
import { corretaPorPontuacao } from '../_shared/correcao.ts'
import { avaliarPronuncia } from '../_shared/ia/pronuncia.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

/** ~1,5 MB de base64 ≈ 1,1 MB de áudio ≈ 60s de webm/opus mono. */
const MAXIMO_BASE64 = 1_500_000
const MAXIMO_TENTATIVAS = 4
const MIMES_ACEITOS = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let corpo: {
    token?: unknown
    atribuicao_id?: unknown
    access_token?: unknown
    questao_id?: unknown
    audio_base64?: unknown
    mime_type?: unknown
    tempo_ms?: unknown
  }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const { questao_id: questaoId, audio_base64: audioBase64, mime_type: mimeType, tempo_ms: tempoMs } = corpo
  if (typeof questaoId !== 'string') return respostaErro('Questão inválida.')
  if (typeof audioBase64 !== 'string' || !audioBase64) return respostaErro('Envie a gravação.')
  if (audioBase64.length > MAXIMO_BASE64) {
    return respostaErro('Gravação longa demais — grave até cerca de 1 minuto.', 413)
  }
  // O mime vem do MediaRecorder e varia por navegador ("audio/webm;codecs=opus").
  const mimeBase = typeof mimeType === 'string' ? mimeType.split(';')[0].trim() : ''
  if (!MIMES_ACEITOS.includes(mimeBase)) return respostaErro('Formato de áudio não suportado.', 415)

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

  // Teto de regravações. A contagem mora no próprio `valor` (JSON) para não
  // exigir mais uma coluna — ver CONTRATO-QUESTOES.md §4.
  const { data: anterior } = await db
    .from('respostas')
    .select('valor, audio_path')
    .eq('atribuicao_id', atribuicao.id)
    .eq('questao_id', questaoId)
    .maybeSingle()

  const tentativasAnteriores = lerTentativas(anterior?.valor)
  if (tentativasAnteriores >= MAXIMO_TENTATIVAS) {
    return respostaErro(`Você já usou as ${MAXIMO_TENTATIVAS} tentativas desta questão.`, 429)
  }

  let avaliacao
  try {
    avaliacao = await avaliarPronuncia({
      fraseAlvo: questao.resposta_correta,
      audioBase64,
      mimeType: mimeBase,
    })
  } catch (e) {
    // Falha da IA não queima tentativa nem grava resposta — o aluno tenta de
    // novo sem prejuízo, mesma regra do RF-73 na geração.
    return respostaErro(e instanceof Error ? e.message : 'Não foi possível avaliar a gravação.', 502)
  }

  // O dono do arquivo é o PROFESSOR, não o aluno: o primeiro segmento do path
  // é o que a policy do bucket usa para decidir quem lê (migration 0005).
  // `atribuicoes` não guarda professor_id — ele vem pela atividade.
  const { data: atividade } = await db
    .from('atividades')
    .select('professor_id')
    .eq('id', atribuicao.atividade_id)
    .maybeSingle()
  if (!atividade) return respostaErro('Atividade não encontrada.', 404)

  // A gravação sobrescreve a anterior de propósito: o professor ouve a tentativa
  // que valeu, e não acumulamos 4 arquivos por questão por aluno.
  const extensao = mimeBase.split('/')[1] ?? 'webm'
  const caminho = `${atividade.professor_id}/${atribuicao.id}/${questaoId}.${extensao}`
  const { error: erroUpload } = await db.storage
    .from('audio-respostas')
    .upload(caminho, base64ParaBytes(audioBase64), { contentType: mimeBase, upsert: true })

  // Falha de upload não invalida a nota — o professor perde o áudio, não o
  // resultado. Melhor uma nota sem gravação do que uma tentativa perdida.
  const audioPath = erroUpload ? (anterior?.audio_path ?? null) : caminho

  const tentativas = tentativasAnteriores + 1
  const correta = corretaPorPontuacao(avaliacao.pontuacao)

  const { error: erroResposta } = await db.from('respostas').upsert(
    {
      atribuicao_id: atribuicao.id,
      questao_id: questaoId,
      valor: JSON.stringify({ transcricao: avaliacao.transcricao, tentativas }),
      correta,
      pontuacao: avaliacao.pontuacao,
      audio_path: audioPath,
      tempo_ms: typeof tempoMs === 'number' ? tempoMs : null,
    },
    { onConflict: 'atribuicao_id,questao_id' },
  )
  if (erroResposta) return respostaErro(erroResposta.message, 500)

  return respostaJson({
    ok: true,
    correta,
    pontuacao: avaliacao.pontuacao,
    transcricao: avaliacao.transcricao,
    comentario: avaliacao.comentario,
    tentativas_restantes: MAXIMO_TENTATIVAS - tentativas,
  })
})

function lerTentativas(valor: unknown): number {
  if (typeof valor !== 'string') return 0
  try {
    const dados = JSON.parse(valor)
    return typeof dados?.tentativas === 'number' ? dados.tentativas : 0
  } catch {
    return 0
  }
}

function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}
