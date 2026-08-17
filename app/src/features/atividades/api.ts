import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gerarTokenDeAcesso, hashDoToken } from '@/lib/token'
import { base64ParaBytes } from '@/lib/arquivo'
import { lembrarToken, lembrarTokenLinkAberto, linkAbertoLembrado } from '@/lib/links-lembrados'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import { chavesAlunos } from '@/features/alunos/api'
import type { Atividade, AtividadeStatus, Aluno, LinkAberto, QuestaoRow } from '@/types/db'
import type { Questao } from '@/types/questao'

/**
 * Dispara `atividade-gerar-audio` quando a atividade tem questão
 * `ordenar_audio` — é fire-and-forget de propósito: a atividade JÁ FOI salva
 * com sucesso quando isto roda, e falha de TTS não pode derrubar esse
 * resultado. A questão fica com `audio_path` nulo e o aluno cai no fallback
 * de texto (ver RespostaOrdenarAudio); o professor pode gerar de novo depois
 * pela ficha da atividade.
 */
async function gerarAudioSeNecessario(atividadeId: string, questoes: { tipo: string }[]): Promise<void> {
  if (!questoes.some((q) => q.tipo === 'ordenar_audio')) return
  try {
    await supabase.functions.invoke('atividade-gerar-audio', { body: { atividade_id: atividadeId } })
  } catch {
    // Sem retry aqui — mesma lógica de tarefa-responder: falha silenciosa,
    // recuperável depois, não vale travar a tela por causa dela.
  }
}

export const chavesAtividades = {
  todas: ['atividades'] as const,
  lista: (status?: AtividadeStatus) => ['atividades', 'lista', status ?? 'todas'] as const,
  uma: (id: string) => ['atividades', id] as const,
  questoes: (id: string) => ['atividades', id, 'questoes'] as const,
  envios: (id: string) => ['atividades', id, 'envios'] as const,
  editavel: (id: string) => ['atividades', id, 'editavel'] as const,
  linkAberto: (id: string) => ['atividades', id, 'link-aberto'] as const,
}

export type AtividadeComEnvio = Atividade & {
  enviada: boolean
  envios: number
  questoes: number
  /** Média de acerto entre as tentativas concluídas; null se ninguém concluiu. */
  mediaPercentual: number | null
}

/**
 * `atividades.status` (rascunho/publicada) não reflete envio — é um campo
 * separado que só muda via `usePublicarAtividade`, hoje sem botão nenhum na
 * UI (RF-71 pendente). O selo "ainda não enviada" da listagem precisa saber
 * se a atividade já foi enviada de verdade, então checamos `atribuicoes`.
 *
 * Os contadores do card (envios, questões, média) vêm em 3 consultas planas
 * agregadas em memória — é o mesmo padrão de useHistoricoDoAluno, e evita uma
 * consulta por atividade.
 */
