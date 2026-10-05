// Deno Edge Function — a POC do tutor oral (poc-tutor/ na raiz do repositório).
//
// Chamada pela página da POC SEM LOGIN: publique com --no-verify-jwt. Não toca
// no banco. Duas ações:
//
//   avaliar → ouve o turno do aluno e CLASSIFICA a resposta. Quem decide o que
//             o tutor faz depois é o controlador, no navegador
//             (poc-tutor/src/controlador.ts) — aqui só se ouve e se avalia.
//   falar   → a voz do tutor, gerada na hora pelo Gemini TTS (WAV inteiro).
//   falar_stream → a mesma voz em pedaços (NDJSON), tocada enquanto chega.
//             Só para falas que não existem pré-gravadas (pista do Gemini,
//             o que o aluno disse): as fixas a página já tem em arquivo.
//
// ── Avaliar: Gemini ouve, Jev decide, Gemini só quando precisa ──────────────
//
// 1. Transcrição CEGA pelo Gemini: ele ouve o áudio sem saber o que o aluno
//    deveria ter dito. Mesma regra de _shared/ia/transcricao.ts — sabendo a
//    resposta, o modelo "ouve" a resposta, e todo "They was" vira "They were".
// 2. Jev (TypeSafe AI) classifica o texto: adequada, erro, ou "outro" (dúvida,
//    pedido de ajuda, comentário). Responde em ~300 ms, contra 2–5 s do Gemini,
//    e devolve a CONFIANÇA da decisão.
// 3. O Gemini avaliador só entra quando o Jev não basta: confiança baixa,
//    "outro" (é preciso escrever a resposta da dúvida ou a ajuda pedida),
//    conversa (é preciso reagir ao que o aluno contou) e erro onde existe
//    escada de apoio (decidir se falta a base é julgamento mais fino).
//
// Acerto e erro comuns — a maioria dos turnos — saem só com transcrição + Jev.
//
// ── Acesso ──────────────────────────────────────────────────────────────────
//
// Sem login, qualquer um com a URL gastaria Gemini à vontade — e a URL é fácil
// de adivinhar: o endereço do projeto está no bundle público do app. Por isso a
// função só responde a quem mandar a SENHA da secret POC_TUTOR_CODIGO (a página
// pede numa tela; a senha nunca está no código), e SEM a secret ela recusa
// tudo: esquecer de configurar tem de dar erro, não um proxy aberto do Gemini.
// Para trocar a senha: supabase secrets set POC_TUTOR_CODIGO=<nova>.

import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

const TIMEOUT_MS = 30_000
/** ~30s de webm/opus ficam bem abaixo disto; acima, algo está errado. */
const AUDIO_MAX_BASE64 = 4 * 1024 * 1024
/** Abaixo desta confiança, a decisão do Jev vai para o Gemini conferir. */
const CONFIANCA_MINIMA_JEV = 0.8
// Flash-Lite: 1/3 mais barato que o Flash TTS e feito para baixa latência.
const MODELO_TTS = Deno.env.get('POC_TUTOR_MODELO_TTS') ?? 'gemini-3.8-flash-lite-tts'
const VOZ_TTS = Deno.env.get('POC_TUTOR_VOZ') ?? 'Kore'

type Parte = { idioma: 'pt' | 'en'; texto: string }

type Pedido = {
  codigo?: string
  acao?: 'avaliar' | 'falar' | 'falar_stream' | 'verificar'
  // avaliar
  audio?: { base64: string; mimeType: string }
  texto?: string
  contexto?: Record<string, unknown>
  // falar
  fala?: Parte[]
}

type Transcricao = { texto: string; confianca: 'alta' | 'baixa' }

type AvaliacaoGemini = {
  tipo: 'adequada' | 'erro' | 'falta_prerequisito' | 'duvida' | 'pedido_ajuda' | 'parte_certa'
  habilidade?: string
  pista?: string
  problema?: string
  acerto_parcial?: string
  resposta_duvida?: string
  reacao?: string
  ajuda?: string
}

