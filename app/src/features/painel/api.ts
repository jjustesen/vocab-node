import { useQuery } from '@tanstack/react-query'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { NivelCefr } from '@/types/db'

export type TarefaPendente = {
  atribuicaoId: string
  titulo: string
  nivel: NivelCefr
  totalQuestoes: number
  prazo: string | null
}

export type TarefaConcluida = {
  atribuicaoId: string
  titulo: string
  nivel: NivelCefr
  acertos: number
  total: number
  concluidaEm: string
}

export type EtapaDaTrilha = {
  ordem: number
  titulo: string
  nivel: NivelCefr
  totalQuestoes: number
  /** null se a atribuição sumiu (aluno removido da trilha, por exemplo). */
  atribuicaoId: string | null
  concluidaEm: string | null
  acertos: number | null
  total: number | null
}

export type TrilhaDoAluno = {
  id: string
  nome: string
  nivel: NivelCefr
  descricao: string | null
  status: 'ativa' | 'pausada' | 'concluida'
  etapas: EtapaDaTrilha[]
  concluidas: number
}

export type PainelAluno = {
  alunoNome: string
  professorNome: string
  /** As etapas destas trilhas NÃO se repetem em `pendentes`/`concluidas`. */
  trilhas: TrilhaDoAluno[]
  pendentes: TarefaPendente[]
  concluidas: TarefaConcluida[]
}

/** RF-28 — o painel não lê tabela nenhuma direto, tudo vem de painel-aluno-obter (JWT do aluno). */
export function usePainelAluno() {
  return useQuery({
    queryKey: ['painel-aluno'],
    queryFn: async (): Promise<PainelAluno> => {
      const { data, error } = await supabaseAluno.functions.invoke('painel-aluno-obter', { body: {} })
      if (error) throw new Error(await extrairMensagemDeErro(error))
      return data as PainelAluno
    },
  })
}
