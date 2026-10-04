import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar, memoria, receber } from '../src/controlador.ts'
import { carregarRoteiro, validarRoteiro } from '../src/roteiro.ts'
import type { Acao, Avaliacao, Sessao } from '../src/tipos.ts'

/**
 * A condução pedagógica testada sem voz e sem IA: as avaliações aqui são as
 * que o modelo de linguagem devolveria. Cada `describe` é um critério de
 * sucesso da especificação (§8).
 */

const roteiro = carregarRoteiro()

const ok = (reconhecido = 'ok'): Avaliacao => ({ tipo: 'adequada', reconhecido })
const erro = (habilidade: string, reconhecido = 'x', problema = 'erro'): Avaliacao => ({
  tipo: 'erro',
  reconhecido,
  habilidade,
  problema,
})

/** Aceita itens até o atual ser `itemId`. */
function ate(s: Sessao, itemId: string): Sessao {
  let atual = s
  for (let i = 0; i < 100 && atual.atual?.item.id !== itemId; i++) atual = receber(atual, ok()).sessao
  assert.equal(atual.atual?.item.id, itemId, `não cheguei a ${itemId}`)
  return atual
}

const tipos = (acoes: Acao[]) => acoes.map((a) => a.tipo)

describe('roteiro', () => {
  it('é válido', () => {
    assert.deepEqual(validarRoteiro(roteiro), [])
  })

  it('a sessão abre com o objetivo e a calibração', () => {
    const { sessao, acoes } = iniciar(roteiro)
    assert.deepEqual(tipos(acoes), ['abrir', 'solicitar'])
    assert.equal(sessao.atual?.item.id, 'clima.base')
    assert.equal(sessao.atual?.contexto, 'calibracao')
  })
})

describe('critério 2 — as substituições preservam as mudanças anteriores', () => {
  it('a pista Yesterday transforma a frase com rainy, não com sunny', () => {
    let s = ate(iniciar(roteiro).sessao, 'clima.yesterday')
    assert.equal(s.ultimaAceita, 'It was rainy this morning.')
    assert.equal(memoria(s).alvo_pendente, 'It was rainy yesterday.')
    s = receber(s, ok('It was rainy yesterday.')).sessao
    assert.equal(s.ultimaAceita, 'It was rainy yesterday.')
    assert.equal(s.fraseBase, 'It was sunny this morning.')
  })

  it('um novo bloco estabelece uma nova frase-base', () => {
    let s = ate(iniciar(roteiro).sessao, 'sujeito.base')
    assert.equal(s.fraseBase, null)
    assert.equal(s.ultimaAceita, null)
    s = receber(s, ok()).sessao
    assert.equal(s.fraseBase, 'I was at home.')
  })
})

describe('critério 3 — erro gera ajuda e nova tentativa, sem avançar', () => {
  it('They was at home: pista de autocorreção, depois trecho, alvo pendente o tempo todo', () => {
    let s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    const antes = s.ultimaAceita

    let r = receber(s, erro('concordancia_were', 'They was at home.'))
    assert.deepEqual(tipos(r.acoes), ['ajudar'])
    assert.equal((r.acoes[0] as Extract<Acao, { tipo: 'ajudar' }>).conteudo, 'Com they, usamos was ou were?')
    assert.equal(r.sessao.atual?.item.id, 'sujeito.they')
    assert.equal(r.sessao.ultimaAceita, antes, 'resposta errada não sobrescreve a última aceita')

    r = receber(r.sessao, erro('concordancia_were'))
    assert.equal((r.acoes[0] as Extract<Acao, { tipo: 'ajudar' }>).nivel, 2)
    assert.equal(r.sessao.atual?.item.id, 'sujeito.they')

    r = receber(r.sessao, ok('They were at home.'))
    assert.equal(r.sessao.resultados.at(-1)?.resultado, 'com_pista')
    assert.equal(r.sessao.atual?.item.id, 'sujeito.not')
  })

  it('o nível 3 é a frase inteira; errar de novo com o modelo deixa o item pendente, não dominado', () => {
    let s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    for (let i = 0; i < 3; i++) s = receber(s, erro('concordancia_were')).sessao
    assert.equal(s.atual?.nivelAjuda, 3)

    let r = receber(s, erro('concordancia_were'))
    const ajuda = r.acoes[0] as Extract<Acao, { tipo: 'ajudar' }>
    assert.equal(ajuda.conteudo, 'They were at home.', 'o modelo é repetido uma vez')

    r = receber(r.sessao, erro('concordancia_were'))
    assert.equal(r.acoes[0].tipo, 'registrar_pendente')
    assert.equal(r.sessao.resultados.at(-1)?.resultado, 'pendente')
    assert.equal(r.sessao.ultimaAceita, 'They were at home.', 'a cadeia segue da frase modelada')
    assert.equal(r.sessao.atual?.item.id, 'sujeito.not')
  })

  it('calibração sem autonomia: modelo e repetição; o acerto conta como produção com ajuda', () => {
    const { sessao } = iniciar(roteiro)
    let r = receber(sessao, erro('sujeito_it', 'Was sunny this morning.'))
    assert.deepEqual(tipos(r.acoes), ['modelar'])
    assert.equal((r.acoes[0] as Extract<Acao, { tipo: 'modelar' }>).modelo, 'It was sunny this morning.')

    r = receber(r.sessao, ok('It was sunny this morning.'))
    assert.equal(r.sessao.calibracao, 'precisou_modelo')
    assert.equal(r.sessao.resultados[0].resultado, 'com_modelo')
  })

  it('calibração com autonomia vai direto às substituições', () => {
    const r = receber(iniciar(roteiro).sessao, ok('It was sunny this morning.'))
    assert.equal(r.sessao.calibracao, 'autonomo')
    assert.equal(r.sessao.atual?.item.id, 'clima.windy')
  })

  it('silêncio dá uma pista e mantém o item, sem contar tentativa', () => {
    const s = ate(iniciar(roteiro).sessao, 'clima.windy')
    const r = receber(s, { tipo: 'silencio' })
    assert.deepEqual(tipos(r.acoes), ['ajudar'])
    assert.equal(r.sessao.atual?.item.id, 'clima.windy')
    assert.equal(r.sessao.atual?.tentativas, 0)
  })
})

