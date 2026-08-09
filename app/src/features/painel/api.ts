import { useQuery } from '@tanstack/react-query'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { extrairMensagemDeErro, statusDoErro } from '@/lib/erro-edge-function'
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
/**
 * Login válido no Supabase Auth, mas sem linha em `contas_aluno` — quase
 * sempre um PROFESSOR que entrou pela porta do aluno. Os dois logins falam com
 * o mesmo GoTrue, então a senha confere; quem separa os perfis é o produto,
 * não o provedor de auth.
 */
export class ContaNaoEDeAluno extends Error {}

export function usePainelAluno() {
  return useQuery({
    queryKey: ['painel-aluno'],
    queryFn: async (): Promise<PainelAluno> => {
      const { data, error } = await supabaseAluno.functions.invoke('painel-aluno-obter', { body: {} })
      if (error) {
        const mensagem = await extrairMensagemDeErro(error)
        // 404 aqui é identidade, não indisponibilidade: a função achou a
        // sessão e não achou o aluno. Sem essa distinção o professor logado
        // ficava preso numa tela de erro genérica, sem saber que errou a porta.
        if (statusDoErro(error) === 404) throw new ContaNaoEDeAluno(mensagem)
        throw new Error(mensagem)
      }
      return data as PainelAluno
    },
    // Reautenticar não conserta identidade errada — só gastaria 3 chamadas.
    retry: (falhas, erro) => !(erro instanceof ContaNaoEDeAluno) && falhas < 3,
  })
}
