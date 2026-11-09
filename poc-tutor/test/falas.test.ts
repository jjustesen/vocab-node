import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar, receber } from '../src/controlador.ts'
import { ehDaConversa, falaDaAcao, legendaDaFala, textoDaFala } from '../src/falas.ts'
import { carregarRoteiro } from '../src/roteiro.ts'
import { contextoDoTurno, paraAvaliacao } from '../src/turno.ts'
import type { Acao, Item, Sessao } from '../src/tipos.ts'

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
    assert.equal(texto, 'Nova frase. Pergunte em inglês: ele foi seu professor no ano passado?')
  })

  it('o elogio do acerto de primeira segue a escolha do exercício, e por padrão não há', () => {
    const elogioCom = (elogio: Item['elogio']) => {
      const [bloco, ...outros] = roteiro.blocos
      const [primeiro, ...resto] = bloco.itens
      const comElogio = { ...roteiro, blocos: [{ ...bloco, itens: [{ ...primeiro, elogio }, ...resto] }, ...outros] }
      const r = receber(iniciar(comElogio).sessao, { tipo: 'adequada', reconhecido: 'It was sunny this morning.' })
      assert.equal(r.acoes[0].tipo, 'confirmar_acerto')
      return falaDaAcao(r.acoes[0], r.sessao)
    }
    assert.deepEqual(elogioCom(undefined), [])
    assert.match(textoDaFala(elogioCom({})), /^(Isso!|Muito bem\.|Perfeito\.|Boa!|Very good!)$/)
    assert.equal(textoDaFala(elogioCom({ frase: 'Ótimo!' })), 'Ótimo!')
  })

  it('a repetição certa de cara segue o elogio do exercício; o "agora sim" fica para quando houve erro', () => {
    const [bloco, ...outros] = roteiro.blocos
    const [primeiro, ...resto] = bloco.itens
    const repeticao = (elogio?: Item['elogio']) => ({
      ...roteiro,
      blocos: [
        { ...bloco, itens: [{ ...primeiro, tipo: 'repeticao' as const, modelo: 'It was sunny this morning.', elogio }, ...resto] },
        ...outros,
      ],
    })
    const deCara = (elogio?: Item['elogio']) =>
      textoDaFala(falaDaAcao(receber(iniciar(repeticao(elogio)).sessao, { tipo: 'adequada', reconhecido: 'It was sunny this morning.' }).acoes[0], iniciar(roteiro).sessao))
    assert.equal(deCara(), '')
    assert.equal(deCara({ frase: 'Great!' }), 'Great!')

    const errou = receber(iniciar(repeticao()).sessao, { tipo: 'erro', reconhecido: 'It is sunny.', habilidade: primeiro.habilidades[0], problema: 'p' })
    const r = receber(errou.sessao, { tipo: 'adequada', reconhecido: 'It was sunny this morning.' })
    assert.equal(textoDaFala(falaDaAcao(r.acoes[0], r.sessao)), 'Isso, agora sim.')
  })

  it('na conversa em português, a reação sai na voz em português e a legenda escolhe o idioma', () => {
    const emPortugues = { ...roteiro, idiomasDaConversa: { resposta: 'pt' as const, legenda: 'pt' as const } }
    const s = ate(iniciar(emPortugues).sessao, 'conversa.cidade')
    assert.equal(contextoDoTurno(s).idioma_da_reacao, 'pt')
    const r = receber(s, { tipo: 'adequada', reconhecido: 'It was rainy.', observacao: 'Chuva! Espero que tenha ficado seco.', traducaoDaObservacao: 'Rainy! I hope you stayed dry.' })
    const fala = falaDaAcao(r.acoes[0], r.sessao)
    assert.equal(fala[0].idioma, 'pt')
    assert.ok(ehDaConversa(r.acoes[0]))
    assert.equal(legendaDaFala(fala, 'pt'), 'Chuva! Espero que tenha ficado seco.')
    assert.equal(legendaDaFala(fala, 'en'), 'Rainy! I hope you stayed dry.')
    // A pergunta é sempre dita em inglês; a legenda usa a tradução quando a lição tem.
    const pergunta = [{ idioma: 'en' as const, texto: 'Where were you?', traducao: 'Onde você estava?' }]
    assert.equal(legendaDaFala(pergunta, 'pt'), 'Onde você estava?')
    assert.equal(legendaDaFala([{ idioma: 'en', texto: 'Where were you?' }], 'pt'), 'Where were you?')
  })

  it('fora da conversa, o contexto não leva idioma de reação', () => {
    assert.equal('idioma_da_reacao' in contextoDoTurno(iniciar(roteiro).sessao), false)
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
