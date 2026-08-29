import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import { gerarTokenDeAcesso } from '@/lib/token'
import type { Sala } from '@/types/db'

/**
 * O link é montado com a origem ATUAL, nunca guardado pronto: assim um link
 * criado antes de uma troca de domínio continua apontando para o endereço de
 * hoje — mesmo princípio dos outros links do app.
 */
export function linkDaSala(token: string): string {
  return `${window.location.origin}/s/${token}`
}

export const chavesSala = {
  doAluno: (alunoId: string) => ['sala', 'aluno', alunoId] as const,
  acesso: (chave: string) => ['sala', 'acesso', chave] as const,
}

/** A linha em `salas`, lida pelo professor via RLS. Null quando ainda não existe. */
export function useSala(alunoId: string | undefined) {
  return useQuery({
    queryKey: chavesSala.doAluno(alunoId!),
    enabled: Boolean(alunoId),
    queryFn: async (): Promise<Sala | null> => {
      const { data, error } = await supabase.from('salas').select('*').eq('aluno_id', alunoId!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * Cria a sala — ou troca o link de uma que já existe.
 *
 * Troca é apagar e recriar, não atualizar o `token_hash`: o nome da sala no
 * LiveKit deriva do `id` da linha (ver _shared/livekit.ts), então recriar
 * garante que quem ficou com o link antigo não caia numa conversa em
 * andamento. `salas.aluno_id` é unique, então a ordem importa.
 *
 * O token cru vai para o banco junto com o hash (0013): este link é usado toda
 * semana e precisa poder ser reexibido em qualquer navegador — ver o cabeçalho
 * daquela migration para o porquê de esta sala abrir exceção à RNF-09.
 */
export function useCriarSala(alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      const { token, hash } = await gerarTokenDeAcesso()
      await supabase.from('salas').delete().eq('aluno_id', alunoId)
      const { error } = await supabase
        .from('salas')
        .insert({ aluno_id: alunoId, professor_id: sessao.user.id, token_hash: hash, token })
      if (error) throw error

      return linkDaSala(token)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesSala.doAluno(alunoId) }),
  })
}

export type AcessoSala = {
  url: string
  token: string
  papel: 'professor' | 'aluno'
  nomeExibido: string
  professorNome: string
  alunoNome: string
}

/**
 * Como esta aba se identifica para `sala-entrar`. As três portas da função
 * (ver o cabeçalho dela) viram três rotas aqui — e cada uma fala pelo cliente
 * certo: o do professor e o do aluno têm sessões separadas no mesmo navegador
 * (`lib/supabase-aluno.ts`), então escolher o cliente errado entraria na sala
 * com a identidade errada.
 */
export type ModoDeEntrada =
  | { modo: 'professor'; alunoId: string }
  | { modo: 'aluno-logado' }
  | { modo: 'convidado'; token: string }

export function useAcessoSala(entrada: ModoDeEntrada) {
  const chave = entrada.modo === 'professor' ? entrada.alunoId : entrada.modo === 'convidado' ? entrada.token : 'eu'
  return useQuery({
    queryKey: chavesSala.acesso(`${entrada.modo}:${chave}`),
    // O token do LiveKit vale 4h e a conexão se sustenta sozinha depois de
    // aberta; revalidar ao focar a janela só trocaria o token debaixo de uma
    // chamada em andamento.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<AcessoSala> => {
      const cliente = entrada.modo === 'aluno-logado' ? supabaseAluno : supabase
      const corpo =
        entrada.modo === 'professor'
          ? { alunoId: entrada.alunoId }
          : entrada.modo === 'convidado'
            ? { token: entrada.token }
            : {}

      const { data, error } = await cliente.functions.invoke('sala-entrar', { body: corpo })
      if (error) throw new Error(await extrairMensagemDeErro(error))
      return data as AcessoSala
    },
  })
}
