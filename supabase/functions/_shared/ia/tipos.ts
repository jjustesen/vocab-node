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

export type PaginaMaterial = { conteudo: string; mimeType: string }

/**
 * `conteudo` é sempre base64 (o corpo da requisição é JSON — sem Uint8Array
 * na prática). Para 'texto', `conteudo` é o texto puro, sem base64.
 *
 * 'paginas' é o mesmo PDF já rasterizado pelo navegador (uma imagem por
 * página). Só aparece no reenvio depois de o Gemini falhar: o xAI não lê PDF,
 * então esse é o único formato de material de livro que o fallback aceita.
 */
export type MaterialGeracao =
  | { tipo: 'texto'; conteudo: string }
  | { tipo: 'imagem' | 'pdf'; conteudo: string; mimeType: string }
  | { tipo: 'paginas'; paginas: PaginaMaterial[] }

export type UsoIA = {
  tokensEntrada: number
  tokensSaida: number
  custoUsd: number
  provedor: string
  modelo: string
}

/**
 * Erro de provedor com o suficiente para decidir o que fazer: repetir a mesma
 * chamada (`retentavel`), cair para o outro provedor, ou desistir na hora.
 * `mensagemUsuario` é o único texto que pode chegar ao professor — a mensagem
 * crua do fornecedor fica em `message`, para o log.
 */
export class ErroIA extends Error {
  readonly provedor: string
  readonly status?: number
  readonly retentavel: boolean
  readonly mensagemUsuario: string

  constructor(input: {
    provedor: string
    mensagem: string
    mensagemUsuario: string
    status?: number
    retentavel: boolean
  }) {
    super(input.mensagem)
    this.name = 'ErroIA'
    this.provedor = input.provedor
    this.status = input.status
    this.retentavel = input.retentavel
    this.mensagemUsuario = input.mensagemUsuario
  }
}

/** Fallback para quando o erro não veio de um adaptador (bug, rede, etc.). */
export const MENSAGEM_ERRO_GENERICA = 'Não consegui gerar a atividade agora. Tente novamente em instantes.'

export function mensagemUsuarioDoErro(e: unknown): string {
  return e instanceof ErroIA ? e.mensagemUsuario : MENSAGEM_ERRO_GENERICA
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
