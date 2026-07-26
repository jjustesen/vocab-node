/**
 * Interface única do provedor de IA (docs/PROMPT-GERACAO.md §7). O adaptador
 * só traduz para a API do fornecedor e devolve uso — trocar de provedor, ou
 * rodar dois em paralelo para comparar qualidade e custo, vira um arquivo
 * novo, não uma refatoração.
 */
export type ParametrosGeracao = {
  nivel: string
  quantidade: number
  habilidades: string[]
  foco?: string
  errosRecorrentes?: string
}

/**
 * `conteudo` é sempre base64 (o corpo da requisição é JSON — sem Uint8Array
 * na prática). Para 'texto', `conteudo` é o texto puro, sem base64.
 */
export type MaterialGeracao =
  | { tipo: 'texto'; conteudo: string }
  | { tipo: 'imagem' | 'pdf'; conteudo: string; mimeType: string }

export type UsoIA = {
  tokensEntrada: number
  tokensSaida: number
  custoUsd: number
  modelo: string
}

export interface ProvedorIA {
  gerarAtividade(input: {
    material: MaterialGeracao
    parametros: ParametrosGeracao
    /** Enunciados já aceitos nesta mesma atividade — só usado na chamada de complemento. */
    questoesJaAceitas?: string[]
  }): Promise<{
    dados: unknown // validado pelo chamador (questao-validacao.ts), não pelo adaptador
    uso: UsoIA
  }>
}
