import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gerarTokenDeAcesso, hashDoToken } from '@/lib/token'
import { lembrarTokenLinkCadastro, tokenLinkCadastroLembrado, urlDoLinkCadastro } from '@/lib/links-lembrados'
import { limiteAlunos } from '@/lib/planos'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { Aluno, AlunoStatus, AlunoUpdate, ContaAluno, LinkCadastro, NivelCefr, ResumoDaCopia } from '@/types/db'

export const chavesAlunos = {
  todos: ['alunos'] as const,
  lista: (status: AlunoStatus) => ['alunos', 'lista', status] as const,
  um: (id: string) => ['alunos', id] as const,
  historico: (id: string) => ['alunos', id, 'historico'] as const,
  errosRecorrentes: (id: string) => ['alunos', id, 'erros-recorrentes'] as const,
  conta: (id: string) => ['alunos', id, 'conta'] as const,
  comConta: ['alunos', 'com-conta'] as const,
  ultimoReset: (id: string) => ['alunos', id, 'ultimo-reset'] as const,
  linkCadastro: ['alunos', 'link-cadastro'] as const,
}

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

/** Gera token+hash no navegador, insere o convite (RLS: prof_owns_via_aluno) e devolve o link pronto. */
async function criarConvite(alunoId: string): Promise<string> {
  const { token, hash } = await gerarTokenDeAcesso()
  const { error } = await supabase.from('convites_aluno').insert({
    aluno_id: alunoId,
    token_hash: hash,
    expira_em: new Date(Date.now() + SETE_DIAS_MS).toISOString(),
  })
  if (error) throw error
  return `${window.location.origin}/cadastro/${token}`
}

export function useAlunos(status: AlunoStatus = 'ativo') {
  return useQuery({
    queryKey: chavesAlunos.lista(status),
    queryFn: async (): Promise<Aluno[]> => {
      const { data, error } = await supabase
        .from('alunos')
        .select('*')
        .eq('status', status)
        .order('nome')
      if (error) throw error
      return data
    },
  })
}

export function useAluno(id: string | undefined) {
  return useQuery({
    queryKey: chavesAlunos.um(id!),
    enabled: Boolean(id),
    queryFn: async (): Promise<Aluno> => {
      const { data, error } = await supabase.from('alunos').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })
}

/**
 * RF-10: criar aluno exige apenas o nome. `professor_id` vem da sessão —
 * o RLS rejeita qualquer outro valor, então não confiamos no cliente para isso.
 */
export function useCriarAluno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: { nome: string; email?: string; nivel_cefr?: Aluno['nivel_cefr'] }) => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      // RF-110: o plano trava a quantidade de alunos ativos. Checado aqui (não
      // só na UI) para não depender do botão já vir desabilitado.
      const { data: professor, error: erroProfessor } = await supabase
        .from('professores')
        .select('plano')
        .eq('id', sessao.user.id)
        .single()
      if (erroProfessor) throw erroProfessor

      const limite = limiteAlunos(professor.plano)
      if (limite !== null) {
        const { count, error: erroContagem } = await supabase
          .from('alunos')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ativo')
        if (erroContagem) throw erroContagem
        if ((count ?? 0) >= limite) {
          throw new Error(
            `Seu plano permite até ${limite} alunos ativos. Arquive um aluno ou faça upgrade para adicionar mais.`,
          )
        }
      }

      const { data, error } = await supabase
        .from('alunos')
        .insert({ ...entrada, professor_id: sessao.user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAlunos.todos }),
  })
}

export function useAtualizarAluno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: AlunoUpdate }) => {
      const { data, error } = await supabase
        .from('alunos')
        .update(campos)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (aluno) => {
      qc.invalidateQueries({ queryKey: chavesAlunos.todos })
      qc.setQueryData(chavesAlunos.um(aluno.id), aluno)
    },
  })
}

export type ItemHistoricoAluno = {
  atribuicaoId: string
  atividadeId: string
  atividadeTitulo: string
  nivel: NivelCefr
  tentativa: number
  enviadaEm: string
  concluidaEm: string | null
  acertos: number | null
  total: number | null
  /**
   * De que trilha esta tarefa é etapa — ou `null` quando foi enviada avulsa.
   *
   * A mesma atividade pode ir para o aluno pelos dois caminhos (a "Atividade
   * 1" sozinha e como etapa 1 de uma trilha), e sem esta marca as duas
   * apareciam iguais na ficha. Quem tirou o aluno da trilha deixa as
   * concluídas soltas (ver `useRemoverAlunoDaTrilha`): essas voltam a ser avulsas.
   */
  trilha: { id: string; nome: string; etapa: number } | null
}

