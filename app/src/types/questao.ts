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
  'pronuncia',
  'ordenar_audio',
] as const

/**
 * Nota mínima para uma leitura em voz alta contar como acerto no placar.
 *
 * 70 é um corte de produto, não uma medida: o público é lição de casa, e a
 * régua tem que premiar quem foi compreensível, não quem tem sotaque nativo.
 * Vive aqui porque o servidor precisa do MESMO número ao derivar
 * `respostas.correta` (espelhado em _shared/correcao.ts).
 */
export const CORTE_PRONUNCIA = 70

/**
 * `pronuncia` é o único tipo que o navegador não consegue corrigir sozinho:
 * a nota sai de uma chamada à IA, com chave de API, do lado do servidor.
 * Todo lugar que hoje assume correção local (CONTRATO-QUESTOES.md §7) precisa
 * checar isto antes de chamar `corrigir()`.
 */
export function correcaoEhLocal(tipo: string): boolean {
  return tipo !== 'pronuncia'
}

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
  pronuncia: 'pronúncia',
  ordenar_audio: 'ouvir e ordenar',
}

/** Cor da etiqueta de tipo, usada na revisão e na ficha da atividade. */
export const CORES_TIPO: Record<(typeof TIPOS_QUESTAO)[number], string> = {
  multipla_escolha: 'bg-violet-100 text-violet-700',
  lacuna: 'bg-sky-100 text-sky-700',
  ordenar_palavras: 'bg-amber-100 text-amber-700',
  ligar_colunas: 'bg-emerald-100 text-emerald-700',
  verdadeiro_falso: 'bg-pink-100 text-pink-700',
  resposta_curta: 'bg-neutral-100 text-neutral-700',
  pronuncia: 'bg-rose-100 text-rose-700',
  ordenar_audio: 'bg-indigo-100 text-indigo-700',
}

/** Quebra a frase em palavras — a unidade que o aluno arrasta em `opcoes`. */
export function palavrasDaFrase(frase: string): string[] {
  return frase.trim().split(/\s+/).filter(Boolean)
}

/**
 * Toda palavra da frase existe em `opcoes`, contando repetição ("the" duas
 * vezes na frase precisa de duas fichas). Sem isto o exercício fica insolúvel
 * e o aluno leva a culpa por um erro da geração.
 */
function opcoesCobremAFrase(opcoes: string[], frase: string): boolean {
  const restante = opcoes.map(normalizar)
  return palavrasDaFrase(frase).every((palavra) => {
    const i = restante.indexOf(normalizar(palavra))
    if (i === -1) return false
    restante.splice(i, 1)
    return true
  })
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
  // A frase que o aluno lê em voz alta mora em resposta_correta (o enunciado é
  // a instrução em pt-BR, como em ordenar_palavras). Sem ela não há o que ler
  // nem contra o que pontuar.
  .refine((q) => q.tipo !== 'pronuncia' || q.resposta_correta.trim().length > 0, {
    message: 'pronuncia precisa da frase-alvo em resposta_correta',
  })
  .refine((q) => q.tipo !== 'ordenar_audio' || opcoesCobremAFrase(q.opcoes, q.resposta_correta), {
    message: 'ordenar_audio precisa de uma ficha em opcoes para cada palavra da frase',
  })
  // A exigência do produto: sempre sobra palavra. Sem distratora o exercício
  // vira "use todas as fichas", e o aluno acerta pela contagem em vez de pelo
  // que ouviu. Vale só para ordenar_audio — ordenar_palavras segue como estava.
  .refine(
    (q) => q.tipo !== 'ordenar_audio' || q.opcoes.length > palavrasDaFrase(q.resposta_correta).length,
    { message: 'ordenar_audio precisa de ao menos uma palavra distratora além das da frase' },
  )

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
  // `pronuncia` não passa por aqui: a nota vem da Edge Function `tarefa-pronuncia`
  // e chega pronta. Devolver `false` calado esconderia a chamada errada, então
  // ela é ruidosa — quem chamar deve ter checado `correcaoEhLocal()` antes.
  if (questao.tipo === 'pronuncia') {
    throw new Error('pronuncia é corrigida no servidor — cheque correcaoEhLocal() antes de chamar corrigir()')
  }

  if (questao.tipo === 'multipla_escolha' || questao.tipo === 'verdadeiro_falso') {
    return resposta === questao.resposta_correta
  }

  // `ordenar_audio` cai na comparação de frase normalizada lá embaixo, igual a
  // `ordenar_palavras`: o que muda é a origem do estímulo (áudio em vez de
  // texto) e as fichas a mais, nada na regra de acerto.

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
