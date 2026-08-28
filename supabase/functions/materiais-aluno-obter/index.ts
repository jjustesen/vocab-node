// Deno Edge Function — chamada pelo ALUNO logado (JWT próprio, cliente
// separado em lib/supabase-aluno.ts). Mesmo padrão de painel-aluno-obter: a
// identidade sai do JWT e as leituras vão por service_role, porque RLS deste
// banco serve só ao professor (ver cabeçalho de 0001_init.sql).
//
// Dois modos, no mesmo endpoint:
//   {}                     -> lista os materiais vinculados a este aluno
//   { materialId }         -> URL assinada e temporária de UM arquivo
//
// A URL assinada é gerada só no clique, e nunca em lote na listagem: o bucket
// `materiais` é privado (RNF-10) e a policy `prof_owns_pasta` (0004) só
// enxerga o professor dono da pasta — o aluno não tem sessão de Postgres, então
// quem assina é o service_role, depois de confirmar que o material é dele.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clienteAdmin } from '../_shared/cliente-admin.ts'
import { CORS_HEADERS, respostaErro, respostaJson } from '../_shared/cors.ts'

/** Uma hora: folga para abrir o arquivo sem deixar o link circulando. */
const VALIDADE_URL_SEGUNDOS = 3600

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

  const db = clienteAdmin()

  const { data: conta } = await db
    .from('contas_aluno')
    .select('aluno_id')
    .eq('user_id', sessao.user.id)
    .maybeSingle()
  // 404 é identidade, não indisponibilidade — o painel usa esse status para
  // derrubar a sessão de quem entrou pela porta errada (ver features/painel/api.ts).
  if (!conta) return respostaErro('Conta não encontrada.', 404)

  const corpo = await req.json().catch(() => ({}))
  const materialId: unknown = corpo?.materialId

  if (typeof materialId === 'string') {
    const { data: material } = await db
      .from('materiais')
      .select('storage_path, aluno_id')
      .eq('id', materialId)
      .maybeSingle()
    // Mesmo 404 para material inexistente e para material de outro aluno: a
    // resposta não deve contar a quem pergunta que o id existe.
    if (!material || material.aluno_id !== conta.aluno_id) {
      return respostaErro('Material não encontrado.', 404)
    }
    if (!material.storage_path) return respostaErro('Este material não tem arquivo.', 400)

    const { data: assinada, error } = await db.storage
      .from('materiais')
      .createSignedUrl(material.storage_path, VALIDADE_URL_SEGUNDOS)
    if (error || !assinada) return respostaErro('Não consegui gerar o link do arquivo.', 500)

    return respostaJson({ url: assinada.signedUrl })
  }

  const { data: materiais } = await db
    .from('materiais')
    .select('id, tipo, nome, texto, storage_path, criado_em')
    .eq('aluno_id', conta.aluno_id)
    .order('criado_em', { ascending: false })

  // `storage_path` não sai daqui: o caminho no bucket é detalhe de servidor e o
  // aluno não tem como usá-lo — o download passa pelo modo de assinatura acima.
  return respostaJson({
    materiais: (materiais ?? []).map((m) => ({
      id: m.id,
      tipo: m.tipo,
      nome: m.nome,
      texto: m.texto,
      temArquivo: Boolean(m.storage_path),
      criadoEm: m.criado_em,
    })),
  })
})
