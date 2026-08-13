import type { MaterialGeracao, ParametrosGeracao, UsoIA } from './tipos.ts'
import { ErroIA, MENSAGEM_ERRO_GENERICA } from './tipos.ts'
import { GeminiProvider } from './gemini.ts'
import { GrokProvider } from './grok.ts'

type Entrada = {
  material: MaterialGeracao
  parametros: ParametrosGeracao
  questoesJaAceitas?: string[]
}

/**
 * Vale pedir ao navegador que rasterize o PDF e chame de novo? Só quando há
 * um fallback configurado e o material é justamente o formato que ele não lê.
 */
export function fallbackPrecisaDePaginas(material: MaterialGeracao): boolean {
  return material.tipo === 'pdf' && Boolean(Deno.env.get('XAI_API_KEY'))
}

/**
 * Gemini é o primário (4 tentativas com backoff, ver gemini.ts). Se ele
 * esgotar as tentativas — tipicamente 503 de sobrecarga —, cai para o Grok.
 *
 * O fallback só vale para texto, foto e páginas rasterizadas: o xAI não lê
 * PDF (grok.ts). Com PDF cru, quem converte é o front — ver
 * `fallbackPrecisaDePaginas` e o reenvio em app/src/features/atividades/api-ia.ts.
 */
export async function gerarAtividadeComFallback(input: Entrada): Promise<{ dados: unknown; uso: UsoIA }> {
  let erroPrimario: unknown

  try {
    return await new GeminiProvider().gerarAtividade(input)
  } catch (e) {
    erroPrimario = e
    console.error('[ia] gemini falhou:', e instanceof Error ? e.message : e)
  }

  if (!Deno.env.get('XAI_API_KEY')) {
    console.warn('[ia] sem XAI_API_KEY — fallback desativado')
    throw erroPrimario
  }

  if (!GrokProvider.suporta(input.material)) {
    console.warn(`[ia] fallback indisponível para material do tipo ${input.material.tipo}`)
    throw erroPrimario
  }

  try {
    const resultado = await new GrokProvider().gerarAtividade(input)
    console.info('[ia] fallback para grok deu certo')
    return resultado
  } catch (e) {
    console.error('[ia] grok também falhou:', e instanceof Error ? e.message : e)
    // O professor não precisa saber que houve dois provedores — a mensagem do
    // primário já descreve o que aconteceu ("a IA está sobrecarregada").
    throw erroPrimario instanceof ErroIA
      ? erroPrimario
      : new ErroIA({
          provedor: 'gemini',
          mensagem: String(erroPrimario),
          mensagemUsuario: MENSAGEM_ERRO_GENERICA,
          retentavel: true,
        })
  }
}
