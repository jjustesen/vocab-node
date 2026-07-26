/**
 * Cor do avatar (as bolinhas com a inicial do aluno). Derivada do id para a
 * mesma pessoa ter sempre a mesma cor em todas as telas — listas ordenadas por
 * posição dariam cores diferentes para o mesmo aluno em telas diferentes.
 */
const CORES_AVATAR = [
  'bg-sky-200 text-sky-800',
  'bg-violet-200 text-violet-800',
  'bg-amber-200 text-amber-800',
  'bg-pink-200 text-pink-800',
  'bg-emerald-200 text-emerald-800',
  'bg-orange-200 text-orange-800',
]

export function corDoAvatar(chave: string): string {
  let soma = 0
  for (let i = 0; i < chave.length; i++) soma += chave.charCodeAt(i)
  return CORES_AVATAR[soma % CORES_AVATAR.length]
}

export function inicial(nome: string): string {
  return nome.trim().charAt(0).toUpperCase() || '?'
}