describe('critério 4 — dúvida respondida sem perder a posição', () => {
  it('responde e retoma o mesmo item, com as mesmas tentativas', () => {
    let s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    s = receber(s, erro('concordancia_were')).sessao
    const r = receber(s, { tipo: 'duvida', pergunta: 'Por que were e não was?' })
    assert.deepEqual(tipos(r.acoes), ['responder_duvida'])
    assert.equal(r.sessao.atual?.item.id, 'sujeito.they')
    assert.equal(r.sessao.atual?.tentativas, 1)
    assert.equal(r.sessao.atual?.nivelAjuda, 1)
  })
})

describe('critério 5 — a escada de apoio volta ao alvo original', () => {
  it('have dinner → … → Are they having dinner together? → de volta a Were they having dinner together?', () => {
    let s = ate(iniciar(roteiro).sessao, 'jantar.base')
    let r = receber(s, { tipo: 'falta_prerequisito', reconhecido: 'Were they dinner together?', problema: 'sem have' })
    assert.deepEqual(tipos(r.acoes), ['abrir_apoio', 'solicitar'])
    assert.equal(r.sessao.atual?.item.id, 'refeicoes.have')
    assert.equal(r.sessao.suspenso?.tentando.item.id, 'jantar.base')

    s = r.sessao
    const degraus = ['refeicoes.have', 'refeicoes.i', 'refeicoes.they_ing', 'refeicoes.together', 'refeicoes.pergunta']
    for (const id of degraus) {
      assert.equal(s.atual?.item.id, id)
      r = receber(s, ok())
      s = r.sessao
    }
    // O último degrau (presente) NÃO conclui o exercício: o alvo no passado volta.
    assert.equal(s.atual?.item.id, 'jantar.base')
    assert.equal(s.atual?.contexto, 'retorno')
    assert.equal(memoria(s).alvo_pendente, 'Were they having dinner together?')
    assert.equal(s.suspenso, null)

    s = receber(s, ok('Were they having dinner together?')).sessao
    assert.equal(s.resultados.find((x) => x.itemId === 'jantar.base')?.resultado, 'apos_apoio')
    assert.equal(s.atual?.item.id, 'jantar.workout')
    assert.equal(s.ultimaAceita, 'Were they having dinner together?')
  })
})

describe('critério 6 — conversa aceita respostas diferentes do exemplo', () => {
  it('uma resposta pertinente avaliada como adequada é aceita e a conversa segue', () => {
    let s = ate(iniciar(roteiro).sessao, 'conversa.cidade')
    assert.equal(memoria(s).modo, 'conversa')
    s = receber(s, ok('It was really hot, about 35 degrees.')).sessao
    assert.equal(s.resultados.at(-1)?.resultado, 'autonomo')
    assert.equal(s.atual?.item.id, 'conversa.onde')
  })
})

