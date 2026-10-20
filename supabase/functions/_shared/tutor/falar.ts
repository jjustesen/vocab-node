// A voz do tutor, gerada na hora pelo Gemini TTS: inteira (WAV) ou em pedaços
// (NDJSON), tocada enquanto chega. Só para falas que não existem pré-gravadas
// (pista do Gemini, o que o aluno disse): as fixas a página já tem em arquivo.

import { CORS_HEADERS } from '../cors.ts'
import { type Custo, ErroDePedido, TIMEOUT_MS } from './comum.ts'

// Flash-Lite: 1/3 mais barato que o Flash TTS e feito para baixa latência.
const MODELO_TTS = Deno.env.get('POC_TUTOR_MODELO_TTS') ?? 'gemini-3.8-flash-lite-tts'
const VOZ_TTS = Deno.env.get('POC_TUTOR_VOZ') ?? 'Kore'

/** Um trecho da fala: o navegador manda separado por idioma, o TTS lê junto. */
export type Parte = { idioma: 'pt' | 'en'; texto: string }

/** A fala inteira num texto só, já recusando vazia ou longa demais. */
export function textoDaFala(fala: Parte[] | undefined): string {
  const texto = (fala ?? []).map((p) => p.texto).join(' ').trim()
  if (!texto) throw new ErroDePedido('Fala vazia.')
  if (texto.length > 1500) throw new ErroDePedido('Fala longa demais.', 413)
  return texto
}

/**
 * A fala do tutor em áudio, gerada na hora. Uma chamada por fala inteira, com
 * português e inglês juntos: o modelo troca de idioma no meio da frase sem
 * trocar de voz — é o que a voz do navegador não consegue.
 */
export async function falarInteiro(chave: string, texto: string) {
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
    const custos: Custo[] = [{ servico: MODELO_TTS, entrada: m.promptTokenCount ?? 0, saida: m.candidatesTokenCount ?? 0 }]
    return {
      audio: { base64: bytesParaBase64(wav), mimeType: 'audio/wav' },
      custos,
      tempos: { ttsMs: Date.now() - inicio },
      formatoOriginal: dados.mimeType as string | undefined,
    }
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
 *
 * `aoTerminar` recebe o gasto quando o stream acaba — ou quebra no meio: o que
 * o Gemini já cobrou entra na conta igual.
 */
export async function falarEmStream(
  chave: string,
  texto: string,
  aoTerminar?: (custos: Custo[]) => Promise<unknown>,
): Promise<Response> {

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
      const custosDoUso = (): Custo[] => [
        { servico: MODELO_TTS, entrada: uso.promptTokenCount ?? 0, saida: uso.candidatesTokenCount ?? 0 },
      ]

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
          custos: custosDoUso(),
          tempos: { primeiroPedacoMs: primeiroMs, ttsMs: Date.now() - inicio, pedacos },
        })
      } catch (e) {
        console.error('tutor falar_stream:', e)
        linha({ erro: e instanceof Error ? e.message : 'Falha no TTS.' })
      } finally {
        clearTimeout(timeoutId)
        if (aoTerminar) await aoTerminar(custosDoUso()).catch((e) => console.error('tutor gasto do stream:', e))
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
