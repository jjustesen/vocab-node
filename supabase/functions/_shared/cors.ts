/**
 * CORS liberado — estas funções são chamadas pelo navegador do ALUNO, sem
 * sessão nenhuma (ele não é usuário do Supabase Auth). Não há cookie nem
 * cabeçalho de autorização para restringir; a segurança vem inteira da posse
 * do token, validado por hash dentro de cada função.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function respostaErro(mensagem: string, status = 400): Response {
  return respostaJson({ erro: mensagem }, status)
}
