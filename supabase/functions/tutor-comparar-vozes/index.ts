// Deno Edge Function — a tela "Comparar vozes" do tutor (professor logado,
// verify-jwt ligado).
//
// Gera UMA fala num serviço de voz (Gemini, ElevenLabs, xAI ou Deepgram) e
// devolve o áudio em base64, para o professor ouvir as mesmas falas lado a lado
// antes de trocar o TTS do tutor. Nada fica gravado: é só para escolher.
//
// As chaves ficam nos segredos do Supabase; sem a chave, o serviço aparece na
// tela com o aviso de qual segredo falta.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { falarInteiro } from '../_shared/tutor/falar.ts'
import { custoEmUsd } from '../_shared/tutor/precos.ts'

const LIMITE_TEXTO = 300
const TEMPO_MAXIMO_MS = 30_000

type Opcao = { id: string; nome: string }
type Audio = { base64: string; mimeType: string; custoUsd: number }

type Provedor = {
  nome: string
  segredo: string
  preco: string
  modelos: Opcao[]
  /** As vozes: fixas, ou buscadas na conta quando o serviço deixa. */
  vozes: (chave: string) => Promise<Opcao[]>
  falar: (chave: string, p: { modelo: string; voz: string; texto: string }) => Promise<Audio>
}

const PROVEDORES: Record<string, Provedor> = {
  gemini: {
    nome: 'Gemini (hoje)',
    segredo: 'GEMINI_API_KEY',
    preco: '~US$ 6–9 por 1 mi de tokens de áudio',
    modelos: [
      { id: 'gemini-3.8-flash-lite-tts', nome: 'Flash-Lite TTS (o de hoje)' },
      { id: 'gemini-3.8-flash-tts', nome: 'Flash TTS' },
    ],
    vozes: async () =>
      [
        ['Kore', 'a de hoje'],
        ['Achird', 'amigável'],
        ['Sulafat', 'calorosa'],
        ['Callirrhoe', 'tranquila'],
        ['Vindemiatrix', 'suave'],
        ['Puck', 'animada'],
        ['Charon', 'informativa'],
      ].map(([id, jeito]) => ({ id, nome: `${id} — ${jeito}` })),
    falar: async (chave, { modelo, voz, texto }) => {
      const r = await falarInteiro(chave, texto, { modelo, voz })
      return { base64: r.audio.base64, mimeType: r.audio.mimeType, custoUsd: custoEmUsd(r.custos) }
    },
  },

  elevenlabs: {
    nome: 'ElevenLabs',
    segredo: 'ELEVENLABS_API_KEY',
    preco: 'US$ 40–80 por 1 mi de caracteres',
    modelos: [
      { id: 'eleven_multilingual_v2', nome: 'Multilingual v2 (o mais estável)' },
      { id: 'eleven_v4', nome: 'v4' },
      { id: 'eleven_v4_turbo', nome: 'v4 Turbo (rápido)' },
      { id: 'eleven_flash_v2_5', nome: 'Flash v2.5 (mais barato)' },
    ],
    // As vozes da conta (as que você adicionou da biblioteca entram aqui).
    vozes: async (chave) => {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': chave } })
      if (!r.ok) throw new Error(`ElevenLabs respondeu ${r.status} ao listar vozes`)
      const j = await r.json()
      return (j.voices ?? []).map((v: { voice_id: string; name: string; labels?: Record<string, string> }) => ({
        id: v.voice_id,
        nome: [v.name, v.labels?.gender, v.labels?.accent].filter(Boolean).join(' · '),
      }))
    },
    falar: async (chave, { modelo, voz, texto }) => {
      const r = await comPrazo(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: texto,
          model_id: modelo,
          // Estabilidade um pouco acima do padrão (0,5): é o que se quer comparar.
          voice_settings: { stability: 0.65, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
          seed: 7,
        }),
      })
      const porMilhao = modelo === 'eleven_v4_turbo' || modelo === 'eleven_flash_v2_5' ? 40 : 80
      return { ...(await audioBruto(r, 'audio/mpeg')), custoUsd: (texto.length * porMilhao) / 1_000_000 }
    },
  },

  xai: {
    nome: 'Grok (xAI)',
    segredo: 'XAI_API_KEY',
    preco: 'US$ 15 por 1 mi de caracteres',
    // O xAI não tem modelo de voz para escolher; o que muda o resultado é o idioma declarado.
    modelos: [
      { id: 'pt-BR', nome: 'Idioma: português (pt-BR)' },
      { id: 'auto', nome: 'Idioma: automático' },
    ],
    vozes: async (chave) => {
      const fixas = ['eve', 'ara', 'leo', 'rex', 'sal'].map((id) => ({ id, nome: id[0].toUpperCase() + id.slice(1) }))
      const r = await fetch('https://api.x.ai/v1/tts/voices', { headers: { Authorization: `Bearer ${chave}` } }).catch(() => null)
      if (!r?.ok) return fixas
      const j = await r.json().catch(() => null)
      const lista: { voice_id?: string; id?: string; name?: string }[] = Array.isArray(j) ? j : (j?.voices ?? j?.data ?? [])
      const vozes = lista
        .map((v) => ({ id: v.voice_id ?? v.id ?? v.name ?? '', nome: v.name ?? v.voice_id ?? v.id ?? '' }))
        .filter((v) => v.id)
      return vozes.length ? vozes : fixas
    },
    falar: async (chave, { modelo, voz, texto }) => {
      const r = await comPrazo('https://api.x.ai/v1/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: texto,
          voice_id: voz,
          language: modelo,
          output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
        }),
      })
      return { ...(await audioBruto(r, 'audio/mpeg')), custoUsd: (texto.length * 15) / 1_000_000 }
    },
  },

  deepgram: {
    nome: 'Deepgram',
    segredo: 'DEEPGRAM_API_KEY',
    preco: 'US$ 30 por 1 mi de caracteres · NÃO fala português',
    // No Deepgram o modelo é a voz; a lista fica toda em "vozes".
    modelos: [{ id: 'aura-2', nome: 'Aura-2' }],
    vozes: async () => [
      // As espanholas alternam com o inglês na mesma frase — o mais perto de português que há.
      { id: 'aura-2-carina-es', nome: 'Carina (espanhol + inglês)' },
      { id: 'aura-2-selena-es', nome: 'Selena (espanhol + inglês)' },
      { id: 'aura-2-javier-es', nome: 'Javier (espanhol + inglês)' },
      { id: 'aura-2-thalia-en', nome: 'Thalia (só inglês)' },
      { id: 'aura-2-helena-en', nome: 'Helena (só inglês)' },
      { id: 'aura-2-aries-en', nome: 'Aries (só inglês)' },
    ],
    falar: async (chave, { voz, texto }) => {
      const r = await comPrazo(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voz)}&encoding=mp3&bit_rate=48000`, {
        method: 'POST',
        headers: { Authorization: `Token ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texto }),
      })
      return { ...(await audioBruto(r, 'audio/mpeg')), custoUsd: (texto.length * 30) / 1_000_000 }
    },
  },
}

