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
] as const

export const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
export const HABILIDADES = ['leitura', 'escrita', 'listening', 'vocabulario', 'gramatica'] as const
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

/** Só a forma de topo — cada questão é validada individualmente depois, para poder descartar sem tudo falhar. */
export const atividadeBrutaSchema = z.object({
  titulo: z.string().min(1),
  nivel: z.enum(NIVEIS),
  habilidades: z.array(z.string()),
  questoes: z.array(z.unknown()),
})

export type Questao = z.infer<typeof questaoSchema>
