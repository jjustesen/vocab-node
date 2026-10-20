import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chavesAlunos } from '@/features/alunos/api'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { Aluno, NivelCefr, TutorAcesso, TutorLicao, TutorSessao } from '@/types/db'
import type { Fala } from '../../../../poc-tutor/src/falas.ts'
import type { Roteiro } from '../../../../poc-tutor/src/tipos.ts'

/**
 * O lado do professor do tutor oral (migration 0024).
 *
 * Tudo aqui é leitura e escrita direta no banco pelo RLS do professor; o aluno
 * fala só com a função `tutor-aluno`.
 */

export const chavesTutor = {
  todos: ['tutor'] as const,
  acesso: ['tutor', 'acesso'] as const,
  licoes: ['tutor', 'licoes'] as const,
  /** Todas as lições que o professor vê na página Tutor: as dele (até rascunho) e as da biblioteca. */
  todasAsLicoes: ['tutor', 'licoes', 'todas'] as const,
  licao: (id: string) => ['tutor', 'licoes', 'uma', id] as const,
  /** Todas as liberações do professor, para contar lições por aluno. */
  liberacoes: ['tutor', 'liberacoes'] as const,
  sessoesDoMes: ['tutor', 'sessoes', 'mes'] as const,
  sessoesDoAluno: (alunoId: string) => ['tutor', 'sessoes', 'aluno', alunoId] as const,
}

/**
 * A linha do beta, ou `null` para quem não foi liberado. Erro também vira
 * `null`: antes da migration a tabela nem existe, e o tutor só não aparece —
 * a tela de Configurações não pode quebrar por isso.
 */
export function useAcessoTutor() {
  return useQuery({
    queryKey: chavesTutor.acesso,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TutorAcesso | null> => {
      const { data, error } = await supabase.from('tutor_acesso').select('*').maybeSingle()
      if (error) return null
      return data
    },
  })
}

export type LicaoDaBiblioteca = {
  id: string
  titulo: string
  descricao: string | null
  nivel_cefr: NivelCefr | null
  /** null = da biblioteca; o id do professor = dele. */
  professor_id: string | null
}

/** As lições que podem ir para um aluno: publicadas, da biblioteca ou do professor. */
export function useLicoesTutor() {
  return useQuery({
    queryKey: chavesTutor.licoes,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LicaoDaBiblioteca[]> => {
      const { data, error } = await supabase
        .from('tutor_licoes')
        .select('id, titulo, descricao, nivel_cefr, professor_id')
        .eq('publicada', true)
        .order('professor_id', { nullsFirst: false })
        .order('ordem')
        .order('titulo')
      if (error) throw error
      return data
    },
  })
}

export type LicaoNaLista = Pick<
  TutorLicao,
  'id' | 'titulo' | 'descricao' | 'nivel_cefr' | 'publicada' | 'professor_id' | 'falas_gravadas' | 'gerada_por_ia' | 'atualizado_em'
>

/** A aba Lições: as do professor (com rascunhos) e as da biblioteca. Sem o roteiro — ele é pesado. */
export function useTodasAsLicoes() {
  return useQuery({
    queryKey: chavesTutor.todasAsLicoes,
    queryFn: async (): Promise<LicaoNaLista[]> => {
      const { data, error } = await supabase
        .from('tutor_licoes')
        .select('id, titulo, descricao, nivel_cefr, publicada, professor_id, falas_gravadas, gerada_por_ia, atualizado_em')
        .order('atualizado_em', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type LicaoCompleta = Omit<TutorLicao, 'roteiro'> & { roteiro: Roteiro }

export function useLicao(id: string | undefined) {
  return useQuery({
    queryKey: chavesTutor.licao(id!),
    enabled: Boolean(id),
    // O editor guarda o rascunho em estado local: buscar de novo ao voltar à aba apagaria o que não foi salvo.
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<LicaoCompleta> => {
      const { data, error } = await supabase.from('tutor_licoes').select('*').eq('id', id!).single()
      if (error) throw error
      return data as LicaoCompleta
    },
  })
}

/** Grava a lição inteira: o roteiro é uma coluna jsonb só (RLS: só a lição do próprio professor). */
export function useSalvarLicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (l: { id: string; roteiro: Roteiro; nivel: NivelCefr | null; publicada: boolean }) => {
      const roteiro = { ...l.roteiro, id: l.id }
      const { data, error } = await supabase
        .from('tutor_licoes')
        .update({ roteiro, titulo: roteiro.titulo, descricao: roteiro.abertura, nivel_cefr: l.nivel, publicada: l.publicada })
        .eq('id', l.id)
        .select('*')
        .single()
      if (error) throw error
      return data as LicaoCompleta
    },
    onSuccess: (licao) => {
      qc.setQueryData(chavesTutor.licao(licao.id), licao)
      qc.invalidateQueries({ queryKey: chavesTutor.licoes })
    },
  })
}

/**
 * Uma lição da biblioteca não se edita (é de todos os professores): para
 * adaptar, o professor faz uma cópia dele. Os áudios vêm junto — o nome do
 * arquivo é o texto da fala, então a cópia toca os mesmos até alguém mudar a frase.
 */
export function useCopiarLicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (licao: LicaoCompleta): Promise<string> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')
      const id = crypto.randomUUID()
      const titulo = `${licao.titulo} (cópia)`
      const { error } = await supabase.from('tutor_licoes').insert({
        id,
        professor_id: sessao.user.id,
        titulo,
        descricao: licao.descricao,
        nivel_cefr: licao.nivel_cefr,
        roteiro: { ...licao.roteiro, id, titulo },
        falas_gravadas: licao.falas_gravadas,
        ordem: licao.ordem,
        publicada: false,
      })
      if (error) throw error
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTutor.licoes }),
  })
}

