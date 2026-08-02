import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { Questao } from '@/types/questao'
import type { NivelCefr } from '@/types/db'

export type MaterialGeracaoIA =
  | { tipo: 'texto'; conteudo: string }
  | { tipo: 'imagem' | 'pdf'; conteudo: string; mimeType: string }

export type ParametrosGeracaoIA = {
  material: MaterialGeracaoIA
  nivel: NivelCefr
  quantidade: number
  habilidades: string[]
  foco?: string
  errosRecorrentes?: string
}

export type AtividadeGeradaIA = {
  titulo: string
  nivel: NivelCefr
  habilidades: string[]
  questoes: Questao[]
  descartadas: number
}

/**
 * Chama a Edge Function gerar-atividade — roda no servidor (a chave do
 * Gemini nunca sai dele). Diferente de tarefa-*, esta função verifica o JWT:
 * `supabase.functions.invoke` já manda o Authorization do professor logado.
 */
export async function gerarAtividadeIA(parametros: ParametrosGeracaoIA): Promise<AtividadeGeradaIA> {
  const { data, error } = await supabase.functions.invoke('gerar-atividade', {
    body: {
      material: parametros.material,
      nivel: parametros.nivel,
      quantidade: parametros.quantidade,
      habilidades: parametros.habilidades,
      foco: parametros.foco,
      erros_recorrentes: parametros.errosRecorrentes,
    },
  })
  if (error) {
    const mensagem = await extrairMensagemDeErro(error)
    throw new Error(mensagem)
  }
  return data as AtividadeGeradaIA
}

export function useGerarAtividadeIA() {
  return useMutation({ mutationFn: gerarAtividadeIA })
}
