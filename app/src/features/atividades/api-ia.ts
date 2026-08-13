import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { corpoDoErro, extrairMensagemDeErro } from '@/lib/erro-edge-function'
import { pdfParaPaginas, type PaginaMaterial } from '@/lib/arquivo'
import type { Questao } from '@/types/questao'
import type { NivelCefr } from '@/types/db'

export type MaterialGeracaoIA =
  | { tipo: 'texto'; conteudo: string }
  | { tipo: 'imagem' | 'pdf'; conteudo: string; mimeType: string }
  | { tipo: 'paginas'; paginas: PaginaMaterial[] }

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
async function invocar(parametros: ParametrosGeracaoIA, material: MaterialGeracaoIA) {
  return await supabase.functions.invoke('gerar-atividade', {
    body: {
      material,
      nivel: parametros.nivel,
      quantidade: parametros.quantidade,
      habilidades: parametros.habilidades,
      foco: parametros.foco,
      erros_recorrentes: parametros.errosRecorrentes,
    },
  })
}

export async function gerarAtividadeIA(parametros: ParametrosGeracaoIA): Promise<AtividadeGeradaIA> {
  const { data, error } = await invocar(parametros, parametros.material)
  if (!error) return data as AtividadeGeradaIA

  // O Gemini caiu e o provedor de fallback não lê PDF: a função pede as
  // páginas rasterizadas. Só o navegador consegue renderizar o PDF, então a
  // conversão acontece aqui e a chamada é refeita.
  const corpo = await corpoDoErro(error)
  if (corpo?.converter_paginas === true && parametros.material.tipo === 'pdf') {
    const { paginas } = await pdfParaPaginas(parametros.material.conteudo)
    const retentativa = await invocar(parametros, { tipo: 'paginas', paginas })
    if (!retentativa.error) return retentativa.data as AtividadeGeradaIA
    throw new Error(await extrairMensagemDeErro(retentativa.error))
  }

  throw new Error(await extrairMensagemDeErro(error))
}

export function useGerarAtividadeIA() {
  return useMutation({ mutationFn: gerarAtividadeIA })
}