/** Tokens gastos por serviço — a página multiplica pelo preço de cada um. */
type Custo = { servico: string; entrada: number; saida: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  let pedido: Pedido
  try {
    pedido = await req.json()
  } catch {
    return respostaErro('Corpo inválido.')
  }

  const codigo = Deno.env.get('POC_TUTOR_CODIGO')
  if (!codigo) return respostaErro('POC_TUTOR_CODIGO não configurado.', 503)
  if (pedido.codigo !== codigo) {
    // Senha errada demora: tentar senhas no automático fica lento demais.
    await new Promise((r) => setTimeout(r, 1500))
    return respostaErro('Senha incorreta.', 403)
  }
  if (pedido.acao === 'verificar') return respostaJson({ ok: true })

  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) return respostaErro('GEMINI_API_KEY não configurada.', 500)

  try {
    if (pedido.acao === 'falar') return await falar(chave, pedido)
    if (pedido.acao === 'falar_stream') return await falarEmStream(chave, pedido)
    return await avaliar(chave, pedido)
  } catch (e) {
    console.error('poc-tutor:', e)
    return respostaErro(e instanceof Error ? e.message : 'Falha ao falar com a IA.', 502)
  }
})

// ── Avaliar ──────────────────────────────────────────────────────────────────

async function avaliar(chave: string, pedido: Pedido): Promise<Response> {
  if (!pedido.contexto) return respostaErro('Falta o contexto do exercício.')
  if (!pedido.audio && typeof pedido.texto !== 'string') return respostaErro('Mande áudio ou texto.')
  if (pedido.audio && pedido.audio.base64.length > AUDIO_MAX_BASE64) return respostaErro('Áudio longo demais.', 413)

  const modelo = Deno.env.get('POC_TUTOR_MODELO') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
  const custos: Custo[] = []
  const tempos: Record<string, number> = {}
  const contexto = pedido.contexto

  // ── 1. O que foi dito ────────────────────────────────────────────────────
  let transcricao: Transcricao
  if (pedido.audio) {
    const inicio = Date.now()
    const r = await chamarGemini<Transcricao>(chave, modelo, {
      sistema: INSTRUCAO_TRANSCRICAO,
      parts: [{ inline_data: { mime_type: pedido.audio.mimeType, data: pedido.audio.base64 } }],
      schema: SCHEMA_TRANSCRICAO,
      temperatura: 0,
    })
    transcricao = r.dados
    custos.push({ servico: modelo, ...r.uso })
    tempos.transcricaoMs = Date.now() - inicio
  } else {
    // Texto digitado: não há incerteza de reconhecimento.
    transcricao = { texto: pedido.texto!.trim(), confianca: 'alta' }
  }

  // Critério 7: sem fala, ou fala que o modelo não distinguiu com segurança,
  // é incerteza de ÁUDIO — nunca vai para a avaliação de inglês.
  if (!transcricao.texto || transcricao.confianca === 'baixa') {
    return respostaJson({ transcricao, avaliacao: { tipo: 'audio_incerto' }, decidiuPor: 'audio', custos, tempos })
  }

  // ── 2. Jev: certo, errado, ou não é resposta ──────────────────────────────
  let motivoGemini = 'Jev indisponível'
  const chaveJev = Deno.env.get('TYPESAFE_API_KEY')
  if (chaveJev) {
    try {
      const inicio = Date.now()
      const jev = await classificarComJev(chaveJev, contexto, transcricao.texto)
      tempos.jevMs = Date.now() - inicio
      custos.push({ servico: 'jev', entrada: jev.uso.entrada, saida: 0 })

      const conversa = contexto.modo === 'conversa'
      const apoio = contexto.apoio_disponivel === true
      if (jev.confianca < CONFIANCA_MINIMA_JEV) motivoGemini = `Jev sem certeza (${jev.classe}, ${jev.confianca})`
      else if (jev.classe === 'outro') motivoGemini = 'não é tentativa de resposta (dúvida ou pedido)'
      else if (jev.classe === 'parte') motivoGemini = 'respondeu só à pergunta da pista'
      else if (conversa) motivoGemini = 'conversa: reagir ao conteúdo'
      else if (jev.classe === 'erro' && apoio) motivoGemini = 'erro com escada de apoio disponível'
      else if (jev.classe === 'erro' && jev.habilidade === 'outra') motivoGemini = 'erro fora das habilidades do exercício'
      // A pista do roteiro só serve na primeira tentativa e para o erro que ele
      // previu. Fora disso, o Gemini escreve a pergunta para ESTE erro.
      else if (jev.classe === 'erro' && Number(contexto.nivel_ajuda ?? 0) > 0) motivoGemini = 'segunda tentativa: pergunta para este erro'
      else if (jev.classe === 'erro' && !erroPrevisto(contexto, jev.habilidade)) motivoGemini = 'erro não previsto: escrever a pergunta'
      else {
        const avaliacao: AvaliacaoGemini =
          jev.classe === 'adequada'
            ? { tipo: 'adequada' }
            : { tipo: 'erro', habilidade: jev.habilidade, problema: `erro em ${jev.habilidade}` }
        return respostaJson({ transcricao, avaliacao, decidiuPor: 'jev', jev, custos, tempos })
      }
    } catch (e) {
      // Jev fora do ar não pode parar a aula: o Gemini avalia sozinho.
      console.error('poc-tutor jev:', e)
      motivoGemini = 'Jev falhou'
    }
  }

  // ── 3. Gemini: quando é preciso julgar mais fino ou escrever algo ─────────
  const inicio = Date.now()
  const r = await chamarGemini<AvaliacaoGemini>(chave, modelo, {
    sistema: INSTRUCAO_AVALIACAO,
    parts: [
      {
        text:
          `CONTEXTO DO EXERCÍCIO (JSON):\n${JSON.stringify(contexto, null, 2)}\n\n` +
          `RESPOSTA DO ALUNO (transcrita):\n"""${transcricao.texto}"""`,
      },
    ],
    schema: SCHEMA_AVALIACAO,
    temperatura: 0.2,
  })
  custos.push({ servico: modelo, ...r.uso })
  tempos.avaliacaoMs = Date.now() - inicio
  return respostaJson({ transcricao, avaliacao: r.dados, decidiuPor: 'gemini', motivoGemini, custos, tempos })
}

