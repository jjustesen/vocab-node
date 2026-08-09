/**
 * Por que uma sessão foi derrubada, para a tela de login conseguir explicar.
 *
 * Vai por sessionStorage e não por `?erro=` na URL porque derrubar a sessão
 * dispara uma CORRIDA de redirects: assim que a sessão vira nula, o guard de
 * rota também manda para o login — sem parâmetro nenhum — e costuma chegar
 * primeiro, apagando a explicação. Sem isto a pessoa é expulsa sem entender o
 * motivo, que foi exatamente o sintoma do primeiro teste desta correção.
 *
 * Lido uma vez só (quem lê, apaga): senão a mensagem reapareceria num login
 * seguinte que não tem nada a ver com ela.
 */
const CHAVE = 'vocabnode:motivo-saida'

export type MotivoDaSaida = 'conta-de-professor' | 'conta-de-aluno'

export function guardarMotivoDaSaida(motivo: MotivoDaSaida) {
  sessionStorage.setItem(CHAVE, motivo)
}

export function consumirMotivoDaSaida(): MotivoDaSaida | null {
  const motivo = sessionStorage.getItem(CHAVE) as MotivoDaSaida | null
  if (motivo) sessionStorage.removeItem(CHAVE)
  return motivo
}
