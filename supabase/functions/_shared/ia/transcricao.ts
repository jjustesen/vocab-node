/**
 * Transcrição de fala pelo Gemini — a rede de segurança do `SpeechRecognition`
 * do navegador (13/08/2026).
 *
 * Por que existe: no celular o caminho grátis é estruturalmente frágil. O
 * microfone costuma ser recurso exclusivo, então a gravação e o reconhecedor
 * disputam o mesmo aparelho; e o motor do Chrome ainda depende de mandar áudio
 * para servidores do Google, o que 4G instável derruba. Gravar, por outro
 * lado, é confiável em qualquer aparelho — então no celular gravamos e
 * transcrevemos aqui.
 *
 * REGRA QUE NÃO PODE SER QUEBRADA: a frase-alvo NUNCA entra neste prompt.
 * Sabendo o que o aluno deveria ter lido, o modelo devolve exatamente isso, e
 * toda leitura viraria 100/100 — a avaliação deixaria de medir qualquer coisa.
 * A transcrição é cega de propósito; quem compara com a frase é
 * `pontuarPronuncia`, depois, em _shared/correcao.ts.
 */

const TIMEOUT_MS = 30_000

const INSTRUCAO = `Transcreva literalmente o áudio, que é uma pessoa lendo uma frase curta em inglês em voz alta.

Regras:
- Devolva APENAS as palavras que você ouvir, em inglês.
- Transcreva o que foi DITO, não o que "deveria" ter sido dito: se a pessoa trocou, engoliu ou repetiu uma palavra, mantenha como saiu.
- Sem tradução, sem comentário, sem aspas, sem pontuação além do necessário.
- Se não houver fala audível, devolva texto vazio.`

/**
 * Devolve o que foi ouvido, ou string vazia quando não há fala audível — e
 * também quando a chamada falha. Falhar aqui não pode custar a resposta do
 * aluno: a tela trata vazio como "não te ouvi" e oferece tentar de novo.
 */
export async function transcreverFala(audioBase64: string, mimeType: string): Promise<string> {
  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) return ''

  const modelo = Deno.env.get('GEMINI_MODEL_TRANSCRICAO') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
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
          contents: [
            {
              role: 'user',
              parts: [{ text: INSTRUCAO }, { inline_data: { mime_type: mimeType, data: audioBase64 } }],
            },
          ],
          // Temperatura zero: transcrever não é tarefa criativa, e qualquer
          // "melhora" do modelo aqui vira nota que o aluno não mereceu.
          generationConfig: { temperature: 0 },
        }),
      },
    )

    if (!resposta.ok) return ''

    const json = await resposta.json()
    const texto = json.candidates?.[0]?.content?.parts?.[0]?.text
    return typeof texto === 'string' ? texto.trim() : ''
  } catch {
    return ''
  } finally {
    clearTimeout(timeoutId)
  }
}
