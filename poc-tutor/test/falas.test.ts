import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar, receber } from '../src/controlador.ts'
import { falaDaAcao, textoDaFala } from '../src/falas.ts'
import { carregarRoteiro } from '../src/roteiro.ts'
import { contextoDoTurno, paraAvaliacao } from '../src/turno.ts'
import type { Acao, Sessao } from '../src/tipos.ts'

const roteiro = carregarRoteiro()

function ate(s: Sessao, itemId: string): Sessao {
  let atual = s
  for (let i = 0; i < 100 && atual.atual?.item.id !== itemId; i++) {
    atual = receber(atual, { tipo: 'adequada', reconhecido: 'ok' }).sessao
  }
  return atual
}

const falas = (acoes: Acao[], s: Sessao) => acoes.map((a) => falaDaAcao(a, s))

describe('falas', () => {
  it('abre e pede a primeira frase em português', () => {
    const { sessao, acoes } = iniciar(roteiro)
    const [abertura, pedido] = falas(acoes, sessao).map(textoDaFala)
    assert.match(abertura, /was e were/)
    assert.equal(pedido, 'Primeiro, diga em inglês: estava ensolarado hoje de manhã.')
  })

  it('a pista sai em inglês e sozinha; a regra do jogo vem só antes da primeira', () => {
    let r = receber(iniciar(roteiro).sessao, { tipo: 'adequada', reconhecido: 'It was sunny this morning.' })
    const primeira = falaDaAcao(r.acoes[1], r.sessao)
    assert.equal(primeira.at(-1)?.idioma, 'en')
    assert.equal(primeira.at(-1)?.texto, 'Windy.')
    assert.match(textoDaFala(primeira), /você diz a frase inteira/)

    r = receber(r.sessao, { tipo: 'adequada', reconhecido: 'It was windy this morning.' })
    assert.deepEqual(falaDaAcao(r.acoes[1], r.sessao), [{ idioma: 'en', texto: 'Rainy.' }])
  })

  it('a frase-modelo é lida pela voz em inglês, o resto pela em português', () => {
    let s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    for (let i = 0; i < 2; i++) s = receber(s, { tipo: 'erro', reconhecido: 'x', habilidade: 'concordancia_were', problema: 'p' }).sessao
    const r = receber(s, { tipo: 'erro', reconhecido: 'x', habilidade: 'concordancia_were', problema: 'p' })
    assert.deepEqual(falaDaAcao(r.acoes[0], r.sessao), [
      { idioma: 'pt', texto: 'A frase é:' },
      { idioma: 'en', texto: 'They were at home.' },
      { idioma: 'pt', texto: 'Agora diga a frase inteira.' },
    ])
  })

  it('a pista é uma pergunta em português, sem a resposta em inglês', () => {
    const s = ate(iniciar(roteiro).sessao, 'jantar.base')
    const r = receber(s, { tipo: 'erro', reconhecido: 'Were they dinner together?', habilidade: 'having_refeicao', problema: 'p', acertoParcial: 'Were they' })
    const texto = textoDaFala(falaDaAcao(r.acoes[0], r.sessao))
    assert.equal(texto, "Quase! Falta o verbo. Como se diz 'jantar' em inglês?")
    assert.ok(!/having|have dinner/.test(texto), 'a pista não pode entregar a resposta')
  })

  it('depois de uma dúvida, relembra a frase e a pista pendentes', () => {
    const s = ate(iniciar(roteiro).sessao, 'clima.yesterday')
    const r = receber(s, { tipo: 'duvida', pergunta: 'yesterday é ontem?', resposta: 'Sim, yesterday é ontem.' })
    assert.equal(
      textoDaFala(falaDaAcao(r.acoes[0], r.sessao)),
      'Sim, yesterday é ontem. Voltando ao exercício. A frase era: It was rainy this morning. Yesterday.',
    )
  })

  it('pedido terminado em pergunta não ganha ponto dobrado', () => {
    // Aceitar o último item do bloco "sujeito" abre o bloco das perguntas.
    const r = receber(ate(iniciar(roteiro).sessao, 'sujeito.i'), { tipo: 'adequada', reconhecido: 'ok' })
    const texto = textoDaFala(falaDaAcao(r.acoes.at(-1)!, r.sessao))
    assert.equal(texto, 'Nova frase. Diga em inglês: ele foi seu professor no ano passado?')
  })

  it('na conversa, o acerto vira a reação ao conteúdo, em inglês', () => {
    const s = ate(iniciar(roteiro).sessao, 'conversa.cidade')
    const r = receber(s, { tipo: 'adequada', reconhecido: 'It was rainy.', observacao: 'Rainy! I hope you stayed dry.' })
    assert.deepEqual(falaDaAcao(r.acoes[0], r.sessao), [{ idioma: 'en', texto: 'Rainy! I hope you stayed dry.' }])
  })
})

describe('turno', () => {
  it('o contexto leva a última frase aceita e o alvo pendente', () => {
    const s = ate(iniciar(roteiro).sessao, 'clima.yesterday')
    const c = contextoDoTurno(s)
    assert.equal(c.ultima_frase_aceita, 'It was rainy this morning.')
    assert.equal(c.alvo_pendente, 'It was rainy yesterday.')
    assert.equal(c.pedido.pista, 'Yesterday.')
    assert.equal(c.apoio_disponivel, false)
  })

  it('a escada só é oferecida ao avaliador onde existe', () => {
    assert.equal(contextoDoTurno(ate(iniciar(roteiro).sessao, 'jantar.base')).apoio_disponivel, true)
  })

  it('áudio incerto vira incerteza, nunca erro', () => {
    const s = iniciar(roteiro).sessao
    const a = paraAvaliacao({ transcricao: { texto: 'it was sun…', confianca: 'baixa' }, avaliacao: { tipo: 'audio_incerto' } }, s)
    assert.deepEqual(a, { tipo: 'audio_incerto', reconhecido: 'it was sun…' })
  })

  it('campos vazios do avaliador são tratados como ausentes', () => {
    const s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    const a = paraAvaliacao(
      { transcricao: { texto: 'They was at home.', confianca: 'alta' }, avaliacao: { tipo: 'erro', habilidade: '', problema: 'was com they', acerto_parcial: '' } },
      s,
    )
    assert.deepEqual(a, { tipo: 'erro', reconhecido: 'They was at home.', habilidade: 'concordancia_were', problema: 'was com they', acertoParcial: undefined, dica: undefined })
  })
})

describe('acerto parcial', () => {
  it('só um trecho curto vira "Você acertou …"', () => {
    const s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    const com = (acerto_parcial: string) =>
      paraAvaliacao({ transcricao: { texto: 'x', confianca: 'alta' }, avaliacao: { tipo: 'erro', problema: 'p', acerto_parcial } }, s)
    assert.equal((com('having') as { acertoParcial?: string }).acertoParcial, 'having')
    assert.equal((com("Substituiu o sujeito por 'they'.") as { acertoParcial?: string }).acertoParcial, undefined)
    assert.equal((com(',') as { acertoParcial?: string }).acertoParcial, undefined)
  })
})