export function useExcluirLicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tutor_licoes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chavesTutor.licoes })
      qc.invalidateQueries({ queryKey: chavesTutor.liberacoes })
    },
  })
}

export type MaterialDaLicao =
  | { tipo: 'texto'; conteudo: string }
  | { tipo: 'imagem' | 'pdf'; conteudo: string; mimeType: string }

/** A IA monta a lição a partir do material e ela nasce como rascunho do professor (tutor-gerar-licao). */
export function useGerarLicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pedido: { material: MaterialDaLicao; nivel: NivelCefr; titulo?: string }): Promise<string> => {
      const { data, error } = await supabase.functions.invoke('tutor-gerar-licao', { body: pedido })
      if (error) throw new Error(await extrairMensagemDeErro(error))
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesTutor.licoes }),
  })
}

export type ResultadoDaGravacao = {
  gravadas: string[]
  jaExistiam: string[]
  falharam: { chave: string; erro: string }[]
  limiteDoTts: boolean
}

/** Uma leva de falas fixas virando MP3 no bucket (tutor-gravar-falas, no máximo 6 por vez). */
export async function gravarFalas(licaoId: string, falas: Fala[]): Promise<ResultadoDaGravacao> {
  const { data, error } = await supabase.functions.invoke('tutor-gravar-falas', { body: { licaoId, falas } })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return data as ResultadoDaGravacao
}

