/**
 * Contrato das questões — a fonte é docs/CONTRATO-QUESTOES.md.
 *
 * Formato PLANO de propósito: os provedores de IA aceitam só um subconjunto do
 * JSON Schema em saída estruturada, e `oneOf` costuma faltar. A validação forte
 * mora aqui, no Zod, onde temos controle total.
 */
import { z } from 'zod'

export const TIPOS_QUESTAO = [
  'multipla_escolha',
  'lacuna',
  'ordenar_palavras',
  'ligar_colunas',
  'verdadeiro_falso',
  'resposta_curta',
] as const

export const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
export const HABILIDADES = ['leitura', 'escrita', 'listening', 'vocabulario', 'gramatica'] as const

/** Marcador de lacuna: seis underscores. O app procura exatamente isto. */
export const MARCADOR_LACUNA = '______'

export const ROTULO_HABILIDADE: Record<(typeof HABILIDADES)[number], string> = {
  leitura: 'Leitura',
  escrita: 'Escrita',
  listening: 'Listening',
  vocabulario: 'Vocabulário',
  gramatica: 'Gramática',
}

export const ROTULO_TIPO: Record<(typeof TIPOS_QUESTAO)[number], string> = {
  multipla_escolha: 'múltipla escolha',
  lacuna: 'completar lacuna',
  ordenar_palavras: 'ordenar palavras',
  ligar_colunas: 'ligar colunas',
  verdadeiro_falso: 'verdadeiro ou falso',
  resposta_curta: 'resposta curta',
}

/** Cor da etiqueta de tipo, usada na revisão e na ficha da atividade. */
export const CORES_TIPO: Record<(typeof TIPOS_QUESTAO)[number], string> = {
  multipla_escolha: 'bg-violet-100 text-violet-700',
  lacuna: 'bg-sky-100 text-sky-700',
  ordenar_palavras: 'bg-amber-100 text-amber-700',
  ligar_colunas: 'bg-emerald-100 text-emerald-700',
  verdadeiro_falso: 'bg-pink-100 text-pink-700',
  resposta_curta: 'bg-neutral-100 text-neutral-700',
}

const parSchema = z.object({
  esquerda: z.string().min(1),
  direita: z.string().min(1),
})

export const questaoSchema = z
  .object({
    tipo: z.enum(TIPOS_QUESTAO),
    enunciado: z.string().min(1),
    opcoes: z.array(z.string()),
    resposta_correta: z.string(),
    respostas_aceitas: z.array(z.string()),
    pares: z.array(parSchema),
    explicacao: z.string().min(1),
  })
  // As três regras que o JSON Schema não expressa — e que a IA erra na prática.
  .refine((q) => q.tipo !== 'multipla_escolha' || q.opcoes.includes(q.resposta_correta), {
    message: 'resposta_correta precisa ser idêntica a uma das opcoes',
  })
  .refine((q) => q.tipo !== 'ligar_colunas' || q.pares.length >= 3, {
    message: 'ligar_colunas precisa de ao menos 3 pares',
  })
  .refine((q) => q.tipo !== 'lacuna' || q.enunciado.includes(MARCADOR_LACUNA), {
    message: `lacuna precisa do marcador ${MARCADOR_LACUNA} no enunciado`,
  })

export const atividadeGeradaSchema = z.object({
  titulo: z.string().min(1),
  nivel: z.enum(NIVEIS),
  habilidades: z.array(z.enum(HABILIDADES)),
  questoes: z.array(questaoSchema).min(1),
})

export type Questao = z.infer<typeof questaoSchema>
export type AtividadeGerada = z.infer<typeof atividadeGeradaSchema>

/** Normalização usada na correção de lacuna, resposta curta e ordenar palavras. */
export function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .replace(/[‘’ʼ]/g, "'") // apóstrofos tipográficos
    .replace(/\s+/g, ' ')
}

/**
 * Esta é a correção que RODA DE VERDADE — no navegador do aluno, na hora,
 * sem esperar o servidor (decisão de produto de 26/07/2026, ver
 * docs/CONTRATO-QUESTOES.md §7). O servidor (supabase/functions/_shared/
 * correcao.ts) mantém uma cópia e recalcula de forma independente antes de
 * persistir — não por precisar da resposta para a UI, mas para não confiar
 * cegamente no que o cliente mandar salvar. Se mudar aqui, mude lá também.
 *
 * Aceita qualquer objeto com esses quatro campos — não só `Questao` — para
 * que o front do aluno (features/tarefa) use direto sem reconstruir o tipo.
 *
 * Para ligar_colunas, `resposta` é um JSON de string[] com a "direita"
 * escolhida para cada item de `questao.pares`, na mesma ordem.
 */
export function corrigir(
  questao: Pick<Questao, 'tipo' | 'resposta_correta' | 'respostas_aceitas' | 'pares'>,
  resposta: string,
): boolean {
  if (questao.tipo === 'multipla_escolha' || questao.tipo === 'verdadeiro_falso') {
    return resposta === questao.resposta_correta
  }

  if (questao.tipo === 'ligar_colunas') {
    if (questao.pares.length === 0) return false
    let escolhas: unknown
    try {
      escolhas = JSON.parse(resposta)
    } catch {
      return false
    }
    if (!Array.isArray(escolhas) || escolhas.length !== questao.pares.length) return false
    return questao.pares.every((par, i) => normalizar(String(escolhas[i] ?? '')) === normalizar(par.direita))
  }

  const alvo = normalizar(resposta)
  return [questao.resposta_correta, ...questao.respostas_aceitas].some(
    (aceita) => normalizar(aceita) === alvo,
  )
}