export function useAtividades(status?: AtividadeStatus) {
  return useQuery({
    queryKey: chavesAtividades.lista(status),
    queryFn: async (): Promise<AtividadeComEnvio[]> => {
      let query = supabase.from('atividades').select('*').order('criada_em', { ascending: false })
      if (status) query = query.eq('status', status)
      const { data, error } = await query
      if (error) throw error
      if (data.length === 0) return []

      const ids = data.map((a) => a.id)
      const [
        { data: atribuicoes, error: erroAtribuicoes },
        { data: questoes, error: erroQuestoes },
      ] = await Promise.all([
        supabase.from('atribuicoes').select('id, atividade_id, concluida_em').in('atividade_id', ids),
        supabase.from('questoes').select('id, atividade_id').in('atividade_id', ids),
      ])
      if (erroAtribuicoes) throw erroAtribuicoes
      if (erroQuestoes) throw erroQuestoes

      const questoesPorAtividade = new Map<string, number>()
      for (const q of questoes) {
        questoesPorAtividade.set(q.atividade_id, (questoesPorAtividade.get(q.atividade_id) ?? 0) + 1)
      }

      const enviosPorAtividade = new Map<string, number>()
      for (const a of atribuicoes) {
        enviosPorAtividade.set(a.atividade_id, (enviosPorAtividade.get(a.atividade_id) ?? 0) + 1)
      }

      // A média só considera tentativas concluídas — quem ainda não respondeu
      // não tem placar e puxaria a média para baixo indevidamente.
      const concluidas = atribuicoes.filter((a) => a.concluida_em)
      const acertosPorAtribuicao = new Map<string, { acertos: number; total: number }>()
      if (concluidas.length > 0) {
        const { data: respostas, error: erroRespostas } = await supabase
          .from('respostas')
          .select('atribuicao_id, correta')
          .in(
            'atribuicao_id',
            concluidas.map((a) => a.id),
          )
        if (erroRespostas) throw erroRespostas
        for (const r of respostas) {
          const atual = acertosPorAtribuicao.get(r.atribuicao_id) ?? { acertos: 0, total: 0 }
          atual.total += 1
          if (r.correta) atual.acertos += 1
          acertosPorAtribuicao.set(r.atribuicao_id, atual)
        }
      }

      const percentuaisPorAtividade = new Map<string, number[]>()
      for (const a of concluidas) {
        const placar = acertosPorAtribuicao.get(a.id)
        if (!placar || placar.total === 0) continue
        const lista = percentuaisPorAtividade.get(a.atividade_id) ?? []
        lista.push((placar.acertos / placar.total) * 100)
        percentuaisPorAtividade.set(a.atividade_id, lista)
      }

      return data.map((a) => {
        const percentuais = percentuaisPorAtividade.get(a.id) ?? []
        return {
          ...a,
          enviada: (enviosPorAtividade.get(a.id) ?? 0) > 0,
          envios: enviosPorAtividade.get(a.id) ?? 0,
          questoes: questoesPorAtividade.get(a.id) ?? 0,
          mediaPercentual:
            percentuais.length > 0
              ? Math.round(percentuais.reduce((s, p) => s + p, 0) / percentuais.length)
              : null,
        }
      })
    },
  })
}

export function useAtividade(id: string | undefined) {
  return useQuery({
    queryKey: chavesAtividades.uma(id!),
    enabled: Boolean(id),
    queryFn: async (): Promise<Atividade> => {
      const { data, error } = await supabase.from('atividades').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })
}

/**
 * Retry manual de `atividade-gerar-audio` — para quando o disparo automático
 * de `gerarAudioSeNecessario` falhou ao salvar (rede caiu, Gemini fora do ar)
 * e sobrou `ordenar_audio` sem áudio. A função só processa o que ainda tem
 * `audio_path` nulo, então chamar de novo é seguro mesmo com questões que já
 * geraram — não gasta chamada duplicada.
 */
export function useGerarAudioAtividade(atividadeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{ gerados: number; falharam: number }> => {
      const { data, error } = await supabase.functions.invoke('atividade-gerar-audio', {
        body: { atividade_id: atividadeId },
      })
      if (error) throw new Error(await extrairMensagemDeErro(error))
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAtividades.questoes(atividadeId) }),
  })
}

export function useQuestoesDaAtividade(atividadeId: string | undefined) {
  return useQuery({
    queryKey: chavesAtividades.questoes(atividadeId!),
    enabled: Boolean(atividadeId),
    queryFn: async (): Promise<QuestaoRow[]> => {
      const { data, error } = await supabase
        .from('questoes')
        .select('*')
        .eq('atividade_id', atividadeId!)
        .order('ordem')
      if (error) throw error
      return data
    },
  })
}

export type MaterialParaSalvar =
  | { tipo: 'texto'; conteudo: string }
  | { tipo: 'imagem' | 'pdf'; conteudo: string; mimeType: string; nome: string }

