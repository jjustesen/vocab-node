import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar, receber } from '../src/controlador.ts'
import { falaDaAcao, textoDaFala } from '../src/falas.ts'
import { contextoDoTurno } from '../src/turno.ts'
import { validarRoteiro } from '../src/validacao.ts'
import type { Roteiro } from '../src/tipos.ts'

/**
 * Os dois formatos que os drillings do professor trouxeram: a pista em
 * português ("Eu falo inglês / alemão / italiano") e o "Change into …", em
 * que o tutor diz a frase em inglês e o aluno a transforma.
 */
const roteiro: Roteiro = {
  id: 'teste-drillings',
  titulo: 'Teste',
  abertura: 'Vamos praticar.',
  painel: { estruturas: [], vocabulario: [], exemplos: [], alertas: [] },
  blocos: [
    {
      id: 'idiomas',
      objetivo: 'Speak + idioma',
      itens: [
        { id: 'idiomas.base', tipo: 'construcao', calibracao: true, solicitacao: 'eu falo inglês', alvo: 'I speak English.', habilidades: ['speak'] },
        { id: 'idiomas.alemao', tipo: 'substituicao', pista: 'alemão', idiomaDaPista: 'pt', alvo: 'I speak German.', habilidades: ['idioma'] },
        { id: 'idiomas.italiano', tipo: 'substituicao', pista: 'Italian.', alvo: 'I speak Italian.', habilidades: ['idioma'] },
      ],
    },
    {
      id: 'negativa',
      objetivo: 'Passar para a negativa',
      itens: [
        {
          id: 'negativa.pao',
          tipo: 'transformacao',
          modelo: 'I eat bread and butter.',
          instrucao: 'Passe para a negativa',
          alvo: "I don't eat bread and butter.",
          variantes: ['I do not eat bread and butter.'],
          habilidades: ['negativa_dont'],
        },
        {
          id: 'negativa.cafe',
          tipo: 'transformacao',
          modelo: 'I drink coffee.',
          instrucao: 'Passe para a negativa.',
          alvo: "I don't drink coffee.",
          habilidades: ['negativa_dont'],
        },
      ],
    },
  ],
  apoios: {},
  conversa: [],
  recuperacao: {},
}

describe('tipos dos drillings', () => {
  it('o roteiro com transformação e pista em português é válido', () => {
    assert.deepEqual(validarRoteiro(roteiro), [])
  })

  it('transformação sem modelo, instrução ou alvo é recusada', () => {
    const quebrado = structuredClone(roteiro)
    const item = quebrado.blocos[1].itens[0]
    delete item.modelo
    delete item.instrucao
    delete item.alvo
    const problemas = validarRoteiro(quebrado)
    assert.equal(problemas.length, 3)
  })

  it('a pista em português sai na voz em português; a em inglês, na voz em inglês', () => {
    let r = receber(iniciar(roteiro).sessao, { tipo: 'adequada', reconhecido: 'I speak English.' })
    assert.deepEqual(falaDaAcao(r.acoes[1], r.sessao).at(-1), { idioma: 'pt', texto: 'alemão' })
    r = receber(r.sessao, { tipo: 'adequada', reconhecido: 'I speak German.' })
    assert.deepEqual(falaDaAcao(r.acoes[1], r.sessao), [{ idioma: 'en', texto: 'Italian.' }])
  })

  it('a transformação diz a instrução em português e a frase em inglês, e começa cadeia nova', () => {
    let s = iniciar(roteiro).sessao
    for (const fala of ['I speak English.', 'I speak German.', 'I speak Italian.']) s = receber(s, { tipo: 'adequada', reconhecido: fala }).sessao
    assert.equal(s.atual?.item.id, 'negativa.pao')
    assert.equal(s.ultimaAceita, null, 'o bloco novo zera a frase anterior')

    const pedido = falaDaAcao({ tipo: 'solicitar', item: s.atual!.item, contexto: 'cadeia' }, s)
    assert.deepEqual(pedido, [
      { idioma: 'pt', texto: 'Passe para a negativa:' },
      { idioma: 'en', texto: 'I eat bread and butter.' },
    ])

    const ctx = contextoDoTurno(s)
    assert.equal(ctx.pedido.frase_para_transformar, 'I eat bread and butter.')
    assert.equal(ctx.pedido.instrucao, 'Passe para a negativa')
    assert.equal(ctx.pedido.modelo_para_repetir, null)
    assert.equal(ctx.alvo_pendente, "I don't eat bread and butter.")
  })

  it('a instrução com ponto final não vira "negativa.:"', () => {
    let s = iniciar(roteiro).sessao
    for (const fala of ['a', 'b', 'c', 'd']) s = receber(s, { tipo: 'adequada', reconhecido: fala }).sessao
    assert.equal(s.atual?.item.id, 'negativa.cafe')
    const pedido = textoDaFala(falaDaAcao({ tipo: 'solicitar', item: s.atual!.item, contexto: 'cadeia' }, s))
    assert.equal(pedido, 'Passe para a negativa: I drink coffee.')
  })

  it('uma aula só de acertos termina com tudo feito sozinho', () => {
    let s = iniciar(roteiro).sessao
    let turnos = 0
    while (!s.encerrada && turnos++ < 20) s = receber(s, { tipo: 'adequada', reconhecido: s.atual?.item.alvo ?? 'ok' }).sessao
    assert.ok(s.encerrada)
    assert.equal(s.resultados.filter((x) => x.resultado === 'autonomo').length, 5)
  })

  it('lição sem conversa: o tutor não anuncia a conversa e vai direto ao fim', () => {
    const tipos = (r: Roteiro) => {
      let { sessao: s, acoes } = iniciar(r)
      const vistos = acoes.map((a) => a.tipo)
      while (!s.encerrada) {
        ;({ sessao: s, acoes } = receber(s, { tipo: 'adequada', reconhecido: s.atual?.item.alvo ?? 'ok' }))
        vistos.push(...acoes.map((a) => a.tipo))
      }
      return vistos
    }
    assert.ok(!tipos(roteiro).includes('iniciar_conversa'))
    assert.equal(tipos(roteiro).at(-1), 'encerrar')

    const comConversa = structuredClone(roteiro)
    comConversa.conversa = [{ id: 'conversa.cafe', tipo: 'conversa', pergunta: 'Do you drink coffee?', criterio: 'diz se bebe café', habilidades: ['conversa'] }]
    assert.ok(tipos(comConversa).includes('iniciar_conversa'))
  })
})
