import { useQuery } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { NivelCefr, ResumoTutor } from '@/types/db'
import type { Conexao } from '../../../../poc-tutor/web/conexao.ts'
import type { Roteiro } from '../../../../poc-tutor/src/tipos.ts'

/**
 * O tutor pelo lado do aluno. Como o resto do painel, nada é lido do banco
 * direto: tudo passa pela função `tutor-aluno`, com o JWT do aluno — e é ela
 * que confere se o tutor está ligado, se a lição foi liberada e o limite do mês.
 */

export type LicaoDoAluno = {
  id: string
  titulo: string
  descricao: string | null
  nivel: NivelCefr | null
  /** A prática mais recente desta lição; null = nunca praticou. */
  ultima: { em: string; concluida: boolean; resumo: ResumoTutor | null } | null
}

export type LicoesDoAluno = { licoes: LicaoDoAluno[]; limite: number; restantes: number }

export type LicaoAberta = {
  licao: { id: string; titulo: string; nivel: NivelCefr | null }
  roteiro: Roteiro
  falasGravadas: string[]
  urlFalas: string
  opcoes: { vozNatural: boolean; escutaAutomatica: boolean }
  restantes: number
}

async function chamarTutor<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAluno.functions.invoke('tutor-aluno', { body: corpo, region: FunctionRegion.SaEast1 })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return data as T
}

export const chavesTutorAluno = {
  licoes: ['tutor-aluno', 'licoes'] as const,
  licao: (id: string) => ['tutor-aluno', 'licao', id] as const,
}

export function useLicoesDoAluno() {
  return useQuery({
    queryKey: chavesTutorAluno.licoes,
    queryFn: () => chamarTutor<LicoesDoAluno>({ acao: 'licoes' }),
    retry: 1,
  })
}

export function useLicaoAberta(licaoId: string | undefined) {
  return useQuery({
    queryKey: chavesTutorAluno.licao(licaoId!),
    enabled: Boolean(licaoId),
    queryFn: () => chamarTutor<LicaoAberta>({ acao: 'licao', licaoId }),
    // O roteiro não muda no meio de uma aula; refazer a busca ao voltar para a
    // aba remontaria a tela.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/** Abre a sessão no servidor — é ela que conta no limite do mês. */
export async function iniciarSessao(licaoId: string): Promise<{ sessaoId: string; restantes: number }> {
  return chamarTutor({ acao: 'iniciar', licaoId })
}

export async function concluirSessao(sessaoId: string, resumo: ResumoTutor): Promise<void> {
  await chamarTutor({ acao: 'concluir', sessaoId, resumo })
}

/**
 * A conexão da tela da aula (poc-tutor/web/conexao.ts) para o aluno logado:
 * a mesma função, o token dele e a sessão aberta em cada chamada. Os turnos e
 * a voz vão por `fetch` (a voz chega em stream), não por `functions.invoke`.
 */
export function conexaoDoAluno(sessaoAtual: () => string | null): Conexao {
  return {
    url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tutor-aluno`,
    cabecalhos: async () => {
      const { data } = await supabaseAluno.auth.getSession()
      return {
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      }
    },
    corpo: () => ({ sessaoId: sessaoAtual() }),
  }
}
