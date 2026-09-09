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
  daTurma: (turmaId: string) => ['sala', 'turma', turmaId] as const,
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

/** A sala da turma. Mesma tabela, `turma_id` no lugar de `aluno_id` (0015). */
export function useSalaDaTurma(turmaId: string | undefined) {
  return useQuery({
    queryKey: chavesSala.daTurma(turmaId!),
    enabled: Boolean(turmaId),
    queryFn: async (): Promise<Sala | null> => {
      const { data, error } = await supabase.from('salas').select('*').eq('turma_id', turmaId!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Mesma regra do 1:1: trocar o link é apagar e recriar, para o link velho morrer de fato. */
export function useCriarSalaDaTurma(turmaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      const { token, hash } = await gerarTokenDeAcesso()
      await supabase.from('salas').delete().eq('turma_id', turmaId)
      const { error } = await supabase
        .from('salas')
        .insert({ turma_id: turmaId, professor_id: sessao.user.id, token_hash: hash, token })
      if (error) throw error

      return linkDaSala(token)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesSala.daTurma(turmaId) }),
  })
}

/**
 * A porta de turma pode responder "quem é você?" em vez de um acesso. Não é
 * erro: é o estado normal de quem abriu o link sem sessão (ver 0015).
 */
export type PrecisaIdentificar = { precisaIdentificar: true; turmaNome: string }

export function pedeIdentificacao(d: AcessoSala | PrecisaIdentificar): d is PrecisaIdentificar {
  return 'precisaIdentificar' in d
}

export type AcessoSala = {
  url: string
  token: string
  papel: 'professor' | 'aluno'
  /**
   * Identidade ESTÁVEL de quem entrou — `prof-<id>` ou `aluno-<id>`.
   *
   * Substitui o `papel` como identidade dentro da sala, e é a peça que torna
   * a turma possível: com dois valores só ('professor'/'aluno'), três alunos
   * dividiriam a mesma camada de anotação, a mesma trava de bloco no documento
   * e a mesma identidade no LiveKit — que derruba quem repete.
   */
  participanteId: string
  nomeExibido: string
  professorNome: string
  /** O que está do outro lado: um aluno (1:1) ou uma turma. */
  contexto:
    | { tipo: 'aluno'; alunoId: string; alunoNome: string }
    | { tipo: 'turma'; turmaId: string; turmaNome: string }
}

/**
 * Como esta aba se identifica para `sala-entrar`. Cada porta da função
 * (ver o cabeçalho dela) vira uma rota aqui — e cada uma fala pelo cliente
 * certo: o do professor e o do aluno têm sessões separadas no mesmo navegador
 * (`lib/supabase-aluno.ts`), então escolher o cliente errado entraria na sala
 * com a identidade errada.
 */
export type ModoDeEntrada =
  | { modo: 'professor'; alunoId: string }
  | { modo: 'professor-turma'; turmaId: string }
  | { modo: 'aluno-logado' }
  /**
   * O aluno com conta entrando na sala de uma TURMA dele, pelo painel — o
   * espelho de `professor-turma`. O `turmaId` aqui é endereço, não identidade:
   * quem diz que ele é aluno daquela turma é o JWT, conferido em `sala-entrar`.
   */
  | { modo: 'aluno-logado-turma'; turmaId: string }
  /**
   * `nome`/`email` só existem na sala de TURMA: ali o token é endereço e não
   * identidade, então quem chega precisa dizer quem é. Na sala 1:1 eles vêm
   * vazios e nem são pedidos — o token já identifica a pessoa (ver 0015).
   */
  | { modo: 'convidado'; token: string; nome?: string; email?: string }

export function useAcessoSala(entrada: ModoDeEntrada) {
  const chave =
    entrada.modo === 'professor'
      ? entrada.alunoId
      : entrada.modo === 'professor-turma' || entrada.modo === 'aluno-logado-turma'
        ? entrada.turmaId
        : entrada.modo === 'convidado'
          ? `${entrada.token}:${entrada.email ?? ''}`
          : 'eu'
  return useQuery({
    queryKey: chavesSala.acesso(`${entrada.modo}:${chave}`),
    // O token do LiveKit vale 4h e a conexão se sustenta sozinha depois de
    // aberta; revalidar ao focar a janela só trocaria o token debaixo de uma
    // chamada em andamento.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<AcessoSala | PrecisaIdentificar> => {
      // O cliente é a identidade: professor e aluno têm sessões separadas no
      // mesmo navegador, e `aluno-logado-turma` manda o MESMO corpo que
      // `professor-turma` — é só o JWT que diz de que lado da sala a pessoa
      // entra. Falar pelo cliente errado aqui entraria como a pessoa errada.
      const cliente =
        entrada.modo === 'aluno-logado' || entrada.modo === 'aluno-logado-turma'
          ? supabaseAluno
          : supabase
      const corpo =
        entrada.modo === 'professor'
          ? { alunoId: entrada.alunoId }
          : entrada.modo === 'professor-turma' || entrada.modo === 'aluno-logado-turma'
            ? { turmaId: entrada.turmaId }
            : entrada.modo === 'convidado'
              ? { token: entrada.token, nome: entrada.nome, email: entrada.email }
              : {}

      const { data, error } = await cliente.functions.invoke('sala-entrar', { body: corpo })
      if (error) throw new Error(await extrairMensagemDeErro(error))
      return data as AcessoSala | PrecisaIdentificar
    },
  })
}
