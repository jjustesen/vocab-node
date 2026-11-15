import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'

/** "Minha conta" do aluno (docs/TUTOR-TRILHAS.md §6.2), pela função aluno-assinaturas. */

export type AssinaturaDoAluno = {
  id: string
  planoNome: string
  slug: string | null
  professorNome: string
  status: 'ativa' | 'encerrada'
  cancelaNoFim: boolean
  periodoFim: string
  precoCentavos: number
  praticas: number
  praticasUsadas: number | null
  contratadaPeloProfessor: boolean
  encerradaEm: string | null
  motivoEncerramento: 'cancelada' | 'pagamento_recusado' | 'sem_creditos' | 'professor' | null
}

export type PlanoParaExplorar = {
  slug: string
  nome: string
  descricao: string | null
  precoCentavos: number
  praticasMes: number
  professorNome: string
  trilhas: { nome: string; nivel: string }[]
  assinado: boolean
}

export type MinhaConta = {
  nome: string
  email: string
  temCartao: boolean
  assinaturas: AssinaturaDoAluno[]
  explorar: PlanoParaExplorar[]
}

const CHAVE = ['minha-conta'] as const

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAluno.functions.invoke('aluno-assinaturas', { body: corpo, region: FunctionRegion.SaEast1 })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return data as T
}

export function useMinhaConta() {
  return useQuery({ queryKey: CHAVE, queryFn: () => chamar<MinhaConta>({ acao: 'listar' }) })
}

export function useCancelarAssinatura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { assinaturaId: string; motivo: string }) => chamar({ acao: 'cancelar', ...p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useManterAssinatura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assinaturaId: string) => chamar({ acao: 'manter', assinaturaId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useAbrirCartoes() {
  return useMutation({
    mutationFn: () => chamar<{ url: string }>({ acao: 'cartoes' }),
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

/** Senha nova (ou a primeira, para quem entrou pela compra sem conta). */
export function useDefinirSenha() {
  return useMutation({
    mutationFn: async (senha: string) => {
      const { error } = await supabaseAluno.auth.updateUser({ password: senha })
      if (error) throw new Error(error.message.includes('different') ? 'Use uma senha diferente da atual.' : 'Não consegui salvar a senha.')
    },
  })
}