describe('critério 7 — falha de reconhecimento é incerteza de áudio', () => {
  it('pede confirmação e não registra erro nem dificuldade', () => {
    const s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    const r = receber(s, { tipo: 'audio_incerto', reconhecido: 'They w… at home' })
    assert.deepEqual(tipos(r.acoes), ['confirmar_audio'])
    assert.equal(r.sessao.atual?.tentativas, 0)
    assert.equal(r.sessao.atual?.nivelAjuda, 0)
    assert.equal(r.sessao.dificuldades.length, 0)
  })
})

describe('critério 8 — o que foi corrigido reaparece depois', () => {
  it('erro de concordância no bloco "sujeito" volta depois do bloco seguinte, em contexto novo', () => {
    let s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    s = receber(s, erro('concordancia_were')).sessao
    s = receber(s, ok()).sessao

    // Ao fim do próprio bloco ele ainda não volta…
    s = ate(s, 'pessoa.base')
    // …só depois do bloco seguinte.
    s = ate(s, 'pessoa.they')
    const r = receber(s, ok())
    assert.equal(r.sessao.atual?.item.id, 'rec.concordancia_were')
    assert.equal(r.sessao.atual?.contexto, 'recuperacao')

    const depois = receber(r.sessao, ok('Were you at the mall yesterday?')).sessao
    assert.equal(depois.dificuldades.find((d) => d.habilidade === 'concordancia_were')?.recuperada, true)
  })

  it('o fechamento retoma o que ainda não foi recuperado e o resumo separa autonomia de ajuda', () => {
    let s = iniciar(roteiro).sessao
    let ultimas: Acao[] = []
    s = ate(s, 'tempo.base')
    s = receber(s, erro('what_like', 'What was the weather yesterday?')).sessao
    for (let i = 0; i < 200 && !s.encerrada; i++) {
      const r = receber(s, ok())
      s = r.sessao
      ultimas = r.acoes
    }
    assert.ok(s.encerrada)
    assert.ok(s.resultados.some((r) => r.itemId === 'rec.what_like'), 'what_like foi recuperado')
    const fim = ultimas.at(-1) as Extract<Acao, { tipo: 'encerrar' }>
    assert.equal(fim.tipo, 'encerrar')
    assert.deepEqual(fim.resumo.recuperadas, ['what_like'])
    assert.deepEqual(fim.resumo.paraRevisar, [])
    assert.equal(fim.resumo.comAjuda.length, 1)
  })

  it('recuperação feita com ajuda continua para revisar', () => {
    let s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    s = receber(s, erro('concordancia_were')).sessao
    s = receber(s, ok()).sessao
    s = ate(s, 'rec.concordancia_were')
    s = receber(s, erro('concordancia_were')).sessao
    s = receber(s, ok()).sessao
    assert.equal(s.dificuldades.find((d) => d.habilidade === 'concordancia_were')?.recuperada, false)
  })
})

describe('critério 9 — o registro explica cada decisão', () => {
  it('toda avaliação é seguida de uma decisão com motivo', () => {
    let s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    s = receber(s, erro('concordancia_were', 'They was at home.', 'was com they')).sessao
    s = receber(s, { tipo: 'audio_incerto' }).sessao
    s = receber(s, ok()).sessao

    s.registro.forEach((e, i) => {
      if (e.tipo !== 'avaliacao') return
      const decisao = s.registro.slice(i + 1).find((x) => x.tipo === 'decisao')
      assert.ok(decisao?.motivo, `avaliação #${e.seq} sem decisão explicada`)
    })
    const motivos = s.registro.filter((e) => e.tipo === 'decisao').map((e) => e.motivo).join('\n')
    assert.match(motivos, /Erro em concordancia_were \(was com they\)/)
    assert.match(motivos, /Reconhecimento incerto/)
  })
})

describe('pular', () => {
  it('deixa o item pendente, registra para revisão e segue', () => {
    const s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    const r = receber(s, { tipo: 'pular' })
    assert.equal(r.acoes[0].tipo, 'registrar_pendente')
    assert.equal(r.sessao.resultados.at(-1)?.resultado, 'pendente')
    assert.ok(r.sessao.dificuldades.some((d) => d.itemId === 'sujeito.they'))
    assert.equal(r.sessao.atual?.item.id, 'sujeito.not')
  })
})

describe('imutabilidade', () => {
  it('receber não altera a sessão anterior', () => {
    const s = ate(iniciar(roteiro).sessao, 'sujeito.they')
    const copia = structuredClone(s)
    receber(s, erro('concordancia_were'))
    assert.deepEqual(s, copia)
  })
})
