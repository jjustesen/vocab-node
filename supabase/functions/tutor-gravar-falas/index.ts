// Deno Edge Function — o botão "Gerar os que faltam" do painel Áudios do editor
// de lições (professor logado, verify-jwt ligado).
//
// O editor lista as falas fixas da lição (poc-tutor/src/falasFixas.ts) e manda
// de poucas em poucas; aqui cada uma vira tutor-falas/<chave>.mp3, com a mesma
// voz e semente da aula (falarInteiro), e a chave entra em
// tutor_licoes.falas_gravadas. A página do aluno toca esses arquivos na hora,
// sem esperar nem pagar o TTS.
//
// A chave é RECALCULADA aqui a partir do texto (chave.ts): o navegador manda
// só a fala, nunca o nome do arquivo. Como o nome é o hash do texto, uma fala
// que já existe no bucket (de outra lição, "Muito bem.") não é gravada de novo.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { chaveDaFala } from '../_shared/tutor/chave.ts'
import { ErroDePedido } from '../_shared/tutor/comum.ts'
import { falarInteiro, type Parte, textoDaFala } from '../_shared/tutor/falar.ts'
import { custoEmUsd } from '../_shared/tutor/precos.ts'
import { wavParaMp3 } from '../_shared/tutor/mp3.ts'

/** Por chamada: o TTS leva 2–4 s por fala e a cota por minuto é baixa. */
const FALAS_POR_CHAMADA = 6
const BUCKET = 'tutor-falas'

type Pedido = { licaoId?: string; falas?: Parte[][] }

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
  const falas = pedido.falas ?? []
  if (!pedido.licaoId || falas.length === 0) return respostaErro('Mande a lição e as falas.')
  if (falas.length > FALAS_POR_CHAMADA) return respostaErro(`No máximo ${FALAS_POR_CHAMADA} falas por vez.`, 413)

  const dbProfessor = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao, error: erroSessao } = await dbProfessor.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  const db = clienteAdmin()
  const [{ data: acesso }, { data: licao }] = await Promise.all([
    db.from('tutor_acesso').select('professor_id').eq('professor_id', sessao.user.id).maybeSingle(),
    db
      .from('tutor_licoes')
      .select('id, falas_gravadas')
      .eq('id', pedido.licaoId)
      .eq('professor_id', sessao.user.id)
      .maybeSingle(),
  ])
  if (!acesso) return respostaErro('O tutor não está liberado para a sua conta.', 403)
  // Só a lição DELE: as da biblioteca são gravadas pelo script de publicação.
  if (!licao) return respostaErro('Lição não encontrada.', 404)

  const chaveGemini = Deno.env.get('GEMINI_API_KEY')
  if (!chaveGemini) return respostaErro('GEMINI_API_KEY não configurada.', 500)

  const gravadas: string[] = []
  const jaExistiam: string[] = []
  const falharam: { chave: string; erro: string }[] = []
  let limiteDoTts = false
  let custoUsd = 0

  for (const fala of falas) {
    const chave = chaveDaFala(fala)
    try {
      const texto = textoDaFala(fala)
      if (await existeNoBucket(chave)) {
        jaExistiam.push(chave)
        continue
      }
      // Depois de um 429 o resto da leva bateria no mesmo limite: o editor espera e manda de novo.
      if (limiteDoTts) {
        falharam.push({ chave, erro: 'limite do TTS' })
        continue
      }
      const { audio, custos } = await falarInteiro(chaveGemini, texto)
      custoUsd += custoEmUsd(custos)
      const mp3 = wavParaMp3(base64ParaBytes(audio.base64))
      const { error } = await db.storage.from(BUCKET).upload(`${chave}.mp3`, mp3, {
        contentType: 'audio/mpeg',
        upsert: true,
        // O nome é o hash do texto: o arquivo de uma chave nunca muda.
        cacheControl: '31536000',
      })
      if (error) throw new Error(error.message)
      gravadas.push(chave)
    } catch (e) {
      const erro = e instanceof ErroDePedido || e instanceof Error ? e.message : String(e)
      if (erro.includes('429')) limiteDoTts = true
      console.error('tutor-gravar-falas:', chave, erro)
      falharam.push({ chave, erro: erro.includes('429') ? 'limite do TTS' : erro.slice(0, 200) })
    }
  }

  const novas = [...gravadas, ...jaExistiam]
  if (novas.length || custoUsd > 0) {
    // Junta à lista e soma o custo no banco, numa atualização só: o editor grava
    // fala por fala em paralelo, e ler-juntar-regravar perderia uma delas.
    const { error } = await db.rpc('tutor_registrar_falas', { p_licao: licao.id, p_chaves: novas, p_custo_usd: custoUsd })
    if (error) return respostaErro('Gravei os áudios, mas não consegui anotar na lição. Tente de novo.', 500)
  }

  return respostaJson({ gravadas, jaExistiam, falharam, limiteDoTts, custoUsd })
})

async function existeNoBucket(chave: string): Promise<boolean> {
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/${BUCKET}/${chave}.mp3`, { method: 'HEAD' })
  return r.ok
}

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
