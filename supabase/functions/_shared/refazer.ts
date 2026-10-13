/**
 * Refazer os erros depois de concluir (0023): a resposta refeita substitui a
 * errada e a nota sobe; o resultado da primeira vez fica em
 * `correta_na_primeira`.
 *
 * Só se regrava, numa tarefa concluída, uma questão que estava ERRADA e com o
 * pedido explícito (`refazer: true`) — uma questão certa não "piora" por um
 * clique a mais, e um envio atrasado da primeira passada não reabre nada.
 *
 * Devolve `null` quando a tarefa ainda está aberta (fluxo normal), os campos
 * extras a gravar quando o refazer vale, ou a mensagem de recusa.
 */
export async function camposDoRefazer(
  // deno-lint-ignore no-explicit-any
  db: any,
  atribuicao: { id: string; concluida_em: string | null },
  questaoId: string,
  pediuRefazer: unknown,
): Promise<{ ok: true; extras: Record<string, boolean> | null } | { ok: false; erro: string }> {
  if (!atribuicao.concluida_em) return { ok: true, extras: null }
  if (pediuRefazer !== true) return { ok: false, erro: 'Esta atividade já foi concluída.' }

  const { data: anterior } = await db
    .from('respostas')
    .select('correta, correta_na_primeira')
    .eq('atribuicao_id', atribuicao.id)
    .eq('questao_id', questaoId)
    .maybeSingle()

  if (!anterior) return { ok: false, erro: 'Esta questão não foi respondida.' }
  if (anterior.correta) return { ok: false, erro: 'Esta questão já está certa.' }
  return { ok: true, extras: { correta_na_primeira: anterior.correta_na_primeira ?? anterior.correta } }
}
