import type { MaterialGeracao, ParametrosGeracao, ProvedorIA, UsoIA } from './tipos.ts'
import { ErroIA } from './tipos.ts'
import { classificarHttp, ehRetentavel, esperarBackoff, mensagemPorStatus } from './retentativa.ts'
import { INSTRUCAO_SISTEMA, montarBlocoParametros } from './prompt.ts'
import { ATIVIDADE_GERADA_SCHEMA } from './schema.ts'

const TIMEOUT_MS = 90_000
const TENTATIVAS = 2 // é o plano B: se ele também estiver fora, insistir só atrasa o erro

/**
 * Preços por 1M tokens em USD — grok-4.6, faixa abaixo de 200k tokens
 * (https://docs.x.ai/docs/models, ago/2026). Acima de 200k o preço dobra, mas
 * o material de uma aula não chega perto disso.
 */
const PRECO_ENTRADA_POR_MILHAO = Number(Deno.env.get('XAI_PRECO_ENTRADA_POR_MILHAO') ?? '2.00')
const PRECO_SAIDA_POR_MILHAO = Number(Deno.env.get('XAI_PRECO_SAIDA_POR_MILHAO') ?? '6.00')

/** A API do xAI aceita imagem, mas só jpg/png — e não aceita PDF. */
const MIMES_SUPORTADOS = ['image/jpeg', 'image/jpg', 'image/png']

function mimeOk(mimeType: string): boolean {
  return MIMES_SUPORTADOS.includes(mimeType.toLowerCase())
}

/**
 * O modo `strict` do xAI (herdado do formato da OpenAI) exige
 * `additionalProperties: false` em todo objeto. O schema compartilhado não
 * traz isso porque o Gemini rejeita a chave — então a cópia estrita é
 * derivada aqui, e o contrato continua num arquivo só.
 */
function tornarEstrito(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(tornarEstrito)
  if (typeof no !== 'object' || no === null) return no

  const copia: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(no as Record<string, unknown>)) {
    copia[chave] = tornarEstrito(valor)
  }
  if (copia.type === 'object') copia.additionalProperties = false
  return copia
}

const SCHEMA_ESTRITO = tornarEstrito(ATIVIDADE_GERADA_SCHEMA)

/**
 * Plano B quando o Gemini está fora do ar (RF-73). API compatível com a da
 * OpenAI: POST /v1/chat/completions com `response_format: json_schema`.
 *
 * LIMITAÇÃO: o xAI não lê PDF. Material em PDF não tem fallback — ver
 * `provedor.ts`, que só chama o Grok quando o material é suportado.
 */
export class GrokProvider implements ProvedorIA {
  private apiKey: string
  private modelo: string

  constructor() {
    const chave = Deno.env.get('XAI_API_KEY')
    if (!chave) throw new Error('XAI_API_KEY não configurada nas secrets da função.')
    this.apiKey = chave
    this.modelo = Deno.env.get('XAI_MODEL') ?? 'grok-4.6'
  }

  static suporta(material: MaterialGeracao): boolean {
    if (material.tipo === 'texto') return true
    if (material.tipo === 'imagem') return mimeOk(material.mimeType)
    if (material.tipo === 'paginas') return material.paginas.length > 0 && material.paginas.every((p) => mimeOk(p.mimeType))
    return false // pdf — rasterizado pelo front antes de chegar aqui (tipo 'paginas')
  }