function erroPrevisto(contexto: Record<string, unknown>, habilidade: string): boolean {
  const previstos = (contexto.erros_previstos as { habilidade: string }[] | undefined) ?? []
  return previstos.some((e) => e.habilidade === habilidade)
}

type ResultadoJev = {
  classe: 'adequada' | 'erro' | 'outro' | 'parte'
  confianca: number
  habilidade: string
  uso: { entrada: number }
}

/**
 * Duas perguntas numa chamada só: a classe da resposta e, se for erro, qual
 * habilidade falhou (entre as do exercício). O contexto vai inteiro como
 * "state" — o Jev precisa da última frase aceita para ver que "It was sunny
 * yesterday" perdeu o rainy.
 */
async function classificarComJev(chave: string, contexto: Record<string, unknown>, resposta: string): Promise<ResultadoJev> {
  const habilidades = (contexto.habilidades as string[] | undefined)?.length
    ? (contexto.habilidades as string[])
    : ['estrutura']
  const errosPrevistos = (contexto.erros_previstos as { exemplo: string; habilidade: string }[] | undefined) ?? []
  const criteriosHabilidade = Object.fromEntries(
    habilidades.map((h) => {
      const exemplos = errosPrevistos.filter((e) => e.habilidade === h).map((e) => `"${e.exemplo}"`)
      return [h, exemplos.length ? `erro em ${h} (por exemplo ${exemplos.join(', ')})` : `erro em ${h}`]
    }),
  )
  // Sem esta saída o Jev é obrigado a encaixar qualquer erro numa habilidade
  // do exercício — "It's windy" (tempo verbal) virava "adjetivo do clima", e a
  // pista do roteiro apontava para o lugar errado.
  criteriosHabilidade.outra = 'o erro é de outro tipo, fora destas habilidades (tempo verbal, sujeito, palavra trocada…)'

  const controlador = new AbortController()
  const timeoutId = setTimeout(() => controlador.abort(), 10_000)
  try {
    const r = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      signal: controlador.signal,
      body: JSON.stringify({
        model: 'jev-latest',
        state: {
          aula: 'Aula oral de inglês para brasileiro. Na substituição, a pista transforma a ÚLTIMA FRASE ACEITA e o resto dela deve ser preservado.',
          exercicio: contexto,
          resposta_do_aluno: resposta,
        },
        questions: {
          classe: {
            type: 'choice',
            instructions: 'Classifique a resposta do aluno ao pedido pendente.',
            criteria: {
              adequada:
                'realiza o que foi pedido (transformação, tradução, repetição ou resposta pertinente na conversa); aceita contrações, variantes naturais equivalentes, maiúsculas, pontuação e hesitações',
              erro: 'tenta responder em inglês, mas não realiza o pedido ou erra a estrutura-alvo (inclusive perder uma mudança anterior da cadeia)',
              outro: 'não é uma tentativa de resposta: pergunta, dúvida, pedido de ajuda, "não sei", comentário em português, ou tentativa interrompida por um pedido',
              parte: 'o tutor acabou de fazer uma pergunta na pista (exercicio.ultima_ajuda) e o aluno respondeu SÓ a ela, com uma palavra ou um pedaço curto, sem dizer a frase inteira',
            },
          },
          habilidade: {
            type: 'choice',
            instructions: 'Se a resposta tiver erro, qual habilidade falhou? Se não tiver erro, escolha a mais próxima.',
            criteria: criteriosHabilidade,
          },
        },
      }),
    })
    if (!r.ok) throw new Error(`Jev respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    return {
      classe: j.answers.classe.choice,
      confianca: j.answers.classe.confidence,
      habilidade: j.answers.habilidade?.choice ?? habilidades[0],
      uso: { entrada: j.usage?.input_tokens ?? 0 },
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── Falar ────────────────────────────────────────────────────────────────────

/**
 * A fala do tutor em áudio, gerada na hora. Uma chamada por fala inteira, com
 * português e inglês juntos: o modelo troca de idioma no meio da frase sem
 * trocar de voz — é o que a voz do navegador não consegue.
 */
async function falar(chave: string, pedido: Pedido): Promise<Response> {
  const partes = pedido.fala ?? []
  const texto = partes.map((p) => p.texto).join(' ').trim()
  if (!texto) return respostaErro('Fala vazia.')
  if (texto.length > 1500) return respostaErro('Fala longa demais.', 413)

  // Só o texto, sem instrução de estilo: com uma instrução longa na frente o
  // modelo a lia em voz alta junto (uma fala de 5 s virava 24 s de áudio). O
  // estilo vem da voz escolhida (POC_TUTOR_VOZ).
  const instrucao = texto

  const inicio = Date.now()
  const controlador = new AbortController()
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_TTS}:generateContent?key=${chave}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controlador.signal,
        body: JSON.stringify({
          // O MESMO perfil de voz em toda fala: voz fixa (VOZ_TTS) e semente
          // fixa. Temperatura baixa NÃO: com ela o modelo gerava silêncio sem fim. Direção de estilo NÃO entra: instrução de
          // sistema este modelo recusa (400), e qualquer nota antes do texto
          // ele lia em voz alta ("Muito bem." virava 7 s; uma fala, 46 s).
          contents: [{ role: 'user', parts: [{ text: instrucao }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            seed: 7,
            // Teto proporcional ao texto (~25 tokens por segundo de fala, com
            // folga): com temperatura baixa o modelo chegou a emendar 41 s de
            // silêncio cobrado depois de 3,5 s de fala.
            maxOutputTokens: 150 + texto.length * 6,
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ_TTS } } },
          },
        }),
      },
    )
    if (!r.ok) throw new Error(`TTS respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const j = await r.json()
    const dados = j.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData)?.inlineData
    if (!dados?.data) throw new Error('O TTS não devolveu áudio.')
    const wav = semSilencioNoFim(paraWavLimpo(base64ParaBytes(dados.data), dados.mimeType))
    const m = j.usageMetadata ?? {}
    return respostaJson({
      audio: { base64: bytesParaBase64(wav), mimeType: 'audio/wav' },
      custos: [{ servico: MODELO_TTS, entrada: m.promptTokenCount ?? 0, saida: m.candidatesTokenCount ?? 0 }],
      tempos: { ttsMs: Date.now() - inicio },
      formatoOriginal: dados.mimeType,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * A fala em pedaços: o Gemini manda o áudio por SSE e cada pedaço sai na hora,
 * como uma linha NDJSON `{"pcm": base64}` (PCM 16-bit mono, taxa na primeira
 * linha). A última linha traz custos e tempos. O aluno começa a ouvir no
 * primeiro pedaço, não quando a fala inteira ficou pronta.
 *
 * As duas limpezas do WAV inteiro valem aqui também, pedaço a pedaço: o bloco
 * de metadados (C2PA/SynthID) é cortado onde aparece, e pedaços só de silêncio
 * ficam retidos — só saem se vier som depois. No fim, sobra no máximo 300 ms.
 */
async function falarEmStream(chave: string, pedido: Pedido): Promise<Response> {
  const texto = (pedido.fala ?? []).map((p) => p.texto).join(' ').trim()
  if (!texto) return respostaErro('Fala vazia.')
  if (texto.length > 1500) return respostaErro('Fala longa demais.', 413)

  const inicio = Date.now()
  const controlador = new AbortController()
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_TTS}:streamGenerateContent?alt=sse&key=${chave}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controlador.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: texto }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          seed: 7,
          maxOutputTokens: 150 + texto.length * 6,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ_TTS } } },
        },
      }),
    },
  )
  if (!r.ok || !r.body) {
    clearTimeout(timeoutId)
    throw new Error(`TTS respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`)
  }

  const codificador = new TextEncoder()
  const corpo = new ReadableStream<Uint8Array>({
    async start(saida) {
      const linha = (o: unknown) => saida.enqueue(codificador.encode(JSON.stringify(o) + '\n'))
      let taxa = 0
      let primeiroMs: number | null = null
      let uso: { promptTokenCount?: number; candidatesTokenCount?: number } = {}
      let silencioRetido: Uint8Array[] = []
      let sobra: Uint8Array | null = null
      let acabou = false
      let pedacos = 0

      const emitir = (pcm: Uint8Array) => {
        if (!pcm.length) return
        if (primeiroMs === null) primeiroMs = Date.now() - inicio
        pedacos++
        linha({ pcm: bytesParaBase64(pcm) })
      }
      const receberPcm = (bruto: Uint8Array) => {
        let pcm = bruto
        if (sobra) {
          const junto = new Uint8Array(sobra.length + pcm.length)
          junto.set(sobra)
          junto.set(pcm, sobra.length)
          pcm = junto
          sobra = null
        }
        let corte = pcm.length
        for (const marca of ['jumb', 'c2pa', 'SynthID']) {
          const i = indiceDe(pcm, marca)
          if (i !== -1) corte = Math.min(corte, i)
        }
        if (corte < pcm.length) {
          acabou = true
          corte = Math.max(0, corte - 64)
          while (corte > 2 && pcm[corte - 1] !== 0 && pcm[corte - 2] !== 0) corte -= 2
        }
        if (corte % 2) {
          if (!acabou) sobra = pcm.slice(corte - 1, corte)
          corte -= 1
        }
        pcm = pcm.subarray(0, corte)
        if (soSilencio(pcm, taxa || 24_000)) {
          silencioRetido.push(pcm.slice())
          return
        }
        for (const s of silencioRetido) emitir(s)
        silencioRetido = []
        emitir(pcm)
      }

      try {
        const leitor = r.body!.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        while (true) {
          const { value, done } = await leitor.read()
          if (done) break
          buffer += value
          let fimEvento
          while ((fimEvento = buffer.indexOf('\n\n')) !== -1 || (fimEvento = buffer.indexOf('\r\n\r\n')) !== -1) {
            const evento = buffer.slice(0, fimEvento)
            buffer = buffer.slice(fimEvento + (buffer.startsWith('\r\n\r\n', fimEvento) ? 4 : 2))
            const dados = evento.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
            if (!dados) continue
            const j = JSON.parse(dados)
            if (j.usageMetadata) uso = j.usageMetadata
            if (acabou) continue
            for (const parte of j.candidates?.[0]?.content?.parts ?? []) {
              if (!parte.inlineData?.data) continue
              if (!taxa) {
                taxa = taxaDeAmostragem(parte.inlineData.mimeType)
                linha({ taxa, formatoOriginal: parte.inlineData.mimeType })
              }
              receberPcm(base64ParaBytes(parte.inlineData.data))
            }
          }
        }
        // Silêncio do fim: no máximo 300 ms.
        let resta = Math.round((taxa || 24_000) * 0.3) * 2
        for (const s of silencioRetido) {
          if (resta <= 0) break
          emitir(s.subarray(0, Math.min(s.length, resta - (resta % 2))))
          resta -= s.length
        }
        linha({
          fim: true,
          custos: [{ servico: MODELO_TTS, entrada: uso.promptTokenCount ?? 0, saida: uso.candidatesTokenCount ?? 0 }],
          tempos: { primeiroPedacoMs: primeiroMs, ttsMs: Date.now() - inicio, pedacos },
        })
      } catch (e) {
        console.error('poc-tutor falar_stream:', e)
        linha({ erro: e instanceof Error ? e.message : 'Falha no TTS.' })
      } finally {
        clearTimeout(timeoutId)
        saida.close()
      }
    },
  })
  return new Response(corpo, { headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}

/** Um pedaço de PCM sem nenhuma janela de 50 ms acima do limiar de som. */
function soSilencio(pcm: Uint8Array, taxa: number): boolean {
  const vista = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const amostras = Math.floor(pcm.length / 2)
  const janela = Math.max(1, Math.round(taxa / 20))
  for (let i = 0; i < amostras; i += janela) {
    let soma = 0
    const fim = Math.min(amostras, i + janela)
    for (let k = i; k < fim; k++) {
      const v = vista.getInt16(k * 2, true) / 32768
      soma += v * v
    }
    if (Math.sqrt(soma / (fim - i)) > 0.01) return false
  }
  return true
}

/**
 * Só o SOM, num WAV limpo.
 *
 * O TTS devolve PCM 16-bit mono, mas com um bloco de metadados no fim (a marca
 * d'água SynthID e o selo C2PA de "conteúdo gerado por IA"). Tocado como se
 * fosse áudio, esse bloco é o chiado de estática no fim de toda fala. Se vier
 * como WAV, fica só o chunk "data"; se vier PCM cru, corta no marcador do
 * manifesto C2PA ("jumb"/"c2pa"), que nunca é som.
 */
function paraWavLimpo(bytes: Uint8Array, mimeType: string | undefined): Uint8Array {
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n))
  if (bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') {
    const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let taxa = 24_000
    for (let o = 12; o + 8 <= bytes.length; ) {
      const id = ascii(o, 4)
      const tamanho = vista.getUint32(o + 4, true)
      if (id === 'fmt ') taxa = vista.getUint32(o + 12, true)
      if (id === 'data') return pcmParaWav(bytes.subarray(o + 8, Math.min(bytes.length, o + 8 + tamanho)), taxa)
      o += 8 + tamanho + (tamanho % 2)
    }
  }
  let fim = bytes.length
  for (const marca of ['jumb', 'c2pa', 'SynthID']) {
    const i = indiceDe(bytes, marca)
    if (i !== -1) fim = Math.min(fim, i)
  }
  // O manifesto começa um pouco antes do marcador (cabeçalho da caixa JUMBF):
  // recua até o início do "silêncio" que o precede e alinha em 2 bytes.
  if (fim < bytes.length) {
    fim = Math.max(0, fim - 64)
    while (fim > 2 && bytes[fim - 1] !== 0 && bytes[fim - 2] !== 0) fim -= 2
  }
  fim -= fim % 2
  return pcmParaWav(bytes.subarray(0, fim), taxaDeAmostragem(mimeType))
}