/** RF-93/94: histórico de tarefas do aluno, mais recente primeiro. */
export function useHistoricoDoAluno(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesAlunos.historico(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<ItemHistoricoAluno[]> => {
      const { data: atribuicoes, error } = await supabase
        .from('atribuicoes')
        .select('id, atividade_id, trilha_etapa_id, tentativa, enviada_em, concluida_em')
        .eq('aluno_id', alunoId!)
        .order('enviada_em', { ascending: false })
      if (error) throw error
      if (atribuicoes.length === 0) return []

      const idsAtividades = [...new Set(atribuicoes.map((a) => a.atividade_id))]
      const { data: atividades, error: erroAtividades } = await supabase
        .from('atividades')
        .select('id, titulo, nivel')
        .in('id', idsAtividades)
      if (erroAtividades) throw erroAtividades
      const atividadePorId = new Map(atividades.map((a) => [a.id, a]))

      const trilhaPorEtapa = await buscarTrilhasDasEtapas(
        atribuicoes.map((a) => a.trilha_etapa_id).filter((id): id is string => Boolean(id)),
      )

      const idsConcluidas = atribuicoes.filter((a) => a.concluida_em).map((a) => a.id)
      const contagemPorAtribuicao = new Map<string, { acertos: number; total: number }>()
      if (idsConcluidas.length > 0) {
        const { data: respostas, error: erroRespostas } = await supabase
          .from('respostas')
          .select('atribuicao_id, correta')
          .in('atribuicao_id', idsConcluidas)
        if (erroRespostas) throw erroRespostas
        for (const r of respostas) {
          const atual = contagemPorAtribuicao.get(r.atribuicao_id) ?? { acertos: 0, total: 0 }
          atual.total += 1
          if (r.correta) atual.acertos += 1
          contagemPorAtribuicao.set(r.atribuicao_id, atual)
        }
      }

      return atribuicoes.map((a) => {
        const atividade = atividadePorId.get(a.atividade_id)
        const contagem = contagemPorAtribuicao.get(a.id)
        return {
          atribuicaoId: a.id,
          atividadeId: a.atividade_id,
          atividadeTitulo: atividade?.titulo ?? 'Atividade removida',
          nivel: atividade?.nivel ?? 'A1',
          tentativa: a.tentativa,
          enviadaEm: a.enviada_em,
          concluidaEm: a.concluida_em,
          acertos: contagem?.acertos ?? null,
          total: contagem?.total ?? null,
          trilha: (a.trilha_etapa_id && trilhaPorEtapa.get(a.trilha_etapa_id)) || null,
        }
      })
    },
  })
}

/** Etapa → trilha e posição dela. Duas consultas planas, como o resto deste arquivo. */
async function buscarTrilhasDasEtapas(
  idsEtapas: string[],
): Promise<Map<string, { id: string; nome: string; etapa: number }>> {
  const mapa = new Map<string, { id: string; nome: string; etapa: number }>()
  const unicos = [...new Set(idsEtapas)]
  if (unicos.length === 0) return mapa

  const { data: etapas, error } = await supabase
    .from('trilha_etapas')
    .select('id, trilha_id, ordem')
    .in('id', unicos)
  if (error) throw error
  if (etapas.length === 0) return mapa

  const { data: trilhas, error: erroTrilhas } = await supabase
    .from('trilhas')
    .select('id, nome')
    .in('id', [...new Set(etapas.map((e) => e.trilha_id))])
  if (erroTrilhas) throw erroTrilhas
  const nomePorTrilha = new Map(trilhas.map((t) => [t.id, t.nome]))

  for (const e of etapas) {
    mapa.set(e.id, { id: e.trilha_id, nome: nomePorTrilha.get(e.trilha_id) ?? 'Trilha', etapa: e.ordem })
  }
  return mapa
}

export type ErroRecorrente = { habilidade: string; erros: number }

/**
 * RF-94: "erros recorrentes por tema" — o schema não tem tema por questão,
 * então usamos a habilidade da atividade como proxy (uma questão errada conta
 * para cada habilidade marcada na atividade que a contém).
 */
