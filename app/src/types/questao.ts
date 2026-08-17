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

/** Normalização da fala: além do `normalizar()`, tira pontuação. */
function normalizarFala(texto: string): string[] {
  return normalizar(texto)
    .replace(/[.,!?;:"()]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

/** Palavras em comum, NA ORDEM (subsequência comum máxima). */
function palavrasEmComum(a: string[], b: string[]): number {
  const tabela: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tabela[i][j] = a[i - 1] === b[j - 1] ? tabela[i - 1][j - 1] + 1 : Math.max(tabela[i - 1][j], tabela[i][j - 1])
    }
  }
  return tabela[a.length][b.length]
}

/**
 * Nota de leitura em voz alta a partir do que o RECONHECEDOR DE FALA do
 * navegador transcreveu (`SpeechRecognition`), comparado com a frase-alvo.
 *
 * O que isto mede, e é importante não confundir: se o motor de reconhecimento
 * ENTENDEU o aluno — não a qualidade fonética dele. O reconhecedor tem um
 * modelo de linguagem que puxa para o inglês plausível, então sotaque
 * carregado passa mais fácil do que passaria com um avaliador de fonema.
 * Trocamos precisão por custo zero e resposta instantânea, de olhos abertos.
 *
 * A média harmônica pune os dois lados: engolir palavra da frase derruba, e
 * despejar palavra que não existe também. Só um dos dois deixaria a nota
 * enganar — "the" sozinho não pode valer 100 numa frase de dez palavras.
 */
export function pontuarPronuncia(
  fraseAlvo: string,
  transcricao: string,
): { pontuacao: number; faltando: string[] } {
  const alvo = normalizarFala(fraseAlvo)
  const dito = normalizarFala(transcricao)
  if (alvo.length === 0 || dito.length === 0) return { pontuacao: 0, faltando: alvo }

  const comuns = palavrasEmComum(alvo, dito)
  const cobertura = comuns / alvo.length
  const precisao = comuns / dito.length
  const pontuacao =
    comuns === 0 ? 0 : Math.round(((2 * cobertura * precisao) / (cobertura + precisao)) * 100)

  // Palavras da frase que não apareceram na transcrição — é o feedback possível
  // sem análise fonética: dizemos QUAIS palavras saíram diferentes, nunca qual
  // som corrigir. Essa é a perda real de não usar um avaliador de pronúncia.
  const restante = [...dito]
  const faltando = normalizarFala(fraseAlvo).filter((palavra, i) => {
    const pos = restante.indexOf(palavra)
    if (pos === -1) return true
    restante.splice(pos, 1)
    void i
    return false
  })

  return { pontuacao, faltando }
}

/**
 * A transcrição quebrada em palavras, cada uma marcada com `bate` — se aquela
 * palavra existe na frase-alvo (contando repetição: dizer "the" três vezes numa
 * frase com um "the" marca só o primeiro).
 *
 * Serve só para MOSTRAR ao aluno onde a leitura saiu diferente, que é o feedback
 * possível sem análise fonética. Não entra em nota nenhuma — por isso vive só
 * aqui e não tem cópia em _shared/correcao.ts.
 */
export function compararFala(fraseAlvo: string, transcricao: string): { palavra: string; bate: boolean }[] {
  const restante = normalizarFala(fraseAlvo)
  // Percorre o texto CRU para devolver ao aluno o que ele falou como falou
  // (maiúscula, apóstrofo), comparando pela forma normalizada.
  return transcricao
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra) => {
      const [normalizada] = normalizarFala(palavra)
      const posicao = normalizada ? restante.indexOf(normalizada) : -1
      if (posicao !== -1) restante.splice(posicao, 1)
      return { palavra, bate: posicao !== -1 }
    })
}

export const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
/**
 * `fala` entrou com o tipo `pronuncia`: sem uma habilidade que a represente, o
 * professor não tem como pedir uma atividade de fala e a IA não tem gancho para
 * escolher o tipo. É `text[]` no banco, então não precisou de migration.
 */
export const HABILIDADES = ['leitura', 'escrita', 'listening', 'fala', 'vocabulario', 'gramatica'] as const

/** Marcador de lacuna: seis underscores. O app procura exatamente isto. */
export const MARCADOR_LACUNA = '______'

/**
 * Comando mostrado quando a questão não traz `instrucao` própria e o enunciado
 * não se deixa dividir — questões criadas antes da migration 0011, na maioria.
 */
export const INSTRUCAO_PADRAO: Partial<Record<(typeof TIPOS_QUESTAO)[number], string>> = {
  multipla_escolha: 'Escolha a opção que completa a frase',
  lacuna: 'Complete a frase',
  verdadeiro_falso: 'A afirmação é verdadeira ou falsa?',
  resposta_curta: 'Responda em inglês',
  ordenar_palavras: 'Coloque as palavras na ordem correta',
  ligar_colunas: 'Ligue cada palavra ao seu par',
  ordenar_audio: 'Ouça e monte a frase na ordem em que foi falada',
  pronuncia: 'Leia a frase em voz alta',
}