export type NovaAtividadeEntrada = {
  titulo: string
  nivel: Atividade['nivel']
  habilidades: string[]
  questoes: Questao[]
  origemIA?: boolean
  /** Material que deu origem à atividade (etapa 3) — vira uma linha em `materiais`, linkada por `material_id`. */
  material?: MaterialParaSalvar
}

const EXTENSAO_POR_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'application/pdf': 'pdf' }

/**
 * PDF/foto sobe pro bucket privado `materiais` (path `${professor_id}/...` —
 * é o que a policy de storage exige, ver 0004_storage_materiais.sql). Texto
 * colado não precisa de upload, só grava o próprio texto na coluna.
 */
async function criarMaterial(professorId: string, material: MaterialParaSalvar): Promise<string> {
  if (material.tipo === 'texto') {
    const { data, error } = await supabase
      .from('materiais')
      .insert({ professor_id: professorId, tipo: 'texto', nome: 'Texto colado', texto: material.conteudo })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  const extensao = EXTENSAO_POR_MIME[material.mimeType] ?? 'bin'
  const path = `${professorId}/${crypto.randomUUID()}.${extensao}`
  const { error: erroUpload } = await supabase.storage
    .from('materiais')
    .upload(path, base64ParaBytes(material.conteudo), { contentType: material.mimeType })
  if (erroUpload) throw erroUpload

  const { data, error } = await supabase
    .from('materiais')
    .insert({ professor_id: professorId, tipo: material.tipo, nome: material.nome, storage_path: path })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/**
 * Cria a atividade e suas questões numa transação lógica: se a inserção das
 * questões falhar, apaga a atividade — nunca deixamos uma atividade "vazia"
 * (sem questão nenhuma) publicável por engano.
 */
export function useCriarAtividade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: NovaAtividadeEntrada) => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      const materialId = entrada.material ? await criarMaterial(sessao.user.id, entrada.material) : null

      const { data: atividade, error: erroAtividade } = await supabase
        .from('atividades')
        .insert({
          professor_id: sessao.user.id,
          material_id: materialId,
          titulo: entrada.titulo,
          nivel: entrada.nivel,
          habilidades: entrada.habilidades,
          status: 'rascunho',
          origem_ia: entrada.origemIA ?? false,
        })
        .select()
        .single()
      if (erroAtividade) throw erroAtividade

      const linhas = entrada.questoes.map((q, i) => ({
        atividade_id: atividade.id,
        ordem: i + 1,
        tipo: q.tipo,
        instrucao: q.instrucao,
        enunciado: q.enunciado,
        opcoes: q.opcoes,
        resposta_correta: q.resposta_correta,
        respostas_aceitas: q.respostas_aceitas,
        pares: q.pares,
        explicacao: q.explicacao,
      }))

      const { error: erroQuestoes } = await supabase.from('questoes').insert(linhas)
      if (erroQuestoes) {
        await supabase.from('atividades').delete().eq('id', atividade.id)
        throw erroQuestoes
      }

      await gerarAudioSeNecessario(atividade.id, linhas)
      return atividade
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAtividades.todas }),
  })
}

/**
 * Uma atividade só pode ter as QUESTÕES editadas em bloco enquanto nenhum
 * aluno respondeu nada. `questoes` referencia `respostas.questao_id` com
 * `on delete cascade` (0001_init.sql) — reescrever as questões de uma
 * atividade já respondida apagaria o histórico do aluno junto. Título,
 * nível e habilidades continuam editáveis sempre (não têm esse risco).
 */
export function useAtividadeEditavel(atividadeId: string | undefined) {
  return useQuery({
    queryKey: chavesAtividades.editavel(atividadeId!),
    enabled: Boolean(atividadeId),
    queryFn: async (): Promise<boolean> => {
      const { data: atribuicoes, error } = await supabase
        .from('atribuicoes')
        .select('id')
        .eq('atividade_id', atividadeId!)
      if (error) throw error
      if (atribuicoes.length === 0) return true

      const { count, error: erroRespostas } = await supabase
        .from('respostas')
        .select('*', { count: 'exact', head: true })
        .in(
          'atribuicao_id',
          atribuicoes.map((a) => a.id),
        )
      if (erroRespostas) throw erroRespostas
      return (count ?? 0) === 0
    },
  })
}

