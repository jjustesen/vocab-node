// Deno Edge Function — chamada pelo PROFESSOR autenticado (ao contrário de
// tarefa-*, que são chamadas pelo aluno sem sessão). Roda com verify-jwt
// ligado (padrão do deploy): a chave da IA nunca sai do servidor.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { GeminiProvider } from '../_shared/ia/gemini.ts'
import { atividadeBrutaSchema, questaoSchema, NIVEIS, HABILIDADES, type Questao } from '../_shared/questao-validacao.ts'
import { limiteGeracoes } from '../_shared/planos.ts'
import type { MaterialGeracao, ParametrosGeracao, UsoIA } from '../_shared/ia/tipos.ts'

const QUANTIDADE_MIN = 1
const QUANTIDADE_MAX = 20
const MATERIAL_MIN_CARACTERES = 20
const IMAGEM_MAX_BYTES = 8 * 1024 * 1024
const PDF_MAX_BYTES = 15 * 1024 * 1024

/** Tamanho decodificado a partir do comprimento base64 — não vale a pena decodificar só pra medir. */
function bytesDeBase64(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}

function validarMaterial(bruto: unknown): MaterialGeracao | { erro: string } {
  if (typeof bruto !== 'object' || bruto === null) return { erro: 'Material ausente.' }
  const m = bruto as { tipo?: unknown; conteudo?: unknown; mimeType?: unknown }

  if (m.tipo === 'texto') {
    const conteudo = typeof m.conteudo === 'string' ? m.conteudo.trim() : ''
    if (conteudo.length < MATERIAL_MIN_CARACTERES) {
      return { erro: 'Cole o material da aula — precisa de mais texto para gerar algo bom.' }
    }
    return { tipo: 'texto', conteudo }
  }

  if (m.tipo === 'imagem' || m.tipo === 'pdf') {
    const conteudo = typeof m.conteudo === 'string' ? m.conteudo : ''
    const mimeType = typeof m.mimeType === 'string' ? m.mimeType : ''
    if (!conteudo) return { erro: 'Arquivo vazio ou não enviado corretamente.' }

    if (m.tipo === 'imagem') {
      if (!mimeType.startsWith('image/')) return { erro: 'Tipo de imagem inválido.' }
      if (bytesDeBase64(conteudo) > IMAGEM_MAX_BYTES) return { erro: 'Foto muito grande — envie uma imagem menor.' }
    } else {
      if (mimeType !== 'application/pdf') return { erro: 'Tipo de arquivo inválido — envie um PDF.' }
      if (bytesDeBase64(conteudo) > PDF_MAX_BYTES) return { erro: 'PDF muito grande — envie um arquivo menor.' }
    }

    return { tipo: m.tipo, conteudo, mimeType }
  }

  return { erro: 'Tipo de material inválido.' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })

  const { data: sessao, error: erroSessao } = await db.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  // RF-110/111/112: cota mensal por plano. Único ponto que barra de verdade
  // (o aviso no front é só cópia — quem chamar a função direto cai aqui).
  const { data: professor, error: erroProfessor } = await db
    .from('professores')
    .select('plano')
    .eq('id', sessao.user.id)
    .single()
  if (erroProfessor) return respostaErro(erroProfessor.message, 500)

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const { count: geracoesDoMes, error: erroContagem } = await db
    .from('geracoes_ia')
    .select('*', { count: 'exact', head: true })
    .eq('sucesso', true)
    .gte('criada_em', inicioMes.toISOString())
  if (erroContagem) return respostaErro(erroContagem.message, 500)

  const limite = limiteGeracoes(professor.plano)
  if ((geracoesDoMes ?? 0) >= limite) {
    return respostaErro(
      professor.plano === 'ilimitado'
        ? `Você atingiu o limite de ${limite} gerações por IA este mês.`
        : `Você atingiu o limite de ${limite} gerações por IA do seu plano este mês. Faça upgrade para gerar mais.`,
      429,
    )
  }

  let corpo: {
    material?: unknown
    nivel?: unknown
    quantidade?: unknown
    habilidades?: unknown
    foco?: unknown
    erros_recorrentes?: unknown
  }
  try {
    corpo = await req.json()
  } catch {
    return respostaErro('Corpo da requisição inválido.')
  }

  const materialValidado = validarMaterial(corpo.material)
  if ('erro' in materialValidado) return respostaErro(materialValidado.erro)
  const material = materialValidado

  const nivel = corpo.nivel
  if (typeof nivel !== 'string' || !(NIVEIS as readonly string[]).includes(nivel)) {
    return respostaErro('Nível inválido.')
  }

  const quantidade = Number(corpo.quantidade)
  if (!Number.isInteger(quantidade) || quantidade < QUANTIDADE_MIN || quantidade > QUANTIDADE_MAX) {
    return respostaErro(`Número de questões precisa estar entre ${QUANTIDADE_MIN} e ${QUANTIDADE_MAX}.`)
  }

  const habilidades = Array.isArray(corpo.habilidades)
    ? corpo.habilidades.filter((h): h is string => (HABILIDADES as readonly string[]).includes(h))
    : []

  const foco = typeof corpo.foco === 'string' ? corpo.foco : undefined
  const errosRecorrentes = typeof corpo.erros_recorrentes === 'string' ? corpo.erros_recorrentes : undefined

  const parametros: ParametrosGeracao = { nivel, quantidade, habilidades, foco, errosRecorrentes }
  const provedor = new GeminiProvider()

  async function registrarUso(sucesso: boolean, uso?: UsoIA) {
    await db.from('geracoes_ia').insert({
      professor_id: sessao.user!.id,
      atividade_id: null,
      provedor: 'gemini',
      modelo: uso?.modelo ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash',
      tokens_entrada: uso?.tokensEntrada ?? null,
      tokens_saida: uso?.tokensSaida ?? null,
      custo_usd: uso?.custoUsd ?? null,
      sucesso,
    })
  }

  let resultado: { dados: unknown; uso: UsoIA }
  try {
    resultado = await provedor.gerarAtividade({ material, parametros })
  } catch (e) {
    await registrarUso(false)
    return respostaErro(e instanceof Error ? e.message : 'Falha ao gerar a atividade. Tente novamente.', 502)
  }

  const bruto = atividadeBrutaSchema.safeParse(resultado.dados)
  if (!bruto.success) {
    await registrarUso(false, resultado.uso)
    return respostaErro('A IA devolveu um formato inesperado. Tente novamente.', 502)
  }

  const questoesValidas: Questao[] = []
  let descartadas = 0
  for (const q of bruto.data.questoes) {
    const r = questaoSchema.safeParse(q)
    if (r.success) questoesValidas.push(r.data)
    else descartadas++
  }

  // §5.3 do prompt: se sobrou menos que o pedido, complementa numa segunda
  // chamada em vez de entregar uma atividade capenga — sem repetir o que já
  // foi aceito. Falha aqui não é fatal: segue só com o que já tem.
  if (questoesValidas.length > 0 && questoesValidas.length < quantidade) {
    try {
      const complemento = await provedor.gerarAtividade({
        material,
        parametros: { ...parametros, quantidade: quantidade - questoesValidas.length },
        questoesJaAceitas: questoesValidas.map((q) => q.enunciado),
      })
      resultado.uso.tokensEntrada += complemento.uso.tokensEntrada
      resultado.uso.tokensSaida += complemento.uso.tokensSaida
      resultado.uso.custoUsd += complemento.uso.custoUsd

      const brutoComplemento = atividadeBrutaSchema.safeParse(complemento.dados)
      if (brutoComplemento.success) {
        for (const q of brutoComplemento.data.questoes) {
          const r = questaoSchema.safeParse(q)
          if (r.success) questoesValidas.push(r.data)
          else descartadas++
        }
      }
    } catch {
      // segue só com o que já tem
    }
  }

  await registrarUso(questoesValidas.length > 0, resultado.uso)

  if (questoesValidas.length === 0) {
    return respostaErro('Não consegui gerar nenhuma questão válida a partir deste material. Tente novamente ou com mais conteúdo.', 502)
  }

  return respostaJson({
    titulo: bruto.data.titulo,
    nivel: bruto.data.nivel,
    habilidades: bruto.data.habilidades.filter((h): h is string => (HABILIDADES as readonly string[]).includes(h)),
    questoes: questoesValidas,
    descartadas,
  })
})
