import type { Item, Roteiro } from './tipos.ts'

/**
 * O que o controlador assume sobre o roteiro. Um roteiro é escrito à mão e vai
 * crescer; um campo faltando aqui viraria, no meio da aula, um tutor pedindo
 * "diga em inglês: undefined".
 */
export function validarRoteiro(r: Roteiro): string[] {
  const problemas: string[] = []
  const ids = new Set<string>()

  function checar(item: Item, onde: string) {
    if (ids.has(item.id)) problemas.push(`${onde}: id repetido "${item.id}"`)
    ids.add(item.id)
    if (!item.habilidades?.length) problemas.push(`${item.id}: sem habilidades`)

    switch (item.tipo) {
      case 'construcao':
        if (!item.solicitacao) problemas.push(`${item.id}: construção sem "solicitacao"`)
        if (!item.alvo) problemas.push(`${item.id}: construção sem "alvo"`)
        break
      case 'substituicao':
        if (!item.pista) problemas.push(`${item.id}: substituição sem "pista"`)
        if (!item.alvo) problemas.push(`${item.id}: substituição sem "alvo"`)
        break
      case 'repeticao':
        if (!item.modelo) problemas.push(`${item.id}: repetição sem "modelo"`)
        break
      case 'conversa':
        if (!item.pergunta) problemas.push(`${item.id}: conversa sem "pergunta"`)
        if (!item.criterio) problemas.push(`${item.id}: conversa sem "criterio"`)
        break
      default:
        problemas.push(`${item.id}: tipo desconhecido "${(item as Item).tipo}"`)
    }

    if (item.apoio && !r.apoios[item.apoio]) problemas.push(`${item.id}: apoio "${item.apoio}" não existe`)
    for (const e of item.errosPrevistos ?? []) {
      if (!item.habilidades.includes(e.habilidade)) {
        problemas.push(`${item.id}: erro previsto em "${e.habilidade}", que não está nas habilidades do item`)
      }
    }
  }

  r.blocos.forEach((bloco) => {
    // Uma cadeia começa com a frase-base; substituição no início transformaria o nada.
    if (bloco.itens[0]?.tipo === 'substituicao') problemas.push(`bloco ${bloco.id}: começa com substituição`)
    bloco.itens.forEach((item) => checar(item, `bloco ${bloco.id}`))
  })
  if (!r.blocos[0]?.itens[0]?.calibracao) problemas.push('o primeiro item da aula deve ter "calibracao": true')

  for (const [id, apoio] of Object.entries(r.apoios)) apoio.degraus.forEach((d) => checar(d, `apoio ${id}`))
  r.conversa.forEach((item) => checar(item, 'conversa'))
  for (const [habilidade, item] of Object.entries(r.recuperacao)) {
    checar(item, `recuperação ${habilidade}`)
    if (!item.habilidades.includes(habilidade)) {
      problemas.push(`recuperação ${habilidade}: o item ${item.id} não treina essa habilidade`)
    }
  }

  // O alerta do material (§9 da análise): "I weren't" não pode ir para o aluno.
  const textos = JSON.stringify(r.painel) + JSON.stringify(r.blocos)
  if (/\bI weren'?t\b/i.test(textos.replace(/"exemplo":"[^"]*"/g, ''))) {
    problemas.push('"I weren\'t" aparece fora de um erro previsto — use "I wasn\'t"')
  }

  return problemas
}
