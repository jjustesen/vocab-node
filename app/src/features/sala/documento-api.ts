import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

import { lerBlocos, paraTexto, type Bloco } from './formato-documento'
import type { DocumentoAula } from '@/types/db'

/**
 * O lado PERSISTENTE do documento da aula — só o professor passa por aqui.
 *
 * A sincronia ao vivo não está neste arquivo: ela sai pelo data channel do
 * LiveKit, como a lousa. O banco vê um gravador só, e o motivo está no
 * cabeçalho de 0014_documento_da_aula.sql — a sala tem uma porta para o aluno
 * SEM CONTA, que não tem sessão de Postgres nenhuma. Os dois editam, um só
 * persiste.
 *
 * Tudo aqui lê e escreve pelo cliente do professor (RLS). Nenhuma Edge
 * Function nova, como no resto da sala.
 */

export const chavesDocumento = {
  daAula: (aulaId: string) => ['documento-aula', aulaId] as const,
}

/** O rascunho salvo desta aula. Null quando a aula ainda não tem documento. */
export function useDocumentoDaAula(aulaId: string | undefined) {
  return useQuery({
    queryKey: chavesDocumento.daAula(aulaId!),
    enabled: Boolean(aulaId),
    // A verdade ao vivo é o data channel, não o servidor. Revalidar ao focar a
    // janela traria uma versão de segundos atrás por cima de quem está
    // digitando — o mesmo cuidado que a anotação do painel já toma.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: async (): Promise<Bloco[] | null> => {
      const { data, error } = await supabase
        .from('documentos_aula')
        .select('blocos')
        .eq('aula_id', aulaId!)
        .maybeSingle()
      if (error) throw error
      return data ? lerBlocos((data as Pick<DocumentoAula, 'blocos'>).blocos) : null
    },
  })
}

/**
 * Grava o documento inteiro. Upsert por `aula_id` para a tela não precisar
 * saber se a linha já existe — a primeira tecla da aula cria, as seguintes
 * atualizam.
 *
 * Quem chama controla o ritmo (debounce em `Documento.tsx`): salvar a cada
 * tecla seria uma escrita por caractere, e o texto de uma aula inteira cabe
 * folgado num único jsonb.
 */
export function useSalvarDocumento(aulaId: string | undefined, alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (blocos: Bloco[]) => {
      if (!aulaId) throw new Error('Sem aula para salvar.')
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      const { error } = await supabase.from('documentos_aula').upsert(
        {
          aula_id: aulaId,
          aluno_id: alunoId,
          professor_id: sessao.user.id,
          blocos,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'aula_id' },
      )
      if (error) throw error
    },
    // Sem invalidar a query: a resposta do servidor é sempre mais velha que o
    // que está na tela, e trazê-la de volta pularia o cursor do professor.
    onSuccess: () => qc.setQueryData(chavesDocumento.daAula(aulaId!), undefined, { updatedAt: 0 }),
  })
}

/**
 * Congela o documento como MATERIAL do aluno — o "isto é o que ficou da aula".
 *
 * É a segunda metade do modelo: `documentos_aula` é o rascunho vivo, e
 * `materiais` é o acervo. A separação é o que permite continuar editando
 * depois da aula sem republicar sem querer, e é também o único caminho pelo
 * qual o texto chega ao aluno — o RLS deste banco serve só ao professor, e o
 * aluno já enxerga materiais por `materiais-aluno-obter`. Congelar reusa uma
 * porta aberta em vez de abrir outra.
 *
 * `aula_id` preenchido é o que amarra o material à data: "o que a gente
 * escreveu na terça" vira uma pergunta com resposta.
 */
export function useCongelarDocumento(alunoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ blocos, aulaId, nome }: { blocos: Bloco[]; aulaId: string; nome: string }) => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) throw new Error('Sessão expirada. Entre novamente.')

      // Duas escritas desde 0016: o material entra no acervo, e o vínculo diz
      // quem o recebeu. Antes era uma linha só porque o material pertencia a
      // um aluno — hoje ele é do professor.
      const { data: material, error } = await supabase
        .from('materiais')
        .insert({
          professor_id: sessao.user.id,
          aula_id: aulaId,
          tipo: 'texto',
          nome,
          texto: paraTexto(blocos),
        })
        .select('id')
        .single()
      if (error) throw error

      const { error: erroVinculo } = await supabase
        .from('materiais_alunos')
        .insert({ material_id: material.id, aluno_id: alunoId })
      if (erroVinculo) throw erroVinculo
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materiais'] }),
  })
}
