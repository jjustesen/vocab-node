/**
 * Para onde a tela da aula manda o turno do aluno e pede a voz do tutor.
 *
 * A mesma tela (AulaDoTutor.tsx) roda em dois lugares:
 *
 *   laboratório → função `poc-tutor`, com a senha da secret POC_TUTOR_CODIGO
 *   app         → função `tutor-aluno`, com o token do aluno e a sessão aberta
 *
 * O laboratório é o padrão; o app troca com `usarConexao` antes de abrir a aula.
 */
export type Conexao = {
  url: string
  /** Cabeçalhos extras de cada chamada (o `Authorization` do aluno). */
  cabecalhos: () => Promise<Record<string, string>>
  /** Campos que vão em todo corpo (a senha do laboratório, a sessão do aluno). */
  corpo: () => Record<string, unknown>
  /** A função recusou (401/403/…): o laboratório volta à senha; o app mostra o erro. */
  aoRecusar?: (status: number) => void
  /** A função dá token para a transcrição ao vivo (`token_voz`). O laboratório não dá. */
  vozAoVivo?: boolean
}

const CHAVE_CODIGO = 'poc-tutor:codigo'

/**
 * Onde as funções do tutor rodam: na região do banco (São Paulo). Sem isto o
 * Supabase escolhia Frankfurt, e cada consulta da função cruzava o Atlântico —
 * ~0,5 s a mais em cada turno do aluno.
 */
export const REGIAO_DAS_FUNCOES = 'sa-east-1'

/**
 * A senha da POC — a secret POC_TUTOR_CODIGO da função, que NUNCA está no
 * código: a pessoa digita na tela de entrada, a função confere, e a página só
 * a lembra neste navegador para não pedir de novo a cada recarga.
 */
export function codigoDeAcesso(): string | undefined {
  try {
    return localStorage.getItem(CHAVE_CODIGO) ?? undefined
  } catch {
    return undefined
  }
}

export function lembrarSenha(senha: string) {
  try {
    localStorage.setItem(CHAVE_CODIGO, senha)
  } catch {
    /* sem armazenamento: vale até recarregar */
  }
}

export function esquecerSenha() {
  try {
    localStorage.removeItem(CHAVE_CODIGO)
  } catch {
    /* nada a esquecer */
  }
}

export const URL_DO_LABORATORIO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poc-tutor`

const doLaboratorio: Conexao = {
  url: URL_DO_LABORATORIO,
  cabecalhos: async () => ({}),
  corpo: () => ({ codigo: codigoDeAcesso() }),
  aoRecusar: (status) => {
    // A senha mudou desde a última vez: volta para a tela de senha.
    if (status === 403) {
      esquecerSenha()
      location.reload()
    }
  },
}

let atual: Conexao = doLaboratorio

export function usarConexao(c: Conexao) {
  atual = c
}

export function conexao(): Conexao {
  return atual
}

/** Um POST para a função da conexão atual, com os campos de sempre no corpo. */
export async function chamar(corpo: Record<string, unknown>): Promise<Response> {
  const c = atual
  return fetch(c.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-region': REGIAO_DAS_FUNCOES, ...(await c.cabecalhos()) },
    body: JSON.stringify({ ...corpo, ...c.corpo() }),
  })
}