export function useErrosRecorrentes(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesAlunos.errosRecorrentes(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<ErroRecorrente[]> => {
      const { data: atribuicoes, error } = await supabase
        .from('atribuicoes')
        .select('id')
        .eq('aluno_id', alunoId!)
      if (error) throw error
      if (atribuicoes.length === 0) return []

      const { data: respostasErradas, error: erroRespostas } = await supabase
        .from('respostas')
        .select('questao_id')
        .in(
          'atribuicao_id',
          atribuicoes.map((a) => a.id),
        )
        .eq('correta', false)
      if (erroRespostas) throw erroRespostas
      if (respostasErradas.length === 0) return []

      const idsQuestoes = [...new Set(respostasErradas.map((r) => r.questao_id))]
      const { data: questoes, error: erroQuestoes } = await supabase
        .from('questoes')
        .select('id, atividade_id')
        .in('id', idsQuestoes)
      if (erroQuestoes) throw erroQuestoes
      const atividadePorQuestao = new Map(questoes.map((q) => [q.id, q.atividade_id]))

      const idsAtividades = [...new Set(questoes.map((q) => q.atividade_id))]
      const { data: atividades, error: erroAtividades } = await supabase
        .from('atividades')
        .select('id, habilidades')
        .in('id', idsAtividades)
      if (erroAtividades) throw erroAtividades
      const habilidadesPorAtividade = new Map(atividades.map((a) => [a.id, a.habilidades]))

      const contagem = new Map<string, number>()
      for (const r of respostasErradas) {
        const atividadeId = atividadePorQuestao.get(r.questao_id)
        const habilidades = atividadeId ? habilidadesPorAtividade.get(atividadeId) ?? [] : []
        for (const h of habilidades) {
          contagem.set(h, (contagem.get(h) ?? 0) + 1)
        }
      }

      return [...contagem.entries()]
        .map(([habilidade, erros]) => ({ habilidade, erros }))
        .sort((a, b) => b.erros - a.erros)
    },
  })
}

/** null = aluno ainda sem conta (RF-22 ainda não usado, ou resetado e não recriado). */
export function useContaDoAluno(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesAlunos.conta(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<ContaAluno | null> => {
      const { data, error } = await supabase
        .from('contas_aluno')
        .select('*')
        .eq('aluno_id', alunoId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * RF-26: data do último reset de acesso, para o menu mostrar o rastro de
 * auditoria. null = nunca resetado.
 */
export function useUltimoReset(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesAlunos.ultimoReset(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('eventos_acesso_aluno')
        .select('criado_em')
        .eq('aluno_id', alunoId!)
        .eq('tipo', 'acesso_resetado')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.criado_em ?? null
    },
  })
}

/**
 * Quais alunos já têm conta, em uma consulta só — a listagem precisa do status
 * de todos de uma vez, e chamar useContaDoAluno por linha viraria N consultas.
 * O RLS já limita `contas_aluno` aos alunos deste professor.
 */
export function useAlunosComConta() {
  return useQuery({
    queryKey: chavesAlunos.comConta,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('contas_aluno').select('aluno_id')
      if (error) throw error
      return new Set(data.map((c) => c.aluno_id))
    },
  })
}

/** RF-22: gera o link de cadastro. Não mexe em conta existente — para isso, ver useResetarAcesso. */
export function useGerarLinkCadastro(alunoId: string) {
  return useMutation({
    mutationFn: () => criarConvite(alunoId),
  })
}

/**
 * RF-25/26: reset de acesso. Desvincula o e-mail atual (apaga contas_aluno)
 * e registra a auditoria, mantendo todo o histórico do aluno intacto (nada
 * em atribuicoes/respostas muda). Sempre termina gerando um novo link de
 * cadastro, mesmo se o aluno nunca teve conta.
 *
 * "Invalida as sessões ativas" (RF-25) é alcançado desligando o acesso na
 * nossa própria camada, não revogando o JWT no Supabase Auth: toda leitura
 * do aluno (painel-aluno-obter, resolverAtribuicao) passa por um lookup em
 * `contas_aluno` por `user_id` — sem essa linha, a sessão antiga continua
 * criptograficamente válida no GoTrue, mas não abre mais nada no produto.
 * (`auth.admin.signOut` não serve aqui: ele exige o JWT da sessão a
 * derrubar, não um user_id — não dá pra "deslogar de fora" por id.)
 */
export function useResetarAcesso(alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{ link: string; eraReset: boolean }> => {
      const { data: contaAtual, error: erroConta } = await supabase
        .from('contas_aluno')
        .select('id, email')
        .eq('aluno_id', alunoId)
        .maybeSingle()
      if (erroConta) throw erroConta

      if (contaAtual) {
        const { error: erroDelete } = await supabase.from('contas_aluno').delete().eq('id', contaAtual.id)
        if (erroDelete) throw erroDelete

        const { error: erroEvento } = await supabase
          .from('eventos_acesso_aluno')
          .insert({ aluno_id: alunoId, tipo: 'acesso_resetado', email_antigo: contaAtual.email })
        if (erroEvento) throw erroEvento
      }

      const link = await criarConvite(alunoId)
      return { link, eraReset: Boolean(contaAtual) }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chavesAlunos.conta(alunoId) })
      qc.invalidateQueries({ queryKey: chavesAlunos.comConta })
      qc.invalidateQueries({ queryKey: chavesAlunos.ultimoReset(alunoId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Saídas do professor quando o login do aluno dá problema — tudo por
// aluno-conta-gerenciar, que precisa de service_role (auth.admin) e por isso
// decide a posse do aluno do lado do servidor.
// ---------------------------------------------------------------------------

async function gerenciarConta(corpo: {
  acao: 'excluir-login' | 'redefinir-senha' | 'excluir-aluno'
  alunoId: string
  senha?: string
}) {
  const { error } = await supabase.functions.invoke('aluno-conta-gerenciar', { body: corpo })
  if (error) throw new Error(await extrairMensagemDeErro(error))
}

/** Apaga o login do aluno (libera o e-mail para um cadastro novo); a ficha fica. */
export function useExcluirLoginDoAluno(alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => gerenciarConta({ acao: 'excluir-login', alunoId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chavesAlunos.conta(alunoId) })
      qc.invalidateQueries({ queryKey: chavesAlunos.comConta })
      qc.invalidateQueries({ queryKey: chavesAlunos.ultimoReset(alunoId) })
    },
  })
}

/** Troca a senha do login do aluno pela que o professor digitou. */
export function useRedefinirSenhaDoAluno(alunoId: string) {
  return useMutation({
    mutationFn: (senha: string) => gerenciarConta({ acao: 'redefinir-senha', alunoId, senha }),
  })
}

/** Apaga o aluno, o login e tudo o que é dele. Irreversível. */
export function useExcluirAluno(alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => gerenciarConta({ acao: 'excluir-aluno', alunoId }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: chavesAlunos.um(alunoId) })
      qc.invalidateQueries({ queryKey: chavesAlunos.todos })
    },
  })
}

