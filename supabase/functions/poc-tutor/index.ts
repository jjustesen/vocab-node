// Deno Edge Function — a POC do tutor oral (poc-tutor/ na raiz do repositório),
// a porta do LABORATÓRIO. O aluno logado entra por `tutor-aluno`; ouvir,
// avaliar e falar são os mesmos nas duas (_shared/tutor/).
//
// Chamada pela página da POC SEM LOGIN: publique com --no-verify-jwt. Não toca
// no banco. Ações:
//
//   avaliar → ouve o turno do aluno e CLASSIFICA a resposta (_shared/tutor/avaliar.ts).
//   falar   → a voz do tutor, gerada na hora pelo Gemini TTS (WAV inteiro).
//   falar_stream → a mesma voz em pedaços (NDJSON), tocada enquanto chega.
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
import { avaliarTurno } from '../_shared/tutor/avaliar.ts'
import { ErroDePedido } from '../_shared/tutor/comum.ts'
import { falarEmStream, falarInteiro, type Parte, textoDaFala } from '../_shared/tutor/falar.ts'

/**
 * A lição do laboratório é sempre a do clima (poc-tutor/roteiro/licao-clima.json),
 * que traz estas mesmas notas em `notasParaAvaliador`. Ficam aqui porque o
 * navegador do laboratório não é fonte de verdade para o prompt.
 */
const NOTAS_DO_CLIMA =
  '"I weren\'t" é errado (use "I wasn\'t"); "you weren\'t" é correto. Frases sobre o clima precisam do sujeito "it". "How was the weather…?" é variante válida de "What was the weather like…?". "Have dinner" é verbo + substantivo; o progressivo é "having dinner".'

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
    if (pedido.acao === 'falar') return respostaJson(await falarInteiro(chave, textoDaFala(pedido.fala)))
    if (pedido.acao === 'falar_stream') return await falarEmStream(chave, textoDaFala(pedido.fala))
    return respostaJson(await avaliarTurno(chave, { ...pedido, notasDoMaterial: NOTAS_DO_CLIMA }))
  } catch (e) {
    if (e instanceof ErroDePedido) return respostaErro(e.message, e.status)
    console.error('poc-tutor:', e)
    return respostaErro(e instanceof Error ? e.message : 'Falha ao falar com a IA.', 502)
  }
})
