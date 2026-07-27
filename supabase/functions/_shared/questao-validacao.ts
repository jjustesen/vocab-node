// Espelha app/src/types/questao.ts (questaoSchema) — Deno não compartilha
// módulo com o Vite sem workspace. Mudou de um lado, muda do outro.
import { z } from 'npm:zod@^3.23.0'

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
