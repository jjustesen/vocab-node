/**
 * Text-to-speech via Gemini. MESMO endpoint de gemini.ts
 * (`v1beta/models/{model}:generateContent`) — a API de fala não é um serviço à
 * parte, é o mesmo `generateContent` com `responseModalities: ["AUDIO"]` e
 * `speechConfig`. A doc oficial tem também uma "Interactions API" mais nova
 * (`v1beta/interactions`), mas o Google mantém `generateContent` totalmente
 * suportado — ficamos nele por ser o caminho já provado em produção neste
 * projeto, e porque a Interactions API ainda não tem schema de resposta REST
 * documentado com clareza suficiente para confiar sem poder testar antes do
 * deploy. https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
 */

const TIMEOUT_MS = 30_000

/** Preferida sobre gemini-3.1-flash-tts-preview (mais nova, mas sujeita a rotação de nome de preview). */
const MODELO_PADRAO = 'gemini-2.5-flash-preview-tts'
const VOZ_PADRAO = 'Kore'

/**
 * O retorno de generateContent com AUDIO é PCM cru em `inlineData.data`, não
 * um arquivo tocável — sem cabeçalho, nenhum player abre. `mimeType` costuma
 * vir como "audio/L16;codec=pcm;rate=24000"; se faltar, os 24kHz/16-bit/mono
 * documentados como padrão do modelo cobrem o caso.
 */
function taxaDeAmostragem(mimeType: string | undefined): number {
  const m = /rate=(\d+)/.exec(mimeType ?? '')
  return m ? Number(m[1]) : 24_000
}

/** Cabeçalho WAV de 44 bytes para PCM 16-bit mono — sem isso nenhum <audio> toca o retorno do Gemini. */
function pcmParaWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const bitsPerSample = 16
  const numChannels = 1
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)

  const cabecalho = new ArrayBuffer(44)
  const vista = new DataView(cabecalho)
  const escreverAscii = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) vista.setUint8(offset + i, texto.charCodeAt(i))
  }

  escreverAscii(0, 'RIFF')
  vista.setUint32(4, 36 + pcm.length, true)
  escreverAscii(8, 'WAVE')
  escreverAscii(12, 'fmt ')
  vista.setUint32(16, 16, true) // tamanho do subchunk fmt
  vista.setUint16(20, 1, true) // PCM linear
  vista.setUint16(22, numChannels, true)
  vista.setUint32(24, sampleRate, true)
  vista.setUint32(28, byteRate, true)
  vista.setUint16(32, blockAlign, true)
  vista.setUint16(34, bitsPerSample, true)
  escreverAscii(36, 'data')
  vista.setUint32(40, pcm.length, true)

  const wav = new Uint8Array(44 + pcm.length)
  wav.set(new Uint8Array(cabecalho), 0)
  wav.set(pcm, 44)
  return wav
}

function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

/** Gera a fala de uma frase e devolve um WAV pronto para tocar em `<audio>`. */
export async function gerarAudioTTS(frase: string): Promise<Uint8Array> {
  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) throw new Error('GEMINI_API_KEY não configurada nas secrets da função.')
  const modelo = Deno.env.get('GEMINI_TTS_MODEL') ?? MODELO_PADRAO
  const voz = Deno.env.get('GEMINI_TTS_VOICE') ?? VOZ_PADRAO

  const controlador = new AbortController()
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  try {
    const resposta = await fetch(
      // Chave na query string, não no header `x-goog-api-key` que a doc de TTS
      // mostra — mantém o padrão de gemini.ts, já provado em produção.
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controlador.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: frase }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
          },
        }),
      },
    )

    if (!resposta.ok) {
      const corpo = await resposta.text()
      throw new Error(`Gemini TTS respondeu ${resposta.status}: ${corpo.slice(0, 300)}`)
    }

    const json = await resposta.json()
    const parte = json.candidates?.[0]?.content?.parts?.[0]
    const dadosBase64 = parte?.inlineData?.data
    if (typeof dadosBase64 !== 'string' || !dadosBase64) {
      throw new Error('Gemini não devolveu áudio.')
    }

    const pcm = base64ParaBytes(dadosBase64)
    return pcmParaWav(pcm, taxaDeAmostragem(parte.inlineData.mimeType))
  } finally {
    clearTimeout(timeoutId)
  }
}
