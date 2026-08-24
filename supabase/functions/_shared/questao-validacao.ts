// Espelha app/src/types/questao.ts (questaoSchema) — Deno não compartilha
// módulo com o Vite sem workspace. Mudou de um lado, muda do outro.
import { z } from 'npm:zod@^3.23.0'

export const TIPOS_QUESTAO = [
  'multipla_escolha',
  'lacuna',
  'ordenar_palavras',
  'ligar_colunas',
  'verdadeiro_falso',
  'pronuncia',
  'ordenar_audio',
] as const

export function palavrasDaFrase(frase: string): string[] {
  return frase.trim().split(/\s+/).filter(Boolean)
}

/** Toda palavra da frase tem ficha em `opcoes`, contando repetição. */
function opcoesCobremAFrase(opcoes: string[], frase: string): boolean {
  const restante = opcoes.map((o) => o.trim().toLowerCase())
  return palavrasDaFrase(frase).every((palavra) => {
    const i = restante.indexOf(palavra.trim().toLowerCase())
    if (i === -1) return false
    restante.splice(i, 1)
    return true
  })
}

/** Quantas fichas a mais, além das palavras da frase, o exercício aceita. */
export const MAXIMO_DISTRATORAS = 3

/**
 * Enxuga as fichas de `ordenar_palavras`/`ordenar_audio`: mantém uma ficha por
 * palavra da frase e no máximo três distratoras DISTINTAS.
 *
 * Existe porque a IA ignora o pedido de "2 a 3 distratoras" com frequência e
 * devolve quinze fichas, várias repetindo palavras que a frase já usa. Ficha
 * repetida não é distratora: é ruído que transforma montar a frase em caça ao
 * tesouro, e some com a pista que a distratora deveria dar.
 *
 * Enxugar em vez de rejeitar é de propósito — a questão em si costuma estar
 * boa, e descartá-la custaria uma questão a menos para o professor.
 */
export function enxugarFichas(opcoes: string[], frase: string): string[] {
  const palavras = palavrasDaFrase(frase)
  const chave = (p: string) => p.trim().toLowerCase()

  // Tira do monte uma ficha para cada palavra da frase; o que sobra é extra.
  const restante = [...opcoes]
  for (const palavra of palavras) {
    const i = restante.findIndex((o) => chave(o) === chave(palavra))
    if (i !== -1) restante.splice(i, 1)
  }

  const daFrase = new Set(palavras.map(chave))
  const vistas = new Set<string>()
  const distratoras: string[] = []
  // Extra que repete palavra da frase não distrai ninguém — descartada antes.
  for (const extra of restante) {
    if (daFrase.has(chave(extra)) || vistas.has(chave(extra))) continue
    vistas.add(chave(extra))
    distratoras.push(extra)
    if (distratoras.length === MAXIMO_DISTRATORAS) break
  }

  // Se nada sobrou de útil, devolve o que veio: `ordenar_audio` exige ao menos
  // uma ficha a mais, e ficar sem nenhuma reprovaria a questão inteira.
  if (distratoras.length === 0) return opcoes

  // Embaralhar aqui não é enfeite: devolver as palavras na ordem da frase
  // entregaria a resposta a quem lesse as fichas da esquerda para a direita.
  const fichas = [...palavras, ...distratoras]
  for (let i = fichas.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[fichas[i], fichas[j]] = [fichas[j], fichas[i]]
  }
  return fichas
}

export const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
export const HABILIDADES = ['leitura', 'escrita', 'listening', 'fala', 'vocabulario', 'gramatica'] as const
export const MARCADOR_LACUNA = '______'

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
  .refine((q) => q.tipo !== 'multipla_escolha' || q.opcoes.includes(q.resposta_correta), {
    message: 'resposta_correta precisa ser idêntica a uma das opcoes',
  })
  .refine((q) => q.tipo !== 'ligar_colunas' || q.pares.length >= 3, {
    message: 'ligar_colunas precisa de ao menos 3 pares',
  })
  .refine((q) => q.tipo !== 'lacuna' || q.enunciado.includes(MARCADOR_LACUNA), {
    message: `lacuna precisa do marcador ${MARCADOR_LACUNA} no enunciado`,
  })
  // Desde 13/08/2026 a lacuna é ESCOLHA, não digitação: sem alternativas o
  // aluno não teria como responder.
  .refine((q) => q.tipo !== 'lacuna' || q.opcoes.length >= 3, {
    message: 'lacuna precisa de ao menos 3 alternativas em opcoes',
  })
  .refine((q) => q.tipo !== 'lacuna' || q.opcoes.includes(q.resposta_correta), {
    message: 'resposta_correta da lacuna precisa ser idêntica a uma das opcoes',
  })
  .refine((q) => q.tipo !== 'pronuncia' || q.resposta_correta.trim().length > 0, {
    message: 'pronuncia precisa da frase-alvo em resposta_correta',
  })
  .refine((q) => q.tipo !== 'ordenar_audio' || opcoesCobremAFrase(q.opcoes, q.resposta_correta), {
    message: 'ordenar_audio precisa de uma ficha em opcoes para cada palavra da frase',
  })
  .refine(
    (q) => q.tipo !== 'ordenar_audio' || q.opcoes.length > palavrasDaFrase(q.resposta_correta).length,
    { message: 'ordenar_audio precisa de ao menos uma palavra distratora além das da frase' },
  )

/** Só a forma de topo — cada questão é validada individualmente depois, para poder descartar sem tudo falhar. */
export const atividadeBrutaSchema = z.object({
  titulo: z.string().min(1),
  nivel: z.enum(NIVEIS),
  habilidades: z.array(z.string()),
  questoes: z.array(z.unknown()),
})

export type Questao = z.infer<typeof questaoSchema>