async function questaoJaTemResposta(atividadeId: string): Promise<boolean> {
  const { data: atribuicoes } = await supabase.from('atribuicoes').select('id').eq('atividade_id', atividadeId)
  if (!atribuicoes || atribuicoes.length === 0) return false
  const { count } = await supabase
    .from('respostas')
    .select('*', { count: 'exact', head: true })
    .in(
      'atribuicao_id',
      atribuicoes.map((a) => a.id),
    )
  return (count ?? 0) > 0
}

/**
 * Substitui título/nível/habilidades/questões inteiras. Só chame quando
 * `useAtividadeEditavel` disser `true` — a mutation também checa de novo por
 * segurança (não confia só na UI ter feito a verificação antes).
 */
export function useAtualizarAtividadeCompleta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...entrada }: NovaAtividadeEntrada & { id: string }) => {
      if (await questaoJaTemResposta(id)) {
        throw new Error('Esta atividade já tem respostas registradas — as questões não podem mais ser alteradas.')
      }

      const { data: atividade, error: erroAtividade } = await supabase
        .from('atividades')
        .update({ titulo: entrada.titulo, nivel: entrada.nivel, habilidades: entrada.habilidades })
        .eq('id', id)
        .select()
        .single()
      if (erroAtividade) throw erroAtividade

      const { error: erroDelete } = await supabase.from('questoes').delete().eq('atividade_id', id)
      if (erroDelete) throw erroDelete

      const linhas = entrada.questoes.map((q, i) => ({
        atividade_id: id,
        ordem: i + 1,
        tipo: q.tipo,
        instrucao: q.instrucao,
        enunciado: q.enunciado,
        opcoes: q.opcoes,
        resposta_correta: q.resposta_correta,
        respostas_aceitas: q.respostas_aceitas,
        pares: q.pares,
        explicacao: q.explicacao,
      }))
      const { error: erroInsert } = await supabase.from('questoes').insert(linhas)
      if (erroInsert) throw erroInsert

      await gerarAudioSeNecessario(id, linhas)
      return atividade
    },
    onSuccess: (atividade) => {
      qc.invalidateQueries({ queryKey: chavesAtividades.todas })
      qc.invalidateQueries({ queryKey: chavesAtividades.questoes(atividade.id) })
      qc.setQueryData(chavesAtividades.uma(atividade.id), atividade)
    },
  })
}

/** Caminho travado: atividade já tem resposta, então só os metadados mudam. */
export function useAtualizarMetadadosAtividade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      titulo,
      nivel,
      habilidades,
    }: {
      id: string
      titulo: string
      nivel: Atividade['nivel']
      habilidades: string[]
    }) => {
      const { data, error } = await supabase
        .from('atividades')
        .update({ titulo, nivel, habilidades })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (atividade) => {
      qc.invalidateQueries({ queryKey: chavesAtividades.todas })
      qc.setQueryData(chavesAtividades.uma(atividade.id), atividade)
    },
  })
}

export function usePublicarAtividade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('atividades')
        .update({ status: 'publicada' })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (atividade) => {
      qc.invalidateQueries({ queryKey: chavesAtividades.todas })
      qc.setQueryData(chavesAtividades.uma(atividade.id), atividade)
    },
  })
}

export type EnvioResultado = { aluno: Aluno; link: string }

/**
 * RF-80/127: um link por aluno; reenviar ao mesmo aluno cria nova tentativa,
 * preservando a anterior. O token é gerado no navegador do professor — só o
 * hash é gravado (ver lib/token.ts).
 */
