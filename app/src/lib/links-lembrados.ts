/**
 * Lembrete local dos tokens de tarefa, para o professor reconseguir um link já
 * enviado sem invalidá-lo.
 *
 * O banco guarda só o sha256 (RNF-09) — o token cru existe apenas dentro do
 * link. Então não há como "buscar o link de novo": ou ele foi guardado no
 * momento do envio, ou a única saída é emitir um token novo (e derrubar o
 * anterior). Este módulo cobre o primeiro caso.
 *
 * Deliberadamente best-effort: vale só neste navegador. Em outro dispositivo,
 * aba anônima ou depois de limpar dados, não há nada aqui — quem chama precisa
 * tratar a ausência, nunca assumir que o link existe.
 */

const CHAVE = 'vocab-node:tokens-tarefa'
/** Teto para o mapa não crescer sem fim ao longo de meses de uso. */
const MAXIMO = 500

type Mapa = Record<string, string>

function ler(): Mapa {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return {}
    const dados: unknown = JSON.parse(cru)
    return dados && typeof dados === 'object' && !Array.isArray(dados) ? (dados as Mapa) : {}
  } catch {
    // localStorage bloqueado (modo privado, política do navegador) ou conteúdo
    // corrompido: seguir sem lembrete é degradação aceitável, quebrar não é.
    return {}
  }
}

function gravar(mapa: Mapa): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(mapa))
  } catch {
    /* sem espaço ou sem permissão — o botão apenas cai no "gerar novo link" */
  }
}

export function lembrarToken(atribuicaoId: string, token: string): void {
  const mapa = ler()
  // Regravar move a chave para o fim: as entradas ficam em ordem de uso, que é
  // o que torna o corte abaixo previsível (sai o mais antigo).
  delete mapa[atribuicaoId]
  mapa[atribuicaoId] = token

  const chaves = Object.keys(mapa)
  if (chaves.length > MAXIMO) {
    for (const antiga of chaves.slice(0, chaves.length - MAXIMO)) delete mapa[antiga]
  }
  gravar(mapa)
}

/** Link completo, ou null se este navegador não presenciou o envio. */
export function linkLembrado(atribuicaoId: string): string | null {
  const token = ler()[atribuicaoId]
  // Montado com a origem atual de propósito: um link guardado antes da troca de
  // domínio continua válido, só precisa apontar para o endereço de hoje.
  return token ? `${window.location.origin}/t/${token}` : null
}
