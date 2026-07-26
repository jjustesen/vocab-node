/** Espelha app/src/lib/token.ts do lado servidor (Deno tem WebCrypto nativo). */
export async function hashDoToken(token: string): Promise<string> {
  const dados = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', dados)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
