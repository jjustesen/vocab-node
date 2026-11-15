import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { AssinaturaAluno, CobrancaAluno } from '@/types/db'

/**
 * A venda do tutor do lado do professor (migration 0033, docs/TUTOR-TRILHAS.md
 * §5.1, §5.4): assinantes, repasses e a conta de recebimento. Leitura pelo RLS;
 * ações pela função professor-vendas.
 */

export const chavesVendas = {
  todos: ['vendas'] as const,
  assinantes: ['vendas', 'assinantes'] as const,
  repasses: ['vendas', 'repasses'] as const,
  conta: ['vendas', 'conta'] as const,
}

async function acao<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('professor-vendas', { body: corpo, region: FunctionRegion.SaEast1 })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return data as T
}

export type Assinante = AssinaturaAluno & {
  alunoNome: string
  planoNome: string
  /** Práticas do tutor desde o início do período atual. */
  praticasUsadas: number
}

export function useAssinantes() {
  return useQuery({
    queryKey: chavesVendas.assinantes,
    queryFn: async (): Promise<Assinante[]> => {
      const { data, error } = await supabase
        .from('assinaturas_aluno')
        .select('*, alunos(nome), planos_aluno(nome)')
        .order('criado_em', { ascending: false })
      if (error) throw error
      const linhas = (data ?? []) as unknown as (AssinaturaAluno & { alunos: { nome: string } | null; planos_aluno: { nome: string } | null })[]
      const ativas = linhas.filter((a) => a.status === 'ativa')
      const desde = ativas.map((a) => a.periodo_inicio).sort()[0]
      const { data: sessoes } = desde
        ? await supabase
            .from('tutor_sessoes')
            .select('aluno_id, iniciada_em')
            .eq('teste', false)
            .in('aluno_id', ativas.map((a) => a.aluno_id))
            .gte('iniciada_em', desde)
        : { data: [] }
      return linhas.map(({ alunos, planos_aluno, ...a }) => ({
        ...a,
        alunoNome: alunos?.nome ?? 'Aluno',
        planoNome: planos_aluno?.nome ?? 'Plano',
        praticasUsadas: (sessoes ?? []).filter((s) => s.aluno_id === a.aluno_id && s.iniciada_em >= a.periodo_inicio).length,
      }))
    },
  })
}

export type Repasse = CobrancaAluno & { alunoNome: string }

export function useRepasses() {
  return useQuery({
    queryKey: chavesVendas.repasses,
    queryFn: async (): Promise<Repasse[]> => {
      const { data, error } = await supabase
        .from('cobrancas_aluno')
        .select('*, alunos(nome)')
        .order('periodo_fim', { ascending: false })
        .limit(300)
      if (error) throw error
      return ((data ?? []) as unknown as (CobrancaAluno & { alunos: { nome: string } | null })[]).map(({ alunos, ...c }) => ({
        ...c,
        alunoNome: alunos?.nome ?? 'Aluno',
      }))
    },
  })
}

export type EstadoDaConta = { existe: boolean; pronta: boolean; pendencias?: number }

export function useContaDeRecebimento() {
  return useQuery({
    queryKey: chavesVendas.conta,
    staleTime: 60_000,
    retry: false,
    queryFn: () => acao<EstadoDaConta>({ acao: 'connect_status' }),
  })
}

/** Abre o cadastro (ou o painel) da conta Express no Stripe. */
export function useAbrirStripeConnect() {
  return useMutation({
    mutationFn: (destino: 'cadastro' | 'painel') =>
      acao<{ url: string }>({ acao: destino === 'cadastro' ? 'connect_link' : 'connect_painel' }),
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

export function useContratarPlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { alunoId: string; planoId: string }) => acao<{ assinaturaId: string }>({ acao: 'contratar', ...p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chavesVendas.todos })
      qc.invalidateQueries({ queryKey: ['creditos'] })
    },
  })
}

export function useCancelarContratada() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assinaturaId: string) => acao({ acao: 'cancelar', assinaturaId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesVendas.assinantes }),
  })
}

export function useDarPraticas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { assinaturaId: string; quantidade: number }) => acao({ acao: 'dar_praticas', ...p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesVendas.assinantes }),
  })
}