type Pedido = { acao?: 'provedores' | 'falar'; provedor?: string; modelo?: string; voz?: string; texto?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)
  let pedido: Pedido
  try {
    pedido = await req.json()
  } catch {
    return respostaErro('Corpo inválido.')
  }

  const dbProfessor = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao, error: erroSessao } = await dbProfessor.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)
  const { data: acesso } = await clienteAdmin().from('tutor_acesso').select('professor_id').eq('professor_id', sessao.user.id).maybeSingle()
  if (!acesso) return respostaErro('O tutor não está liberado para a sua conta.', 403)

  if (pedido.acao === 'provedores') {
    const lista = await Promise.all(
      Object.entries(PROVEDORES).map(async ([id, p]) => {
        const chave = Deno.env.get(p.segredo)
        let vozes: Opcao[] = []
        let erro: string | undefined
        if (chave) {
          try {
            vozes = await p.vozes(chave)
          } catch (e) {
            erro = e instanceof Error ? e.message : String(e)
          }
        }
        return { id, nome: p.nome, segredo: p.segredo, preco: p.preco, erro, configurado: Boolean(chave) && vozes.length > 0, modelos: p.modelos, vozes }
      }),
    )
    return respostaJson(lista)
  }

  if (pedido.acao !== 'falar') return respostaErro('Ação desconhecida.')
  const p = pedido.provedor ? PROVEDORES[pedido.provedor] : undefined
  const texto = pedido.texto?.trim() ?? ''
  if (!p || !pedido.voz || !pedido.modelo) return respostaErro('Escolha o serviço, o modelo e a voz.')
  if (!texto) return respostaErro('Fala vazia.')
  if (texto.length > LIMITE_TEXTO) return respostaErro(`No máximo ${LIMITE_TEXTO} caracteres por fala.`, 413)
  if (!p.modelos.some((m) => m.id === pedido.modelo)) return respostaErro('Modelo desconhecido.')
  const chave = Deno.env.get(p.segredo)
  if (!chave) return respostaErro(`Falta o segredo ${p.segredo}.`, 500)

  const inicio = Date.now()
  try {
    const audio = await p.falar(chave, { modelo: pedido.modelo, voz: pedido.voz, texto })
    return respostaJson({ ...audio, ms: Date.now() - inicio })
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e)
    console.error('tutor-comparar-vozes:', pedido.provedor, mensagem)
    return respostaErro(mensagem.slice(0, 300), 502)
  }
})

async function comPrazo(url: string, init: RequestInit): Promise<Response> {
  const controlador = new AbortController()
  const id = setTimeout(() => controlador.abort(), TEMPO_MAXIMO_MS)
  try {
    return await fetch(url, { ...init, signal: controlador.signal })
  } finally {
    clearTimeout(id)
  }
}

/** A resposta em áudio (bytes crus ou JSON com base64), ou o erro do serviço em texto. */
async function audioBruto(r: Response, mimePadrao: string): Promise<{ base64: string; mimeType: string }> {
  const tipo = r.headers.get('content-type') ?? ''
  if (!r.ok) throw new Error(`respondeu ${r.status}: ${(await r.text()).slice(0, 250)}`)
  if (tipo.includes('json')) {
    const j = await r.json()
    if (!j.audio) throw new Error(`não devolveu áudio: ${JSON.stringify(j).slice(0, 200)}`)
    return { base64: j.audio, mimeType: j.content_type ?? mimePadrao }
  }
  const bytes = new Uint8Array(await r.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { base64: btoa(bin), mimeType: tipo || mimePadrao }
}