/**
 * Corta o silêncio do fim, deixando 300 ms. A página abre o microfone quando o
 * áudio TERMINA: silêncio sobrando no arquivo é o aluno esperando à toa.
 */
function semSilencioNoFim(wav: Uint8Array): Uint8Array {
  const vista = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const taxa = vista.getUint32(24, true)
  const amostras = (wav.length - 44) / 2
  const janela = Math.round(taxa / 20) // 50 ms
  let ultimaComSom = 0
  for (let i = 0; i + janela <= amostras; i += janela) {
    let soma = 0
    for (let k = i; k < i + janela; k++) {
      const v = vista.getInt16(44 + k * 2, true) / 32768
      soma += v * v
    }
    if (Math.sqrt(soma / janela) > 0.01) ultimaComSom = i + janela
  }
  const fim = Math.min(amostras, ultimaComSom + Math.round(taxa * 0.3))
  if (fim >= amostras - janela) return wav
  return pcmParaWav(wav.subarray(44, 44 + fim * 2), taxa)
}

function indiceDe(bytes: Uint8Array, texto: string): number {
  const alvo = [...texto].map((c) => c.charCodeAt(0))
  for (let i = 0; i + alvo.length <= bytes.length; i++) {
    let ok = true
    for (let k = 0; k < alvo.length; k++) if (bytes[i + k] !== alvo[k]) { ok = false; break }
    if (ok) return i
  }
  return -1
}

