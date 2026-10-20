import { ROTULO_HABILIDADE } from './falas.ts'
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
      case 'transformacao':
        if (!item.modelo) problemas.push(`${item.id}: transformação sem "modelo" (a frase em inglês)`)
        if (!item.instrucao) problemas.push(`${item.id}: transformação sem "instrucao"`)
        if (!item.alvo) problemas.push(`${item.id}: transformação sem "alvo"`)
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

/** Para comparar frases sem depender de maiúscula nem de pontuação. */
const normal = (t: string) =>
  t
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[.,!?…"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Todos os itens do roteiro: blocos, conversa, escadas de apoio e recuperação. */
export function todosOsItens(r: Roteiro): Item[] {
  return [
    ...r.blocos.flatMap((b) => b.itens),
    ...r.conversa,
    ...Object.values(r.apoios).flatMap((a) => a.degraus),
    ...Object.values(r.recuperacao),
  ]
}

/**
 * O que não quebra a aula, mas a deixa pior — e que uma lição escrita (ou
 * gerada pela IA) costuma deixar passar: o painel mostrando a resposta, a dica
 * que já diz a frase, uma habilidade sem nome para o aluno. O editor mostra
 * isto como aviso; os testes de roteiro/ exigem a lista vazia.
 */
export function avisosDoRoteiro(r: Roteiro): string[] {
  const avisos: string[] = []
  const { painel } = r

  const visivel = normal(
    [...painel.estruturas, ...painel.exemplos, ...painel.alertas, ...painel.vocabulario.flatMap((v) => [v.en, v.pt])].join(' | '),
  )
  for (const item of r.blocos.flatMap((b) => b.itens)) {
    for (const resposta of [item.alvo, ...(item.variantes ?? [])]) {
      if (resposta && visivel.includes(normal(resposta))) avisos.push(`${item.id}: a folha de apoio mostra a resposta "${resposta}"`)
    }
  }
  // A tela usa estes textos como chave de lista: repetido some da folha.
  for (const [nome, lista] of Object.entries({
    estruturas: painel.estruturas,
    exemplos: painel.exemplos,
    alertas: painel.alertas,
    vocabulario: painel.vocabulario.map((v) => v.en),
  })) {
    if (new Set(lista).size !== lista.length) avisos.push(`folha de apoio: há ${nome} repetidos`)
  }

  for (const item of todosOsItens(r)) {
    const respostas = [item.alvo, ...(item.variantes ?? [])].filter((x): x is string => Boolean(x)).map(normal)
    const pistas = [...(item.ajudas ?? []), ...(item.errosPrevistos ?? []).map((e) => e.pista)]
    for (const pista of pistas) {
      if (respostas.some((resposta) => normal(pista).includes(resposta))) avisos.push(`${item.id}: a dica "${pista}" já diz a resposta`)
    }
  }

  for (const bloco of r.blocos) {
    if (r.nomes && !r.nomes.blocos?.[bloco.id]?.trim()) avisos.push(`bloco ${bloco.id} sem nome para o aluno`)
  }
  const usadas = new Set([
    ...todosOsItens(r).flatMap((i) => [...i.habilidades, ...(i.errosPrevistos ?? []).map((e) => e.habilidade)]),
    ...Object.keys(r.recuperacao),
  ])
  for (const h of usadas) {
    const nome = r.nomes?.habilidades?.[h]
    const temNome = nome ? Boolean(nome.curto?.trim() && nome.resumo?.trim()) : Boolean(ROTULO_HABILIDADE[h])
    if (!temNome) avisos.push(`habilidade ${h} sem nome para o aluno`)
  }

  return avisos
}
