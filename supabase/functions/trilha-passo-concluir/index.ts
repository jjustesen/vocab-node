// Deno Edge Function — chamada pelo ALUNO logado, ao tocar em "Li este
// material" no leitor. Atividade e lição do tutor concluem sozinhas (pela
// atribuição e pela sessão); material não deixa rastro, então o aluno marca.
//
// verify-jwt LIGADO (padrão), como painel-aluno-obter: quem chama já tem
// sessão de aluno. A identidade sai do JWT; a escrita vai por service_role,
// porque o aluno não escreve no banco (princípio da 0001).
//
// Confere três coisas antes de gravar: o passo é de MATERIAL, o aluno está na
// trilha, e o passo não está travado para ele agora (mesma regra do painel).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { filtroDoProfessor } from '../_shared/conta-aluno.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'
import { calcularLiberacoes } from '../_shared/trilha-liberacao.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respostaErro('Método não permitido.', 405)

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return respostaErro('Não autenticado.', 401)

  const dbAluno = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao, error: erroSessao } = await dbAluno.auth.getUser()
  if (erroSessao || !sessao.user) return respostaErro('Sessão inválida ou expirada.', 401)

  const corpo = await req.json().catch(() => ({}))
  const etapaId: unknown = corpo?.etapaId
  if (typeof etapaId !== 'string') return respostaErro('Falta o passo.', 400)

  const db = clienteAdmin()
  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id')
    .eq('user_id', sessao.user.id)
    .match(filtroDoProfessor(req))
    .order('criado_em')
    .limit(1)
    .maybeSingle()
  if (!conta) return respostaErro('Conta não encontrada.', 404)

  const { data: etapa } = await db
    .from('trilha_etapas')
    .select('id, trilha_id, material_id')
    .eq('id', etapaId)
    .maybeSingle()
  // Mesmo 404 para passo inexistente e de trilha alheia: não contar a quem
  // pergunta que o id existe.
  if (!etapa) return respostaErro('Passo não encontrado.', 404)
  if (!etapa.material_id) return respostaErro('Só material é marcado como lido.', 400)

  const [{ data: vinculo }, { data: trilha }, { data: modulos }, { data: passos }, { data: concluidos }] =
    await Promise.all([
      db.from('trilha_alunos').select('iniciada_em, status').eq('trilha_id', etapa.trilha_id).eq('aluno_id', conta.aluno_id).maybeSingle(),
      db.from('trilhas').select('navegacao, liberacao, liberacao_dias').eq('id', etapa.trilha_id).single(),
      db.from('trilha_modulos').select('id, ordem, titulo').eq('trilha_id', etapa.trilha_id),
      db.from('trilha_etapas').select('id, modulo_id, ordem, opcional').eq('trilha_id', etapa.trilha_id),
      db.from('trilha_passos_concluidos').select('etapa_id').eq('aluno_id', conta.aluno_id).eq('trilha_id', etapa.trilha_id),
    ])
  if (!vinculo || !trilha) return respostaErro('Passo não encontrado.', 404)
  if (vinculo.status === 'pausada') return respostaErro('Seu professor pausou esta trilha.', 409)

  const feitos = new Set((concluidos ?? []).map((c) => c.etapa_id))
  if (feitos.has(etapa.id)) return respostaJson({ ok: true })

  const { estadoPorPasso } = calcularLiberacoes(
    {
      navegacao: trilha.navegacao,
      liberacao: trilha.liberacao,
      liberacaoDias: trilha.liberacao_dias,
      iniciadaEm: vinculo.iniciada_em,
      agora: new Date(),
    },
    modulos ?? [],
    (passos ?? []).map((p) => ({
      id: p.id,
      moduloId: p.modulo_id,
      ordem: p.ordem,
      opcional: p.opcional,
      concluido: feitos.has(p.id),
    })),
  )
  if (estadoPorPasso.get(etapa.id) === 'travado') return respostaErro('Este passo ainda não está liberado.', 409)

  const { error } = await db
    .from('passo_conclusoes')
    .upsert({ aluno_id: conta.aluno_id, etapa_id: etapa.id }, { onConflict: 'aluno_id,etapa_id', ignoreDuplicates: true })
  if (error) return respostaErro('Não consegui marcar como lido.', 500)

  return respostaJson({ ok: true })
})
