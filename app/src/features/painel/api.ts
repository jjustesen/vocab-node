import { useQuery } from '@tanstack/react-query'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { extrairMensagemDeErro, statusDoErro } from '@/lib/erro-edge-function'
import type { MaterialTipo, NivelCefr } from '@/types/db'

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

// ---------------------------------------------------------------------------
// RF-52 pelo lado do aluno: o material que o professor guardou para ele.
// Mesma regra do resto do painel — nada de select direto, tudo por Edge
// Function (materiais-aluno-obter), porque RLS não tem policy para o aluno.
// ---------------------------------------------------------------------------

export type MaterialDoAluno = {
  id: string
  tipo: MaterialTipo
  nome: string
  texto: string | null
  temArquivo: boolean
  criadoEm: string
}

export function useMateriaisAluno() {
  return useQuery({
    queryKey: ['materiais-aluno'],
    queryFn: async (): Promise<MaterialDoAluno[]> => {
      const { data, error } = await supabaseAluno.functions.invoke('materiais-aluno-obter', { body: {} })
      if (error) throw new Error(await extrairMensagemDeErro(error))
      return (data as { materiais: MaterialDoAluno[] }).materiais
    },
  })
}

/**
 * URL assinada de um arquivo, gerada no clique — ela expira, e assinar a lista
 * inteira na renderização gastaria requisição em link que ninguém abre. Mesmo
 * raciocínio da aba do professor (features/materiais/AbaMateriais.tsx).
 */
export async function urlDoMaterialDoAluno(materialId: string): Promise<string> {
  const { data, error } = await supabaseAluno.functions.invoke('materiais-aluno-obter', {
    body: { materialId },
  })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return (data as { url: string }).url
}

// ---------------------------------------------------------------------------
// As salas de vídeo deste aluno (0012/0015).
//
// Uma LISTA, e não uma sala: com turmas, o mesmo aluno pode ter a sala
// individual dele e uma sala por turma. Enquanto o painel abria "a" sala
// direto, quem só estava em turma batia num 404 na aba "Aula ao vivo".
// ---------------------------------------------------------------------------

export type SalaDoAluno =
  | { tipo: 'aluno'; nome: string }
  | { tipo: 'turma'; turmaId: string; nome: string }

export function useSalasDoAluno() {
  return useQuery({
    queryKey: ['salas-do-aluno'],
    // Uma sala pode ser criada pelo professor no minuto anterior à aula — e a
    // pessoa costuma estar com a aba aberta esperando. Revalidar ao focar é o
    // que faz o botão aparecer sem ela precisar recarregar a página.
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SalaDoAluno[]> => {
      const { data, error } = await supabaseAluno.functions.invoke('salas-do-aluno', { body: {} })
      if (error) {
        const mensagem = await extrairMensagemDeErro(error)
        if (statusDoErro(error) === 404) throw new ContaNaoEDeAluno(mensagem)
        throw new Error(mensagem)
      }
      return (data as { salas: SalaDoAluno[] }).salas
    },
    retry: (falhas, erro) => !(erro instanceof ContaNaoEDeAluno) && falhas < 3,
  })
}