/** Copia os dados de `origemId` para outro aluno — ver 0021_copiar_dados_do_aluno.sql. */
export function useCopiarDadosDoAluno(origemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (destinoId: string): Promise<ResumoDaCopia> => {
      const { data, error } = await supabase.rpc('copiar_dados_do_aluno', {
        p_origem: origemId,
        p_destino: destinoId,
      })
      if (error) throw new Error(error.message)
      return data
    },
    // O destino ganhou tarefas, aulas, pagamentos, trilhas… — invalidar tudo
    // é mais simples e mais seguro do que listar cada chave de cada feature.
    onSuccess: () => qc.invalidateQueries(),
  })
}

export type LinkCadastroDoProfessor = {
  registro: LinkCadastro
  /**
   * Link completo, ou null quando este navegador não presenciou a geração —
   * o banco só tem o hash (RNF-09, ver 0019), então nesse caso o modal só
   * pode oferecer gerar um link novo.
   */
  url: string | null
}

/** Link de cadastro do professor (0019) — null se nunca foi gerado ou foi desativado. */
export function useLinkDeCadastro() {
  return useQuery({
    queryKey: chavesAlunos.linkCadastro,
    queryFn: async (): Promise<LinkCadastroDoProfessor | null> => {
      // RLS (prof_owns) já limita à linha do professor logado — e há no
      // máximo uma (unique em professor_id).
      const { data, error } = await supabase.from('links_cadastro').select('*').maybeSingle()
      if (error) throw error
      if (!data) return null

      // O lembrete local pode estar velho (link regerado em outro navegador):
      // só vale se o hash do token guardado bater com o da linha atual.
      const token = tokenLinkCadastroLembrado(data.professor_id)
      const url = token && (await hashDoToken(token)) === data.token_hash ? urlDoLinkCadastro(token) : null
      return { registro: data, url }
    },
  })
}

/**
 * Gera (ou regera) o link de cadastro. Upsert por `professor_id`: regerar
 * troca o token na MESMA linha e o link anterior morre na hora. As datas
 * (24h) não saem daqui — o trigger de 0019 as fixa no servidor.
 */
export function useGerarLinkDeCadastro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      const { token, hash } = await gerarTokenDeAcesso()
      const { error } = await supabase
        .from('links_cadastro')
        .upsert({ professor_id: sessao.user.id, token_hash: hash }, { onConflict: 'professor_id' })
      if (error) throw error

      lembrarTokenLinkCadastro(sessao.user.id, token)
      return urlDoLinkCadastro(token)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAlunos.linkCadastro }),
  })
}

/** Derruba o link na hora (ex.: foi parar num grupo errado) sem gerar outro. */
export function useDesativarLinkDeCadastro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from('links_cadastro').delete().eq('id', linkId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesAlunos.linkCadastro }),
  })
}
