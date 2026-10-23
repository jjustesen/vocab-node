import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar, memoria, receber } from '../src/controlador.ts'
import { falaDaAcao, textoDaFala } from '../src/falas.ts'
import { contextoDoTurno } from '../src/turno.ts'
import { validarRoteiro } from '../src/validacao.ts'
import type { Roteiro } from '../src/tipos.ts'

/**
 * A modelagem: o tutor apresenta a frase ("Agora iremos modelar uma frase,
 * …"), diz o que ela quer dizer e o aluno repete. É o começo natural de uma
 * cadeia, então aqui ela abre a aula e a substituição parte dela.
 */
const roteiro: Roteiro = {
  id: 'teste-modelagem',
  titulo: 'Teste',
  abertura: 'Vamos praticar.',
  painel: { estruturas: [], vocabulario: [], exemplos: [], alertas: [] },
  blocos: [
    {
      id: 'comer',
      objetivo: 'Eat + comida',
      itens: [
        {
          id: 'comer.modelo',
          tipo: 'modelagem',
          calibracao: true,
          modelo: 'I eat bread and butter.',
          alvo: 'I eat bread and butter.',
          solicitacao: 'eu como pão com manteiga',
          habilidades: ['eat'],
        },
        { id: 'comer.arroz', tipo: 'substituicao', pista: 'rice', alvo: 'I eat rice.', habilidades: ['comida'] },
      ],
    },
  ],
  apoios: {},
  conversa: [],
  recuperacao: {},
}

describe('modelagem', () => {
  it('o roteiro com modelagem é válido; sem a frase, não', () => {
    assert.deepEqual(validarRoteiro(roteiro), [])
    const quebrado = structuredClone(roteiro)
    delete quebrado.blocos[0].itens[0].modelo
    assert.deepEqual(validarRoteiro(quebrado), ['comer.modelo: modelagem sem "modelo" (a frase em inglês)'])
  })

  it('o tutor começa com "Agora iremos modelar uma frase," e a frase sai na voz em inglês', () => {
    const { sessao, acoes } = iniciar(roteiro)
    const pedido = falaDaAcao(acoes[1], sessao)
    assert.deepEqual(pedido, [
      { idioma: 'pt', texto: 'Agora iremos modelar uma frase,' },
      { idioma: 'en', texto: 'I eat bread and butter.' },
      { idioma: 'pt', texto: 'Quer dizer: eu como pão com manteiga.' },
      { idioma: 'pt', texto: 'Repita a frase.' },
    ])
  })

  it('sem o sentido, o tutor diz só a frase e pede a repetição', () => {
    const semSentido = structuredClone(roteiro)
    delete semSentido.blocos[0].itens[0].solicitacao
    const { sessao, acoes } = iniciar(semSentido)
    assert.equal(textoDaFala(falaDaAcao(acoes[1], sessao)), 'Agora iremos modelar uma frase, I eat bread and butter. Repita a frase.')
  })

  it('o avaliador recebe a frase a repetir, não o sentido em português', () => {
    const s = iniciar(roteiro).sessao
    assert.equal(contextoDoTurno(s).pedido.modelo_para_repetir, 'I eat bread and butter.')
    assert.equal(memoria(s).solicitacao_pendente, 'I eat bread and butter.')
  })

  it('repetir certo segue sem "agora sim" e sem ponto para revisar, e a substituição parte da frase modelada', () => {
    const r = receber(iniciar(roteiro).sessao, { tipo: 'adequada', reconhecido: 'I eat bread and butter.' })
    assert.equal(r.acoes[0].tipo, 'confirmar_acerto')
    assert.deepEqual(falaDaAcao(r.acoes[0], r.sessao), [])
    assert.equal(r.sessao.resultados[0].resultado, 'com_modelo', 'repetir não conta como feito sozinho')
    assert.deepEqual(r.sessao.dificuldades, [])
    assert.equal(r.sessao.ultimaAceita, 'I eat bread and butter.')
    assert.equal(r.sessao.atual?.item.id, 'comer.arroz')
  })

  it('errar a repetição é dificuldade: o tutor diz a frase de novo', () => {
    const r = receber(iniciar(roteiro).sessao, { tipo: 'erro', reconhecido: 'I eats bread.', habilidade: 'eat', problema: 'eats' })
    const ajuda = r.acoes[0]
    assert.equal(ajuda.tipo, 'ajudar')
    assert.equal(ajuda.tipo === 'ajudar' && ajuda.conteudo, 'I eat bread and butter.')
    assert.deepEqual(r.sessao.dificuldades.map((d) => d.habilidade), ['eat'])
  })
})
