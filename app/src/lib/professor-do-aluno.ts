/**
 * O professor que o aluno escolheu no painel, quando o login dele tem mais de
 * um (docs/TUTOR-TRILHAS.md §6.1). Vai em toda chamada do aluno no cabeçalho
 * `x-professor` (supabase/functions/_shared/conta-aluno.ts). Sem escolha, o
 * servidor usa a conta mais antiga — o mesmo de antes para quem tem um só.
 */

const CHAVE = 'aluno:professor'

export function professorEscolhido(): string | null {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

export function escolherProfessor(id: string) {
  try {
    localStorage.setItem(CHAVE, id)
  } catch {
    /* sem armazenamento: vale a conta mais antiga */
  }
}

export function cabecalhoDoProfessor(): Record<string, string> {
  const id = professorEscolhido()
  return id ? { 'x-professor': id } : {}
}
