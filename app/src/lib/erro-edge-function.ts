/** Status HTTP de um erro de `supabase.functions.invoke`, quando houver resposta. */
export function statusDoErro(error: unknown): number | null {
  const comContexto = error as { context?: Response }
  return comContexto?.context instanceof Response ? comContexto.context.status : null
}

/** Corpo JSON de uma resposta de erro de `supabase.functions.invoke`, quando houver. */
export async function corpoDoErro(error: unknown): Promise<Record<string, unknown> | null> {
  const comContexto = error as { context?: Response }
  if (!(comContexto?.context instanceof Response)) return null
  try {
    const corpo = await comContexto.context.clone().json()
    return typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>) : null
  } catch {
    return null // corpo não era JSON
  }
}

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