export function useEnviarAtividade(atividadeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      alunos,
      prazo,
    }: {
      alunos: Aluno[]
      prazo?: string
    }): Promise<EnvioResultado[]> => {
      const resultados: EnvioResultado[] = []

      for (const aluno of alunos) {
        const { count } = await supabase
          .from('atribuicoes')
          .select('*', { count: 'exact', head: true })
          .eq('atividade_id', atividadeId)
          .eq('aluno_id', aluno.id)

        const { token, hash } = await gerarTokenDeAcesso()

        const { data: criada, error } = await supabase
          .from('atribuicoes')
          .insert({
            atividade_id: atividadeId,
            aluno_id: aluno.id,
            token_hash: hash,
            tentativa: (count ?? 0) + 1,
            prazo: prazo || null,
          })
          .select('id')
          .single()
        if (error) throw error

        lembrarToken(criada.id, token)
        resultados.push({ aluno, link: `${window.location.origin}/t/${token}` })
      }

      return resultados
    },
    // Enviar mexe em duas árvores de cache, não uma: os envios da atividade e o
    // histórico de cada aluno que recebeu. Invalidar só a primeira funcionava
    // enquanto o envio começava sempre pela atividade; com o envio a partir da
    // ficha do aluno, "Últimas atividades" ficava desatualizada na tela em que
    // o professor acabou de clicar.
    onSuccess: (_resultados, { alunos }) => {
      qc.invalidateQueries({ queryKey: chavesAtividades.envios(atividadeId) })
      qc.invalidateQueries({ queryKey: chavesAtividades.todas })
      for (const aluno of alunos) {
        qc.invalidateQueries({ queryKey: chavesAlunos.historico(aluno.id) })
      }
    },
  })
}

/**
 * Emite um token NOVO para uma atribuição que já existe e devolve o link.
 *
 * É o plano B de quando este navegador não tem o link guardado: como o banco só
 * tem o hash, não dá para recuperar o original — dá para substituí-lo. Troca
 * apenas o `token_hash`, então tentativa, respostas e progresso do aluno ficam
 * de pé; o que morre é o link anterior, que passa a não casar com hash nenhum.
 * Na prática é o RF-30 (revogar link) pela porta dos fundos.
 */
export function useRegerarLinkDaTarefa(alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (atribuicaoId: string): Promise<string> => {
      const { token, hash } = await gerarTokenDeAcesso()
      const { error } = await supabase
        .from('atribuicoes')
        .update({ token_hash: hash })
        .eq('id', atribuicaoId)
      if (error) throw error

      lembrarToken(atribuicaoId, token)
      return `${window.location.origin}/t/${token}`
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAlunos.historico(alunoId) }),
  })
}

export type LinkAbertoDaAtividade = {
  registro: LinkAberto
  /**
   * Link completo, ou null quando este navegador não presenciou a geração —
   * o banco só tem o hash (RNF-09), então nesse caso a única saída que o
   * modal pode oferecer é gerar um link novo.
   */
  url: string | null
}

/** Link aberto (0010) da atividade — null se nunca foi gerado. */
export function useLinkAberto(atividadeId: string | undefined) {
  return useQuery({
    queryKey: chavesAtividades.linkAberto(atividadeId!),
    enabled: Boolean(atividadeId),
    queryFn: async (): Promise<LinkAbertoDaAtividade | null> => {
      const { data, error } = await supabase
        .from('links_abertos')
        .select('*')
        .eq('atividade_id', atividadeId!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      // O lembrete local pode estar velho (link regerado em outro navegador):
      // só vale se o hash do token guardado bater com o hash da linha atual.
      let url = linkAbertoLembrado(atividadeId!)
      if (url) {
        const token = url.split('/a/')[1]
        if ((await hashDoToken(token)) !== data.token_hash) url = null
      }
      return { registro: data, url }
    },
  })
}

/**
 * Gera (ou regera) o link aberto da atividade. Upsert por `atividade_id`
 * (unique em 0010): regerar troca o token e REINICIA a janela de 12h na mesma
 * linha — o link anterior morre na hora, as atribuições já criadas ficam.
 */
export function useGerarLinkAberto(atividadeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      const { token, hash } = await gerarTokenDeAcesso()
      const DOZE_HORAS_MS = 12 * 60 * 60 * 1000
      const { error } = await supabase.from('links_abertos').upsert(
        {
          atividade_id: atividadeId,
          professor_id: sessao.user.id,
          token_hash: hash,
          cadastro_expira_em: new Date(Date.now() + DOZE_HORAS_MS).toISOString(),
          criado_em: new Date().toISOString(),
        },
        { onConflict: 'atividade_id' },
      )
      if (error) throw error

      lembrarTokenLinkAberto(atividadeId, token)
      return `${window.location.origin}/a/${token}`
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAtividades.linkAberto(atividadeId) }),
  })
}

