/** Extrai a mensagem `{ erro }` do corpo de uma resposta de erro de `supabase.functions.invoke`. */
export async function extrairMensagemDeErro(error: unknown): Promise<string> {
  const comContexto = error as { context?: Response }
  if (comContexto?.context instanceof Response) {
    try {
      const corpo = await comContexto.context.clone().json()
      if (typeof corpo?.erro === 'string') return corpo.erro
    } catch {
      // corpo não era JSON — segue com a mensagem genérica
    }
  }
  return error instanceof Error ? error.message : 'Falha ao chamar o servidor.'
}