/**
 * Tipos cujo `enunciado` JÁ é só a instrução em pt-BR — o conteúdo em inglês
 * mora em outro campo (fichas em `opcoes`, `pares`, ou a frase em
 * `resposta_correta`). Não existe frase-alvo a destacar dentro do enunciado, e
 * tratá-los como se existisse imprimiria a instrução duas vezes.
 */
const TIPOS_SEM_FRASE_ALVO: readonly (typeof TIPOS_QUESTAO)[number][] = [
  'ordenar_palavras',
  'ligar_colunas',
  'ordenar_audio',
  'pronuncia',
]

/**
 * Se o enunciado deste tipo carrega uma frase em inglês para destacar. Decide
 * tanto o bloco de destaque na tela do aluno quanto a existência do campo
 * "Instrução" no editor do professor — por isso vive aqui, e não copiado nos dois.
 */
export function temFraseAlvo(tipo: (typeof TIPOS_QUESTAO)[number]): boolean {
  return !TIPOS_SEM_FRASE_ALVO.includes(tipo)
}

/**
 * Instrução em pt-BR + frase-alvo em inglês, separadas.
 *
 * Caminhos, nesta ordem:
 *  1. tipo sem frase-alvo — tudo vira instrução, `frase` sai vazia;
 *  2. `instrucao` preenchida (questões novas) — usa como está;
 *  3. enunciado no formato "comando: 'frase'" — divide ali. É como a IA
 *     escrevia antes da migration 0011, então cobre o acervo já criado;
 *  4. nada disso — cai no comando padrão do tipo, e o enunciado inteiro vira
 *     a frase. É o caso dos enunciados que já são só a frase, como
 *     "______ eating out tonight?".
 *
 * Nunca esconde texto: o que não vira instrução continua aparecendo como frase.
 */
export function dividirEnunciado(questao: {
  tipo: (typeof TIPOS_QUESTAO)[number]
  instrucao?: string | null
  enunciado: string
}): { instrucao: string; frase: string } {
  const enunciado = questao.enunciado.trim()
  const propria = questao.instrucao?.trim()

  if (TIPOS_SEM_FRASE_ALVO.includes(questao.tipo)) {
    return { instrucao: propria || enunciado || INSTRUCAO_PADRAO[questao.tipo] || '', frase: '' }
  }

  if (propria) return { instrucao: propria, frase: enunciado }

  const legado = dividirEnunciadoLegado(enunciado)
  if (legado) return legado

  return { instrucao: INSTRUCAO_PADRAO[questao.tipo] ?? '', frase: enunciado }
}

/**
 * Verbos com que uma instrução começa. É o que separa
 * "Choose the correct verb phrase: Yesterday, Sarah ______ her luggage"
 * de "He said: I will be there at noon." — os dois têm dois-pontos, e só o
 * primeiro tem comando antes deles. Sem essa lista, partir no dois-pontos
 * cortaria frases legítimas ao meio.
 */
const VERBOS_DE_INSTRUCAO =
  /^(choose|select|complete|fill|match|read|write|rewrite|put|order|answer|decide|mark|circle|underline|listen|look|use|escolha|complete|selecione|ligue|leia|escreva|responda|marque|ordene|coloque|ouça|preencha|indique|reescreva)\b/i

/**
 * Divide o enunciado das questões anteriores à migration 0011, em que a IA
 * escrevia comando e frase juntos. Duas formas, ambas exigindo comando curto:
 *
 *   "Choose the correct option: 'Does Mexican food ______ too spicy?'"
 *   "Choose the correct verb phrase: Yesterday, Sarah ______ her luggage."
 *
 * Devolve `null` quando não reconhece — aí quem chama decide o que fazer.
 */
function dividirEnunciadoLegado(enunciado: string): { instrucao: string; frase: string } | null {
  const comAspas = enunciado.match(/^(.{4,120}?):\s*["'“‘](.+)["'”’]\s*$/s)
  if (comAspas) return { instrucao: comAspas[1].trim(), frase: comAspas[2].trim() }

  const semAspas = enunciado.match(/^(.{4,120}?):\s*(\S.*)$/s)
  if (semAspas && VERBOS_DE_INSTRUCAO.test(semAspas[1].trim())) {
    return { instrucao: semAspas[1].trim(), frase: semAspas[2].trim() }
  }

  return null
}

export const ROTULO_HABILIDADE: Record<(typeof HABILIDADES)[number], string> = {
  leitura: 'Leitura',
  escrita: 'Escrita',
  listening: 'Listening',
  fala: 'Fala',
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
    /** Comando em pt-BR, separado da frase-alvo desde 13/08/2026 (migration 0011). */
    instrucao: z.string().default(''),
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
  // `resposta` aqui é a TRANSCRIÇÃO que o navegador ouviu, não texto digitado.
  // Voltou a caber na correção local como todo o resto (§7) desde que a nota
  // deixou de depender de uma chamada a IA.
  if (questao.tipo === 'pronuncia') {
    return pontuarPronuncia(questao.resposta_correta, resposta).pontuacao >= CORTE_PRONUNCIA
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
