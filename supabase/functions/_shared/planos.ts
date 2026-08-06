// Espelha app/src/lib/planos.ts e a migration 0008 — mude de um lado, mude
// do outro. `plano` chega como texto (coluna enum lida via postgrest); valor
// desconhecido cai nos limites do gratuito de propósito: melhor barrar cedo
// do que liberar cota por um estado corrompido.

export const LIMITE_ALUNOS: Record<string, number | null> = {
  gratuito: 3,
  pro: 20,
  ilimitado: null, // sem teto
}

export const LIMITE_GERACOES: Record<string, number> = {
  gratuito: 5,
  pro: 30,
  ilimitado: 100,
}

export function limiteAlunos(plano: string): number | null {
  return plano in LIMITE_ALUNOS ? LIMITE_ALUNOS[plano] : LIMITE_ALUNOS.gratuito
}

export function limiteGeracoes(plano: string): number {
  return LIMITE_GERACOES[plano] ?? LIMITE_GERACOES.gratuito
}
