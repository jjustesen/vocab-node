import { memoria } from './controlador.ts'
import type { Avaliacao, Sessao } from './tipos.ts'

/**
 * A ponte entre o controlador e a função `poc-tutor` (supabase/functions):
 * o que vai para o avaliador a cada turno, e como a resposta dele volta a ser
 * uma `Avaliacao`.
 */

/**
 * Tudo o que o avaliador precisa para julgar ESTA resposta — e nada da aula
 * inteira. A memória da sessão (última frase aceita, alvo pendente) é o que
 * permite a ele ver que "It was sunny yesterday" perdeu o rainy.
 */
export function contextoDoTurno(s: Sessao) {
  const t = s.atual
  if (!t) throw new Error('Não há item em andamento.')
  const { item } = t
  return {
    ...memoria(s),
    pedido: {
      tipo: item.tipo,
      solicitacao_em_portugues: item.solicitacao ?? null,
      pista: item.pista ?? null,
      modelo_para_repetir: item.modelo ?? null,
      pergunta: item.pergunta ?? null,
    },
    exemplos_de_resposta: item.exemplos ?? [],
    erros_previstos: item.errosPrevistos ?? [],
    // Escada só existe para o item que a tem, e nunca dentro de outra escada.
    apoio_disponivel: Boolean(item.apoio) && !s.suspenso && t.origem !== 'apoio',
  }
}

/** O que a função devolve (ver supabase/functions/poc-tutor/index.ts). */
export type RespostaDoAvaliador = {
  transcricao: { texto: string; confianca: 'alta' | 'baixa' }
  avaliacao:
    | { tipo: 'audio_incerto' }
    | {
        tipo: 'adequada' | 'erro' | 'falta_prerequisito' | 'duvida' | 'pedido_ajuda' | 'parte_certa'
        habilidade?: string
        problema?: string
        acerto_parcial?: string
        resposta_duvida?: string
        reacao?: string
        ajuda?: string
        pista?: string
      }
  /** Quem decidiu: só o Jev, ou o Gemini (e por quê). */
  decidiuPor?: 'jev' | 'gemini' | 'audio'
  motivoGemini?: string
  /** Tokens gastos no turno, por serviço, para precificar. */
  custos?: { servico: string; entrada: number; saida: number }[]
  tempos?: { transcricaoMs?: number; jevMs?: number; avaliacaoMs?: number }
}

/**
 * O tutor diz "Você acertou <trecho>." — então só serve um trecho curto. Se o
 * avaliador devolver uma frase inteira ou só pontuação, é melhor não dizer nada.
 */
function trechoCurto(v?: string): string | undefined {
  const t = v?.trim().replace(/[.,;:]+$/, '')
  if (!t || !/\p{L}/u.test(t) || t.split(/\s+/).length > 4) return undefined
  return t
}

export function paraAvaliacao(r: RespostaDoAvaliador, s: Sessao): Avaliacao {
  const reconhecido = r.transcricao.texto.trim()
  const a = r.avaliacao
  // Campo vazio do schema do Gemini chega como "" — tratamos como ausente.
  const ou = (v?: string) => (v && v.trim() ? v.trim() : undefined)

  switch (a.tipo) {
    case 'audio_incerto':
      return { tipo: 'audio_incerto', reconhecido: ou(reconhecido) }
    case 'adequada':
      return { tipo: 'adequada', reconhecido, observacao: ou(a.reacao) }
    case 'erro':
      return {
        tipo: 'erro',
        reconhecido,
        habilidade: ou(a.habilidade) ?? s.atual?.item.habilidades[0] ?? 'geral',
        problema: ou(a.problema) ?? 'resposta diferente do pedido',
        acertoParcial: trechoCurto(a.acerto_parcial),
        // Só o Gemini escreve um problema que sirva de pista; o do Jev é "erro em <habilidade>".
        dica: r.decidiuPor === 'gemini' ? ou(a.pista) : undefined,
      }
    case 'falta_prerequisito':
      return { tipo: 'falta_prerequisito', reconhecido, problema: ou(a.problema) ?? 'falta a base' }
    case 'duvida':
      return { tipo: 'duvida', pergunta: reconhecido, resposta: ou(a.resposta_duvida) }
    case 'pedido_ajuda':
      return { tipo: 'pedido_ajuda', ajuda: ou(a.ajuda) }
    case 'parte_certa':
      return { tipo: 'parte_certa', reconhecido }
  }
}
