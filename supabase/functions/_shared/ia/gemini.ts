import type { MaterialGeracao, ParametrosGeracao, ProvedorIA, UsoIA } from './tipos.ts'
import { INSTRUCAO_SISTEMA, montarBlocoParametros } from './prompt.ts'
import { ATIVIDADE_GERADA_SCHEMA } from './schema.ts'

const TIMEOUT_MS = 90_000 // RF-65
const TENTATIVAS = 2 // RF-73 — falha não consome cota (ver gerar-atividade/index.ts)

/**
 * Preços por 1M tokens em USD — gemini-3.6-flash, tabela pública de
 * lançamento (jul/2026). ESTIMATIVA: confirme na página oficial de preços do
 * Google antes de fechar o preço do plano (docs/PROMPT-GERACAO.md §7) — meça
 * o custo real em `geracoes_ia` e ajuste estes números (ou o env GEMINI_PRECO_*).
 */
const PRECO_ENTRADA_POR_MILHAO = Number(Deno.env.get('GEMINI_PRECO_ENTRADA_POR_MILHAO') ?? '1.50')
const PRECO_SAIDA_POR_MILHAO = Number(Deno.env.get('GEMINI_PRECO_SAIDA_POR_MILHAO') ?? '7.50')

export class GeminiProvider implements ProvedorIA {
  private apiKey: string
  private modelo: string

  constructor() {
    const chave = Deno.env.get('GEMINI_API_KEY')
    if (!chave) throw new Error('GEMINI_API_KEY não configurada nas secrets da função.')
    this.apiKey = chave
    this.modelo = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
  }

  async gerarAtividade(input: {
    material: MaterialGeracao
    parametros: ParametrosGeracao
    questoesJaAceitas?: string[]
  }): Promise<{ dados: unknown; uso: UsoIA }> {
    const parts = montarParts(input.material, input.parametros, input.questoesJaAceitas)

    let ultimoErro: unknown
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        return await this.chamar(parts)
      } catch (e) {
        ultimoErro = e
        if (tentativa < TENTATIVAS) await new Promise((r) => setTimeout(r, 1000 * tentativa))
      }
    }
    throw ultimoErro instanceof Error ? ultimoErro : new Error('Falha ao gerar atividade.')
  }

  private async chamar(parts: unknown[]): Promise<{ dados: unknown; uso: UsoIA }> {
    const controlador = new AbortController()
    const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS)

    try {
      const resposta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelo}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controlador.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: INSTRUCAO_SISTEMA }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: ATIVIDADE_GERADA_SCHEMA,
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

      const tokensEntrada: number = json.usageMetadata?.promptTokenCount ?? 0
      const tokensSaida: number = json.usageMetadata?.candidatesTokenCount ?? 0
      const custoUsd =
        (tokensEntrada / 1_000_000) * PRECO_ENTRADA_POR_MILHAO +
        (tokensSaida / 1_000_000) * PRECO_SAIDA_POR_MILHAO

      let dados: unknown
      try {
        dados = JSON.parse(texto)
      } catch {
        throw new Error('Gemini devolveu um JSON inválido.')
      }

      return { dados, uso: { tokensEntrada, tokensSaida, custoUsd, modelo: this.modelo } }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Texto vai embutido no prompt (mais barato, sem parte extra). Imagem/PDF
 * não dá pra embutir como texto — vira uma parte `inline_data` separada na
 * mesma mensagem (etapa 3: RF-63).
 */
function montarParts(material: MaterialGeracao, parametros: ParametrosGeracao, questoesJaAceitas?: string[]): unknown[] {
  const bloco = montarBlocoParametros(parametros, questoesJaAceitas)

  if (material.tipo === 'texto') {
    return [{ text: `${bloco}\n\n## Material da aula\n${material.conteudo}` }]
  }

  return [
    { text: `${bloco}\n\n## Material da aula\nAnexado a seguir (${material.tipo === 'pdf' ? 'PDF' : 'foto'}).` },
    { inline_data: { mime_type: material.mimeType, data: material.conteudo } },
  ]
}