  async gerarAtividade(input: {
    material: MaterialGeracao
    parametros: ParametrosGeracao
    questoesJaAceitas?: string[]
  }): Promise<{ dados: unknown; uso: UsoIA }> {
    if (!GrokProvider.suporta(input.material)) {
      throw new ErroIA({
        provedor: 'grok',
        mensagem: `Grok não aceita material do tipo ${input.material.tipo}.`,
        mensagemUsuario: 'A IA está sobrecarregada no momento. Tente novamente em instantes.',
        retentavel: false,
      })
    }

    const conteudo = montarConteudo(input.material, input.parametros, input.questoesJaAceitas)

    let ultimoErro: unknown
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        return await this.chamar(conteudo)
      } catch (e) {
        ultimoErro = e
        if (!ehRetentavel(e)) break
        if (tentativa < TENTATIVAS) await esperarBackoff(tentativa)
      }
    }
    throw ultimoErro instanceof Error
      ? ultimoErro
      : new ErroIA({
          provedor: 'grok',
          mensagem: 'Falha ao gerar atividade.',
          mensagemUsuario: 'Não consegui gerar a atividade agora. Tente novamente em instantes.',
          retentavel: true,
        })
  }

  private async chamar(conteudo: unknown[]): Promise<{ dados: unknown; uso: UsoIA }> {
    const controlador = new AbortController()
    const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS)

    try {
      let resposta: Response
      try {
        resposta = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: controlador.signal,
          body: JSON.stringify({
            model: this.modelo,
            messages: [
              { role: 'system', content: INSTRUCAO_SISTEMA },
              { role: 'user', content: conteudo },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'atividade_gerada',
                schema: SCHEMA_ESTRITO,
                strict: true,
              },
            },
          }),
        })
      } catch (e) {
        const abortou = controlador.signal.aborted
        throw new ErroIA({
          provedor: 'grok',
          mensagem: abortou ? `Grok estourou o timeout de ${TIMEOUT_MS}ms.` : `Falha de rede ao chamar o Grok: ${e}`,
          mensagemUsuario: abortou
            ? 'A IA demorou demais para responder. Tente novamente — ou com um material menor.'
            : 'Não consegui falar com a IA agora. Tente novamente em instantes.',
          retentavel: true,
        })
      }

      if (!resposta.ok) {
        const corpo = await resposta.text()
        throw new ErroIA({
          provedor: 'grok',
          mensagem: `Grok respondeu ${resposta.status}: ${corpo.slice(0, 300)}`,
          mensagemUsuario: mensagemPorStatus(resposta.status),
          status: resposta.status,
          retentavel: classificarHttp(resposta.status),
        })
      }

      const json = await resposta.json()
      const texto = json.choices?.[0]?.message?.content
      if (typeof texto !== 'string') {
        throw new ErroIA({
          provedor: 'grok',
          mensagem: 'Grok não devolveu conteúdo em texto.',
          mensagemUsuario: 'A IA devolveu uma resposta vazia. Tente novamente.',
          retentavel: true,
        })
      }

      const tokensEntrada: number = json.usage?.prompt_tokens ?? 0
      const tokensSaida: number = json.usage?.completion_tokens ?? 0
      const custoUsd =
        (tokensEntrada / 1_000_000) * PRECO_ENTRADA_POR_MILHAO +
        (tokensSaida / 1_000_000) * PRECO_SAIDA_POR_MILHAO

      let dados: unknown
      try {
        dados = JSON.parse(texto)
      } catch {
        throw new ErroIA({
          provedor: 'grok',
          mensagem: 'Grok devolveu um JSON inválido.',
          mensagemUsuario: 'A IA devolveu um formato inesperado. Tente novamente.',
          retentavel: true,
        })
      }

      return {
        dados,
        uso: { tokensEntrada, tokensSaida, custoUsd, provedor: 'grok', modelo: this.modelo },
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Mesmo conteúdo do `montarParts` do Gemini, no formato de `content` da API
 * compatível com a OpenAI: lista de partes `text` / `image_url` (base64 vai
 * como data URL).
 */
function montarConteudo(
  material: MaterialGeracao,
  parametros: ParametrosGeracao,
  questoesJaAceitas?: string[],
): unknown[] {
  const bloco = montarBlocoParametros(parametros, questoesJaAceitas)

  if (material.tipo === 'texto') {
    return [{ type: 'text', text: `${bloco}\n\n## Material da aula\n${material.conteudo}` }]
  }

  if (material.tipo === 'paginas') {
    return [
      {
        type: 'text',
        text: `${bloco}\n\n## Material da aula\nAnexado a seguir (${material.paginas.length} página(s) de PDF, em ordem).`,
      },
      ...material.paginas.map((p) => ({
        type: 'image_url',
        image_url: { url: `data:${p.mimeType};base64,${p.conteudo}` },
      })),
    ]
  }

  return [
    { type: 'text', text: `${bloco}\n\n## Material da aula\nAnexado a seguir (foto).` },
    { type: 'image_url', image_url: { url: `data:${material.mimeType};base64,${material.conteudo}` } },
  ]
}