/** PCM cru 16-bit mono → WAV; sem cabeçalho nenhum player toca. */
function pcmParaWav(pcm: Uint8Array, taxa: number): Uint8Array {
  const cabecalho = new DataView(new ArrayBuffer(44))
  const ascii = (o: number, t: string) => [...t].forEach((c, i) => cabecalho.setUint8(o + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  cabecalho.setUint32(4, 36 + pcm.length, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  cabecalho.setUint32(16, 16, true)
  cabecalho.setUint16(20, 1, true)
  cabecalho.setUint16(22, 1, true)
  cabecalho.setUint32(24, taxa, true)
  cabecalho.setUint32(28, taxa * 2, true)
  cabecalho.setUint16(32, 2, true)
  cabecalho.setUint16(34, 16, true)
  ascii(36, 'data')
  cabecalho.setUint32(40, pcm.length, true)
  const wav = new Uint8Array(44 + pcm.length)
  wav.set(new Uint8Array(cabecalho.buffer), 0)
  wav.set(pcm, 44)
  return wav
}

function taxaDeAmostragem(mimeType: string | undefined): number {
  const m = /rate=(\d+)/.exec(mimeType ?? '')
  return m ? Number(m[1]) : 24_000
}

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesParaBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// ── Gemini (texto) ───────────────────────────────────────────────────────────

type Uso = { entrada: number; saida: number }

async function chamarGemini<T>(
  chave: string,
  modelo: string,
  { sistema, parts, schema, temperatura }: { sistema: string; parts: unknown[]; schema: unknown; temperatura: number },
): Promise<{ dados: T; uso: Uso }> {
  const controlador = new AbortController()
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controlador.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sistema }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: temperatura,
            responseMimeType: 'application/json',
            responseSchema: schema,
            // Transcrever e classificar não pedem raciocínio longo: o
            // "pensamento" era mais da metade do custo e parte da demora.
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      },
    )
    if (!resposta.ok) throw new Error(`Gemini respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`)
    const json = await resposta.json()
    const texto = json.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => typeof p.text === 'string')?.text
    if (typeof texto !== 'string') throw new Error('Gemini não devolveu conteúdo.')
    // `thoughtsTokenCount` é cobrado como saída nos modelos que "pensam".
    const m = json.usageMetadata ?? {}
    const uso = { entrada: m.promptTokenCount ?? 0, saida: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0) }
    return { dados: JSON.parse(texto) as T, uso }
  } catch (e) {
    if (controlador.signal.aborted) throw new Error(`Gemini não respondeu em ${TIMEOUT_MS / 1000}s.`)
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const INSTRUCAO_TRANSCRICAO = `Transcreva literalmente o que a pessoa disse no áudio.

Ela é brasileira e está numa aula de inglês: pode falar em inglês, em português, ou misturar os dois (por exemplo, para fazer uma pergunta ao professor).

Regras:
- Transcreva o que foi DITO, nunca o que "deveria" ter sido dito. Erros de gramática ficam como saíram: "They was at home" continua "They was at home".
- Se a pessoa se corrigiu no meio, transcreva tudo, inclusive a correção ("It is... it was sunny").
- Sem tradução, sem comentário, sem aspas.
- "confianca": "alta" se você ouviu as palavras com clareza; "baixa" se houve ruído, corte, ou palavras que você não conseguiu distinguir com segurança.
- Se não houver fala audível, "texto" vazio.`

const SCHEMA_TRANSCRICAO = {
  type: 'OBJECT',
  properties: {
    texto: { type: 'STRING' },
    confianca: { type: 'STRING', enum: ['alta', 'baixa'] },
  },
  required: ['texto', 'confianca'],
}

const INSTRUCAO_AVALIACAO = `Você avalia UMA resposta de um aluno brasileiro numa aula oral de inglês.

Você NÃO conduz a aula. Um controlador decide o próximo passo a partir da sua classificação. Não invente a próxima pergunta, não decida se avança: só classifique.

O contexto traz: o modo ("treino_controlado" ou "conversa"), o tipo de pedido (repeticao, construcao, substituicao, conversa), o que foi pedido, a resposta de referência (alvo), variantes aceitas, a última frase aceita da cadeia e as habilidades em jogo.

TIPOS

"adequada"
- Treino controlado: a resposta realiza a transformação pedida e preserva o resto da última frase aceita. Na substituição, a pista transforma a ÚLTIMA FRASE ACEITA: se a última era "It was rainy this morning" e a pista é "Yesterday", "It was sunny yesterday" NÃO é adequada (perdeu rainy).
- Aceite contrações e formas cheias (weren't / were not), variantes naturais equivalentes (listadas ou não), diferenças de maiúscula e pontuação, hesitações ("uh", "hmm"). Se o aluno se autocorrigiu, avalie a última versão completa.
- Mudança de sujeito exige a concordância junto (he was → they were).
- Repetição: adequada se repetiu o modelo de forma compreensível.
- Conversa: qualquer resposta pertinente e plausível à pergunta, mesmo diferente dos exemplos (se o exemplo diz sunny e o aluno diz rainy, vale). Exija só a estrutura-alvo compreensível; erros secundários não impedem.
- Na conversa, preencha "reacao": uma frase curta e natural, EM INGLÊS, reagindo ao conteúdo ("Rainy and cold! I hope you stayed warm."). Sem fazer nova pergunta.

"erro"
- A resposta não realiza o pedido, ou tem erro na estrutura-alvo.
- "habilidade": de preferência uma das habilidades do contexto; se o erro previsto do contexto bate, use a habilidade dele.
- "problema": em português, curto, UM só — o mais importante para o objetivo do exercício.
- "pista": a pergunta que o tutor vai fazer, como o professor faz: em PORTUGUÊS, pedindo ao aluno que produza ele mesmo o pedaço que falta. O jeito preferido é perguntar como se diz o trecho em português: "Como se pergunta 'vocês estavam' em inglês?", "Como se diz 'eu estava dormindo'?". Também vale apontar o trecho errado com leveza: "Tem um errinho no aren't. Como fica 'eles não estavam'?".
  PROIBIDO na pista: qualquer palavra em inglês da RESPOSTA certa (nada de "dizemos 'I was sleeping'", nada de "Were you…", nada de "use were"). Só pode aparecer em inglês a palavra ERRADA que o próprio aluno disse, para apontá-la. Uma pergunta só, curta, terminando em "?". Nunca um diagnóstico ("Uso do presente em vez do passado").
  Se "nivel_ajuda" já é maior que 0, o aluno já recebeu uma pista: faça uma pergunta mais específica, sobre o pedaço exato que ainda está errado, ainda em português.
- "acerto_parcial": se uma parte relevante estava certa, SÓ o trecho em inglês que acertou, de 1 a 3 palavras, sem frase nem explicação ("having", "They", "at home"). O tutor vai dizer "Você acertou <isto>." Na dúvida, deixe vazio.

"falta_prerequisito"
- SÓ quando "apoio_disponivel" for true E o erro mostra que falta a base para montar a frase (ex.: não sabe que jantar é "have dinner": omite o verbo, diz "dinnering"). Erro pontual corrigível com uma pista é "erro", não isto.

"duvida"
- O aluno perguntou ou comentou algo sobre a aula em vez de tentar responder (geralmente em português: "por que é were?", "o que é windy?").
- Preencha "resposta_duvida": explicação curta (1 a 3 frases) em português, com um contraste de exemplo se ajudar. NÃO dê a resposta do item pendente.

"parte_certa"
- O contexto traz "ultima_ajuda": a pergunta que o tutor acabou de fazer. Se o aluno respondeu SÓ a ela (uma palavra ou pedaço, como "weren't" ou "they were") e a resposta está CERTA, é "parte_certa". Se respondeu só o pedaço e está errado, é "erro" (com nova "pista").

"pedido_ajuda"
- Disse que não sabe, pediu ajuda ou para repetir, ou ficou só em hesitação sem tentar a frase.
- Inclui a tentativa interrompida por um pedido ("She was... não lembro como é educada").
- Se pediu algo ESPECÍFICO (uma palavra, um pedaço), preencha "ajuda" em português com SÓ esse pedaço ("Educada é polite."). Nunca a frase inteira: o aluno ainda precisa montá-la. Pedido genérico ("não sei"): deixe vazio.

REGRAS
- Você só tem o TEXTO transcrito: não comente pronúncia.
- Corrija um problema por vez.
- Material: "I weren't" é errado (use "I wasn't"); "you weren't" é correto. Frases sobre o clima precisam do sujeito "it". "How was the weather…?" é variante válida de "What was the weather like…?". "Have dinner" é verbo + substantivo; o progressivo é "having dinner".`

const SCHEMA_AVALIACAO = {
  type: 'OBJECT',
  properties: {
    tipo: { type: 'STRING', enum: ['adequada', 'erro', 'falta_prerequisito', 'duvida', 'pedido_ajuda', 'parte_certa'] },
    pista: { type: 'STRING' },
    habilidade: { type: 'STRING' },
    problema: { type: 'STRING' },
    acerto_parcial: { type: 'STRING' },
    resposta_duvida: { type: 'STRING' },
    reacao: { type: 'STRING' },
    ajuda: { type: 'STRING' },
  },
  required: ['tipo'],
  // Ordem explícita: sem ela o modelo chegou a escrever a pista DENTRO de
  // resposta_duvida, com o JSON quebrado. A pista vem logo depois do problema.
  propertyOrdering: ['tipo', 'habilidade', 'problema', 'pista', 'acerto_parcial', 'ajuda', 'resposta_duvida', 'reacao'],
}
