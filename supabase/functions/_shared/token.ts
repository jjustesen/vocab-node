/** Espelha app/src/lib/token.ts do lado servidor (Deno tem WebCrypto nativo). */
export async function hashDoToken(token: string): Promise<string> {
  const dados = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', dados)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Gerador do lado servidor — mesma espec do navegador (20 bytes, base64url).
 * Usado quando a atribuição nasce numa Edge Function (link aberto): o aluno
 * está logado e acessa por `atribuicao_id`, então o token cru nem precisa
 * voltar na resposta — mas `atribuicoes.token_hash` é not null unique.
 */
export async function gerarTokenDeAcesso(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  const token = btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { token, hash: await hashDoToken(token) }
}
