/**
 * Avaliação de leitura em voz alta.
 *
 * Mesma chamada `generateContent` da geração de atividade, com o áudio indo
 * como `inline_data` — exatamente o caminho já usado para PDF e foto em
 * gemini.ts (`montarParts`). O que muda é o schema de saída e a instrução.
 *
 * Não é análise fonética: é um modelo ouvindo e julgando. Serve para lição de
 * casa, onde a pergunta é "dá para entender?"; não serve como nota de prova.
 */

const TIMEOUT_MS = 60_000

/** Saída estruturada em strings — o mesmo subconjunto conservador de schema.ts. */
const AVALIACAO_SCHEMA = {
  type: 'object',
  required: ['pontuacao', 'transcricao', 'comentario'],
  properties: {
    pontuacao: { type: 'string' },
    transcricao: { type: 'string' },
    comentario: { type: 'string' },
  },
}

const INSTRUCAO = `Você avalia a pronúncia de estudantes BRASILEIROS de inglês, para lição de casa.

Você recebe a frase-alvo e um áudio do aluno lendo essa frase em voz alta.

Devolva:
- "transcricao": o que você REALMENTE ouviu, em inglês. Não corrija para a
  frase-alvo — se o aluno disse outra coisa, transcreva o que ele disse.
- "pontuacao": um número inteiro de 0 a 100, como texto.
- "comentario": uma ou duas frases EM PORTUGUÊS, dirigidas ao aluno.

Régua da pontuação — o critério é INTELIGIBILIDADE, não sotaque nativo:
- 90-100: um falante nativo entenderia sem esforço.
- 70-89: entendível, com um ou dois sons trocados.
- 40-69: dá para reconhecer a frase, mas vários sons atrapalham.
- 1-39: difícil de reconhecer como a frase-alvo.
- 0: silêncio, ruído, ou o aluno leu outra frase.

Sotaque brasileiro NÃO é erro. Só penalize o que muda o significado ou trava o
entendimento: "th" virando "f"/"t", "-ed" final virando sílaba extra onde não
existe, "r" inicial virando "h", vogal longa/curta trocada em par mínimo.

O comentário nunca humilha. Aponte UM som para melhorar e diga como, em
linguagem simples: "Quase! No 'think', ponha a língua entre os dentes — saiu
mais como 'fink'." Se foi bem, elogie e siga: "Boa, saiu bem natural."`

export type AvaliacaoPronuncia = {
  pontuacao: number
  transcricao: string
  comentario: string
}

export async function avaliarPronuncia(input: {
  fraseAlvo: string
  audioBase64: string
  mimeType: string
}): Promise<AvaliacaoPronuncia> {
  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) throw new Error('GEMINI_API_KEY não configurada nas secrets da função.')
  const modelo = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'

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
          system_instruction: { parts: [{ text: INSTRUCAO }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: `Frase-alvo: "${input.fraseAlvo}"\n\nÁudio do aluno a seguir.` },
                { inline_data: { mime_type: input.mimeType, data: input.audioBase64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: AVALIACAO_SCHEMA,
          },
        }),
      },
    )

    if (!resposta.ok) {
      const corpo = await resposta.text()
      throw new Error(`Gemini respondeu ${resposta.status}: ${corpo.slice(0, 300)}`)
    }

    const json = await resposta.json()
    const texto = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof texto !== 'string') throw new Error('Gemini não devolveu conteúdo em texto.')

    let dados: { pontuacao?: unknown; transcricao?: unknown; comentario?: unknown }
    try {
      dados = JSON.parse(texto)
    } catch {
      throw new Error('Gemini devolveu um JSON inválido.')
    }

    // A nota chega como texto (o schema é de strings) e é entrada não confiável
    // como qualquer outra: corta em 0–100 e arredonda antes de virar smallint.
    const bruta = Number(String(dados.pontuacao ?? '').replace(/[^\d.-]/g, ''))
    const pontuacao = Number.isFinite(bruta) ? Math.min(100, Math.max(0, Math.round(bruta))) : 0

    return {
      pontuacao,
      transcricao: typeof dados.transcricao === 'string' ? dados.transcricao.slice(0, 500) : '',
      comentario:
        typeof dados.comentario === 'string' && dados.comentario.trim()
          ? dados.comentario.slice(0, 500)
          : 'Não foi possível avaliar esta gravação.',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
