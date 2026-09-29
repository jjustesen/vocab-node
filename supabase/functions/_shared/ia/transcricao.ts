/**
 * Transcrição de fala pelo Gemini — a rede de segurança do `SpeechRecognition`
 * do navegador (13/08/2026).
 *
 * Por que existe: o caminho grátis (reconhecedor do navegador) falha às vezes
 * — em parte dos celulares o microfone é exclusivo e a gravação e o
 * reconhecedor o disputam; e o motor do Chrome depende de mandar áudio para
 * servidores do Google, o que 4G instável derruba. Gravar é confiável em
 * qualquer aparelho, então quando o navegador não entende, transcrevemos aqui
 * o áudio que já foi gravado.
 *
 * REGRA QUE NÃO PODE SER QUEBRADA: a frase-alvo NUNCA entra neste prompt.
 * Sabendo o que o aluno deveria ter lido, o modelo devolve exatamente isso, e
 * toda leitura viraria 100/100 — a avaliação deixaria de medir qualquer coisa.
 * A transcrição é cega de propósito; quem compara com a frase é
 * `pontuarPronuncia`, depois, em _shared/correcao.ts.
 */

/**
 * 20s e não 30: o aluno está parado olhando "Conferindo o que você falou...".
 * Uma frase curta transcreve em poucos segundos; passar disso é o Gemini
 * sobrecarregado, e aí "não te ouvi, tente de novo" é melhor que esperar.
 */
const TIMEOUT_MS = 20_000

/**
 * Raciocínio no mínimo: transcrever literalmente não se beneficia de o modelo
 * "pensar", e o raciocínio padrão dos modelos Flash é o que mais pesa na
 * latência. Se o modelo configurado não aceitar o parâmetro (400), repetimos
 * sem ele — trocar de modelo pela env não pode quebrar a pronúncia.
 */
const SEM_RACIOCINIO = { thinkingConfig: { thinkingLevel: 'minimal' } }


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
  const inicio = Date.now()
  const controlador = new AbortController()
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  const chamar = (extra: object) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`, {
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
        generationConfig: { temperature: 0, ...extra },
      }),
    })

  try {
    let resposta = await chamar(SEM_RACIOCINIO)
    if (resposta.status === 400) resposta = await chamar({})

    if (!resposta.ok) {
      console.warn(`[transcricao] ${modelo} respondeu ${resposta.status} em ${Date.now() - inicio}ms`)
      return ''
    }

    const json = await resposta.json()
    const texto = json.candidates?.[0]?.content?.parts?.[0]?.text
    // O tempo vai para o log da função: é como se confere, com número, se a
    // demora do aluno está aqui ou antes (gravação, upload).
    console.info(`[transcricao] ${modelo} em ${Date.now() - inicio}ms, ${audioBase64.length} chars de base64`)
    return typeof texto === 'string' ? texto.trim() : ''
  } catch {
    console.warn(`[transcricao] falhou ou estourou ${TIMEOUT_MS}ms (${Date.now() - inicio}ms)`)
    return ''
  } finally {
    clearTimeout(timeoutId)
  }
}