/** Onde as falas gravadas moram — o mesmo endereço que `tutor-aluno` dá à página do aluno. */
export const URL_DAS_FALAS = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/tutor-falas/`

/** aluno_id → ids das lições liberadas para ele. */
export function useLiberacoesTutor() {
  return useQuery({
    queryKey: chavesTutor.liberacoes,
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      const { data, error } = await supabase.from('tutor_licoes_alunos').select('aluno_id, licao_id')
      if (error) throw error
      const mapa = new Map<string, Set<string>>()
      for (const l of data) {
        if (!mapa.has(l.aluno_id)) mapa.set(l.aluno_id, new Set())
        mapa.get(l.aluno_id)!.add(l.licao_id)
      }
      return mapa
    },
  })
}

/** Libera ou tira uma lição de um aluno. Otimista, como a chave do tutor. */
export function useAlternarLicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ alunoId, licaoId, liberada }: { alunoId: string; licaoId: string; liberada: boolean }) => {
      const { error } = liberada
        ? await supabase.from('tutor_licoes_alunos').upsert({ aluno_id: alunoId, licao_id: licaoId })
        : await supabase.from('tutor_licoes_alunos').delete().eq('aluno_id', alunoId).eq('licao_id', licaoId)
      if (error) throw error
    },
    onMutate: async ({ alunoId, licaoId, liberada }) => {
      await qc.cancelQueries({ queryKey: chavesTutor.liberacoes })
      const anterior = qc.getQueryData<Map<string, Set<string>>>(chavesTutor.liberacoes)
      if (anterior) {
        const novo = new Map(anterior)
        const doAluno = new Set(novo.get(alunoId) ?? [])
        if (liberada) doAluno.add(licaoId)
        else doAluno.delete(licaoId)
        novo.set(alunoId, doAluno)
        qc.setQueryData(chavesTutor.liberacoes, novo)
      }
      return { anterior }
    },
    onError: (_erro, _variaveis, contexto) => {
      if (contexto?.anterior) qc.setQueryData(chavesTutor.liberacoes, contexto.anterior)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chavesTutor.liberacoes }),
  })
}

/**
 * Liga ou desliga o tutor de um aluno. Otimista na lista e na ficha; quem
 * segura o limite é o trigger `conferir_tutor_do_aluno`, e a recusa dele volta
 * aqui como mensagem para a tela.
 */
export function useAlternarTutor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ alunoId, ligado }: { alunoId: string; ligado: boolean }) => {
      const { error } = await supabase.from('alunos').update({ tutor_ativo: ligado }).eq('id', alunoId)
      if (error) throw new Error(mensagemDoTrigger(error))
    },
    onMutate: async ({ alunoId, ligado }) => {
      await qc.cancelQueries({ queryKey: chavesAlunos.todos })
      const lista = qc.getQueryData<Aluno[]>(chavesAlunos.lista('ativo'))
      const um = qc.getQueryData<Aluno>(chavesAlunos.um(alunoId))
      if (lista) {
        qc.setQueryData<Aluno[]>(
          chavesAlunos.lista('ativo'),
          lista.map((a) => (a.id === alunoId ? { ...a, tutor_ativo: ligado } : a)),
        )
      }
      if (um) qc.setQueryData<Aluno>(chavesAlunos.um(alunoId), { ...um, tutor_ativo: ligado })
      return { lista, um }
    },
    onError: (_erro, { alunoId }, contexto) => {
      if (contexto?.lista) qc.setQueryData(chavesAlunos.lista('ativo'), contexto.lista)
      if (contexto?.um) qc.setQueryData(chavesAlunos.um(alunoId), contexto.um)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chavesAlunos.todos }),
  })
}

function mensagemDoTrigger(error: { message: string; details?: string | null }): string {
  if (error.message.includes('limite_tutor')) {
    const max = Number(error.details)
    return max
      ? `No beta, o tutor vale para até ${max} ${max === 1 ? 'aluno' : 'alunos'}. Desligue de outro aluno para ligar deste.`
      : 'Você chegou ao limite de alunos com tutor do beta.'
  }
  if (error.message.includes('tutor_nao_liberado')) return 'O tutor ainda não foi liberado para a sua conta.'
  return 'Não consegui salvar. Verifique sua internet e tente de novo.'
}

export type SessaoTutor = Pick<
  TutorSessao,
  'id' | 'aluno_id' | 'teste' | 'licao_id' | 'iniciada_em' | 'concluida_em' | 'resumo' | 'custo_usd'
>

const COLUNAS_SESSAO = 'id, aluno_id, teste, licao_id, iniciada_em, concluida_em, resumo, custo_usd'

/** As sessões deste mês (mês do Brasil, como na função): dos alunos e os testes do professor (`teste`). */
export function useSessoesDoMes() {
  return useQuery({
    queryKey: chavesTutor.sessoesDoMes,
    queryFn: async (): Promise<SessaoTutor[]> => {
      const { data, error } = await supabase
        .from('tutor_sessoes')
        .select(COLUNAS_SESSAO)
        .gte('iniciada_em', inicioDoMesNoBrasil())
        .order('iniciada_em', { ascending: false })
      if (error) throw error
      return data.map((s) => ({ ...s, custo_usd: Number(s.custo_usd) }))
    },
  })
}

export function useSessoesDoAluno(alunoId: string) {
  return useQuery({
    queryKey: chavesTutor.sessoesDoAluno(alunoId),
    queryFn: async (): Promise<SessaoTutor[]> => {
      const { data, error } = await supabase
        .from('tutor_sessoes')
        .select(COLUNAS_SESSAO)
        .eq('aluno_id', alunoId)
        .order('iniciada_em', { ascending: false })
        .limit(30)
      if (error) throw error
      return data.map((s) => ({ ...s, custo_usd: Number(s.custo_usd) }))
    },
  })
}

/** Espelho de `inicioDoMesNoBrasil` em supabase/functions/tutor-aluno — o limite conta o mesmo mês. */
export function inicioDoMesNoBrasil(): string {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date())
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value
  return new Date(`${parte('year')}-${parte('month')}-01T00:00:00-03:00`).toISOString()
}

/**
 * Cotação para mostrar o custo em reais. Estimativa: o Gemini e o Jev cobram
 * em dólar, e o valor exato está no faturamento de cada um.
 */
const REAIS_POR_DOLAR = 5.5

export function emReais(usd: number): string {
  return (usd * REAIS_POR_DOLAR).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarCusto(usd: number): string {
  return `${emReais(usd)} (US$ ${usd.toFixed(2)})`
}