/**
 * `trilha_etapas.atividade_id` é `on delete restrict` (0001_init.sql) — uma
 * atividade usada numa trilha não pode ser apagada direto, senão o professor
 * perderia a sequência da trilha sem perceber; o Postgres barra com erro
 * 23503, que a gente traduz aqui. `questoes`, `atribuicoes` e `respostas`
 * cascateiam sozinhos, então apagar a atividade já apaga o histórico (envios
 * e respostas) de todo aluno que a recebeu — é o próprio mecanismo, não algo
 * que esta função precise fazer manualmente.
 */
export function useExcluirAtividade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (atividadeId: string) => {
      const { error } = await supabase.from('atividades').delete().eq('id', atividadeId)
      if (error) {
        if (error.code === '23503') {
          throw new Error('Esta atividade faz parte de uma trilha — remova-a da trilha antes de excluir.')
        }
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chavesAtividades.todas })
      qc.invalidateQueries({ queryKey: ['alunos'] })
      qc.invalidateQueries({ queryKey: ['trilhas'] })
    },
  })
}

export type EnvioComResultado = {
  id: string
  aluno_id: string
  aluno_nome: string
  tentativa: number
  enviada_em: string
  concluida_em: string | null
  acertos: number | null
  total: number | null
}

/** "Quem já fez" — lista de atribuições da atividade com placar, se concluída. */
export function useEnviosDaAtividade(atividadeId: string | undefined) {
  return useQuery({
    queryKey: chavesAtividades.envios(atividadeId!),
    enabled: Boolean(atividadeId),
    queryFn: async (): Promise<EnvioComResultado[]> => {
      // Duas consultas simples em vez de select aninhado — evita depender de
      // `Relationships` (deixado vazio em types/db.ts, ver comentário lá).
      const { data: atribuicoes, error } = await supabase
        .from('atribuicoes')
        .select('id, aluno_id, tentativa, enviada_em, concluida_em')
        .eq('atividade_id', atividadeId!)
        .order('enviada_em', { ascending: false })
      if (error) throw error
      if (atribuicoes.length === 0) return []

      const idsAlunos = [...new Set(atribuicoes.map((a) => a.aluno_id))]
      const { data: alunos, error: erroAlunos } = await supabase
        .from('alunos')
        .select('id, nome')
        .in('id', idsAlunos)
      if (erroAlunos) throw erroAlunos
      const nomePorId = new Map(alunos.map((a) => [a.id, a.nome]))

      const resultados: EnvioComResultado[] = []
      for (const a of atribuicoes) {
        let acertos: number | null = null
        let total: number | null = null

        if (a.concluida_em) {
          const { data: respostas } = await supabase
            .from('respostas')
            .select('correta')
            .eq('atribuicao_id', a.id)
          total = respostas?.length ?? 0
          acertos = respostas?.filter((r) => r.correta).length ?? 0
        }

        resultados.push({
          id: a.id,
          aluno_id: a.aluno_id,
          aluno_nome: nomePorId.get(a.aluno_id) ?? 'Aluno',
          tentativa: a.tentativa,
          enviada_em: a.enviada_em,
          concluida_em: a.concluida_em,
          acertos,
          total,
        })
      }
      return resultados
    },
  })
}
