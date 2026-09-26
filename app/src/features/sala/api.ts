import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import { gerarTokenDeAcesso } from '@/lib/token'
import type { Sala, SalaEspera } from '@/types/db'

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
  espera: (salaId: string) => ['sala', 'espera', salaId] as const,
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

export function pedeIdentificacao(d: AcessoSala | EmEspera | PrecisaIdentificar): d is PrecisaIdentificar {
  return 'precisaIdentificar' in d
}

export type AcessoSala = {
  url: string
  token: string
  salaId: string
  /**
   * O professor ligou a sala de espera (0018)? Só vem `true` para o PROFESSOR
   * — é ele quem atende a fila. Para o aluno a espera aparece de outro jeito:
   * a resposta chega sem token (ver `EmEspera`).
   */
  salaDeEspera?: boolean
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

/**
 * O aluno está do lado de fora da sala de espera (0018): a resposta tem tudo o
 * que a antessala mostra, mas nenhum token — ele só sai quando o professor
 * admite.
 *
 *   fora     → ainda não pediu para entrar (acabou de abrir a antessala)
 *   pendente → pediu, e o professor ainda não respondeu
 *   recusado → o professor não liberou; pode pedir de novo
 */
export type EmEspera = Omit<AcessoSala, 'url' | 'token' | 'salaDeEspera'> & {
  espera: 'fora' | 'pendente' | 'recusado'
}

export function estaEmEspera(d: AcessoSala | EmEspera | PrecisaIdentificar): d is EmEspera {
  return 'espera' in d
}

/** De quanto em quanto tempo quem espera pergunta "já posso entrar?". */
const INTERVALO_DA_ESPERA_MS = 3000

/**
 * @param aguardando o aluno já clicou em entrar. A partir daí cada consulta o
 *   mantém na fila (e renova o pulso dele); antes disso, abrir a antessala só
 *   consulta — senão bastaria abrir o link para aparecer na fila do professor.
 */
export function useAcessoSala(entrada: ModoDeEntrada, aguardando = false) {
  return useQuery({
    queryKey: chaveDoAcesso(entrada, aguardando),
    // A consulta que troca de chave ao clicar em "pedir para entrar" não pode
    // piscar a tela de carregamento no meio da antessala.
    placeholderData: keepPreviousData,
    // O token do LiveKit vale 4h e a conexão se sustenta sozinha depois de
    // aberta; revalidar ao focar a janela só trocaria o token debaixo de uma
    // chamada em andamento.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: false,
    // Só enquanto está na fila: quando o professor admite, a resposta seguinte
    // já traz o token e a repetição para sozinha.
    refetchInterval: (query) => {
      const d = query.state.data
      return d && estaEmEspera(d) && d.espera === 'pendente' ? INTERVALO_DA_ESPERA_MS : false
    },
    // Aba em segundo plano continua na fila — é justamente o que o aluno faz
    // enquanto espera: vai olhar outra coisa.
    refetchIntervalInBackground: true,
    queryFn: () => chamarSalaEntrar(entrada, aguardando ? 'aguardar' : undefined),
  })
}

function chaveDoAcesso(entrada: ModoDeEntrada, aguardando: boolean) {
  const chave =
    entrada.modo === 'professor'
      ? entrada.alunoId
      : entrada.modo === 'professor-turma' || entrada.modo === 'aluno-logado-turma'
        ? entrada.turmaId
        : entrada.modo === 'convidado'
          ? `${entrada.token}:${entrada.email ?? ''}`
          : 'eu'
  return chavesSala.acesso(`${entrada.modo}:${chave}${aguardando ? ':aguardando' : ''}`)
}

/**
 * O clique em "pedir para entrar" (e em "pedir de novo", depois de uma
 * recusa). É um gesto à parte, e não a consulta repetida, de propósito: a
 * consulta NÃO desfaz uma recusa (ver `portaoDaEspera` em sala-entrar), senão
 * o aluno nem chegaria a ver o "não".
 *
 * A resposta vira o dado da consulta de quem está aguardando, em vez de ser
 * descartada: se o professor admitiu no meio-tempo, ESTA resposta já é o
 * token — e a linha da fila foi consumida para entregá-lo.
 */
export function usePedirEntrada(entrada: ModoDeEntrada) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => chamarSalaEntrar(entrada, 'pedir'),
    onSuccess: (resposta) => qc.setQueryData(chaveDoAcesso(entrada, true), resposta),
  })
}

async function chamarSalaEntrar(
  entrada: ModoDeEntrada,
  espera?: 'aguardar' | 'pedir',
): Promise<AcessoSala | EmEspera | PrecisaIdentificar> {
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

  const { data, error } = await cliente.functions.invoke('sala-entrar', { body: { ...corpo, espera } })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return data as AcessoSala | EmEspera | PrecisaIdentificar
}

// ── a fila, do lado do professor ────────────────────────────────────────────

/**
 * Quanto tempo sem pulso até a pessoa sair da lista. A tela de quem espera
 * renova a cada `INTERVALO_DA_ESPERA_MS`; dez vezes isso dá folga para rede
 * ruim e relógio um pouco torto, e ainda some com quem fechou a aba.
 */
const PULSO_MAXIMO_MS = 30_000

/** Quem está esperando para entrar agora. Só consulta com a espera ligada. */
export function useFilaDeEspera(salaId: string, ligada: boolean) {
  return useQuery({
    queryKey: chavesSala.espera(salaId),
    enabled: ligada,
    refetchInterval: INTERVALO_DA_ESPERA_MS,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<SalaEspera[]> => {
      const { data, error } = await supabase
        .from('sala_espera')
        .select('*')
        .eq('sala_id', salaId)
        .eq('status', 'pendente')
        .gt('visto_em', new Date(Date.now() - PULSO_MAXIMO_MS).toISOString())
        .order('pedido_em')
      if (error) throw error
      return data
    },
  })
}

/**
 * Admitir ou recusar. O professor só marca a linha; quem entrega o token é
 * `sala-entrar`, na próxima consulta de quem espera — o professor nunca
 * assina nada em nome do aluno.
 */
export function useAtenderEspera(salaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      participantes,
      status,
    }: {
      participantes: string[]
      status: 'admitido' | 'recusado'
    }) => {
      const { error } = await supabase
        .from('sala_espera')
        .update({ status })
        .eq('sala_id', salaId)
        .in('participante_id', participantes)
      if (error) throw error
    },
    // Tira da tela na hora: esperar o próximo ciclo deixaria o nome parado lá
    // por três segundos depois do clique, parecendo que o botão não pegou.
    onMutate: ({ participantes }) => {
      qc.setQueryData<SalaEspera[]>(chavesSala.espera(salaId), (fila) =>
        fila?.filter((p) => !participantes.includes(p.participante_id)),
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chavesSala.espera(salaId) }),
  })
}
