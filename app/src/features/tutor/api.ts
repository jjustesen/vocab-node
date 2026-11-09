import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { chavesAlunos } from '@/features/alunos/api'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { NivelCefr, TutorAcesso, TutorLicao, TutorSessao } from '@/types/db'
import type { Fala } from '../../../../poc-tutor/src/falas.ts'
import type { Roteiro } from '../../../../poc-tutor/src/tipos.ts'
import { validarRoteiro } from '../../../../poc-tutor/src/validacao.ts'

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
  /** Para quais turmas cada lição foi liberada. */
  turmasDasLicoes: ['tutor', 'turmas-das-licoes'] as const,
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
      const { data, error } = await supabase.functions.invoke('tutor-gerar-licao', { body: pedido, region: FunctionRegion.SaEast1 })
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
  const { data, error } = await supabase.functions.invoke('tutor-gravar-falas', { body: { licaoId, falas }, region: FunctionRegion.SaEast1 })
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

/** licao_id → turmas para as quais a lição foi liberada (0029). */
export function useTurmasDasLicoes() {
  return useQuery({
    queryKey: chavesTutor.turmasDasLicoes,
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      const { data, error } = await supabase
        .from('turmas_conteudos')
        .select('turma_id, licao_tutor_id')
        .not('licao_tutor_id', 'is', null)
      if (error) throw error
      const mapa = new Map<string, Set<string>>()
      for (const v of data) {
        if (!v.licao_tutor_id) continue
        if (!mapa.has(v.licao_tutor_id)) mapa.set(v.licao_tutor_id, new Set())
        mapa.get(v.licao_tutor_id)!.add(v.turma_id)
      }
      return mapa
    },
  })
}

/** Publica a lição do professor que ainda é rascunho: liberar é o que publica. */
async function publicarSeRascunho(licao: { id: string; publicada: boolean; professor_id: string | null }) {
  if (licao.publicada || !licao.professor_id) return
  // O editor confere ao salvar, mas rascunho pode ser salvo com problema: a aula quebraria no aluno.
  const { data, error: erroLeitura } = await supabase.from('tutor_licoes').select('titulo, roteiro').eq('id', licao.id).single()
  if (erroLeitura) throw erroLeitura
  if (validarRoteiro(data.roteiro as Roteiro).length > 0) {
    throw new Error(`"${data.titulo}" ainda tem problemas que quebrariam a aula. Corrija no editor antes de liberar.`)
  }
  const { error } = await supabase.from('tutor_licoes').update({ publicada: true }).eq('id', licao.id)
  if (error) throw error
}

export type Liberacao = {
  licao: { id: string; publicada: boolean; professor_id: string | null }
  /** Como estava ao abrir o seletor. */
  antes: { turmaIds: string[]; alunoIds: string[] }
  /** Como deve ficar: as turmas escolhidas e TODOS os alunos que ficam com a lição (pela turma ou avulsos). */
  depois: { turmaIds: string[]; alunoIds: string[] }
}

/**
 * O "Liberar" da lição: deixa as turmas e os alunos dela iguais ao que o
 * professor escolheu no seletor. Quem foi desmarcado perde a lição; a turma
 * desmarcada deixa de passá-la a quem entrar. Devolve quem recebeu agora.
 *
 * `alunos.tutor_ativo` acompanha sozinho (trigger 0029), e liberar para a
 * turma entrega aos membros no banco.
 */
export function useLiberarLicao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ licao, antes, depois }: Liberacao): Promise<string[]> => {
      await publicarSeRascunho(licao)

      const turmasQueSaem = antes.turmaIds.filter((t) => !depois.turmaIds.includes(t))
      const turmasQueEntram = depois.turmaIds.filter((t) => !antes.turmaIds.includes(t))
      const alunosQueSaem = antes.alunoIds.filter((a) => !depois.alunoIds.includes(a))
      const novos = depois.alunoIds.filter((a) => !antes.alunoIds.includes(a))

      if (turmasQueSaem.length > 0) {
        const { error } = await supabase
          .from('turmas_conteudos')
          .delete()
          .eq('licao_tutor_id', licao.id)
          .in('turma_id', turmasQueSaem)
        if (error) throw new Error(mensagemDoTrigger(error))
      }
      if (alunosQueSaem.length > 0) {
        const { error } = await supabase
          .from('tutor_licoes_alunos')
          .delete()
          .eq('licao_id', licao.id)
          .in('aluno_id', alunosQueSaem)
        if (error) throw new Error(mensagemDoTrigger(error))
      }
      if (turmasQueEntram.length > 0) {
        const { error } = await supabase.from('turmas_conteudos').upsert(
          turmasQueEntram.map((turma_id) => ({
            turma_id,
            trilha_id: null,
            atividade_id: null,
            material_id: null,
            licao_tutor_id: licao.id,
          })),
          { onConflict: 'turma_id,licao_tutor_id', ignoreDuplicates: true },
        )
        if (error) throw new Error(mensagemDoTrigger(error))
      }
      if (novos.length > 0) {
        const { error } = await supabase
          .from('tutor_licoes_alunos')
          .upsert(novos.map((aluno_id) => ({ aluno_id, licao_id: licao.id })), { ignoreDuplicates: true })
        if (error) throw new Error(mensagemDoTrigger(error))
      }
      return novos
    },
    onSettled: () => invalidarLiberacoes(qc),
  })
}

/** A ficha do aluno: libera várias lições para ele de uma vez. */
export function useLiberarParaAluno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      alunoId,
      licoes,
    }: {
      alunoId: string
      licoes: { id: string; publicada: boolean; professor_id: string | null }[]
    }) => {
      for (const l of licoes) await publicarSeRascunho(l)
      const { error } = await supabase
        .from('tutor_licoes_alunos')
        .upsert(licoes.map((l) => ({ aluno_id: alunoId, licao_id: l.id })), { ignoreDuplicates: true })
      if (error) throw new Error(mensagemDoTrigger(error))
    },
    onSettled: () => invalidarLiberacoes(qc),
  })
}

/** Tira uma lição de um aluno (a que ele recebeu avulsa, não pela turma). */
export function useTirarLicaoDoAluno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ alunoId, licaoId }: { alunoId: string; licaoId: string }) => {
      const { error } = await supabase.from('tutor_licoes_alunos').delete().eq('aluno_id', alunoId).eq('licao_id', licaoId)
      if (error) throw new Error(mensagemDoTrigger(error))
    },
    onSettled: () => invalidarLiberacoes(qc),
  })
}

/** Liberar mexe nas lições (publicada), nas liberações, nas turmas e no `tutor_ativo` dos alunos. */
function invalidarLiberacoes(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: chavesTutor.todos })
  qc.invalidateQueries({ queryKey: chavesAlunos.todos })
  qc.invalidateQueries({ queryKey: ['turmas'] })
}

function mensagemDoTrigger(error: { message: string }): string {
  if (error.message.includes('tutor_nao_liberado')) return 'O tutor ainda não foi liberado para a sua conta.'
  return 'Não consegui liberar. Verifique sua internet e tente de novo.'
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
