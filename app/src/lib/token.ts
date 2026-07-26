/**
 * Token de link (RNF-09: não sequencial, não indexável, ≥128 bits) —
 * compartilhado entre o link de tarefa (`atribuicoes.token_hash`) e o link
 * de cadastro/reset de acesso (`convites_aluno.token_hash`).
 *
 * Gerado no NAVEGADOR DO PROFESSOR, nunca no banco — o professor autenticado
 * grava só o hash (RLS permite, ele é dono do aluno e da atividade). O token
 * cru só existe dentro do link copiado/enviado; quem recebe o link apresenta
 * o token às Edge Functions, que comparam por hash.
 */

function paraBase64Url(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', dados)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 20 bytes = 160 bits de entropia — acima do mínimo de 128 exigido. */
export async function gerarTokenDeAcesso(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const token = paraBase64Url(bytes)
  const hash = await sha256Hex(token)
  return { token, hash }
}

export async function hashDoToken(token: string): Promise<string> {
  return sha256Hex(token)
}
