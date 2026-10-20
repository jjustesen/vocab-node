import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { iniciar, receber } from '../src/controlador.ts'
import { avisosDoRoteiro, validarRoteiro } from '../src/validacao.ts'
import type { Acao, Avaliacao, Item, Roteiro, Sessao } from '../src/tipos.ts'

/**
 * Toda lição em roteiro/ passa pelo mesmo crivo: o validador, as regras do
 * material (painel sem respostas, pistas sem a frase pronta) e uma aula inteira
 * conduzida pelo controlador, sem voz e sem IA. Uma lição nova entra aqui sem
 * teste novo — basta o arquivo existir.
 */

const PASTA = new URL('../roteiro/', import.meta.url)
// A biblioteca (roteiro/*.json) e as lições do professor feitas dos drillings dele (roteiro/drillings/).
const ARQUIVOS = [
  ...readdirSync(PASTA).filter((f) => f.endsWith('.json')),
  ...readdirSync(new URL('drillings/', PASTA)).filter((f) => f.endsWith('.json')).map((f) => `drillings/${f}`),
].sort()

const carregar = (arquivo: string) => JSON.parse(readFileSync(new URL(arquivo, PASTA), 'utf8')) as Roteiro

/** Os itens que a aula percorre quando nada dá errado: blocos e conversa. */
const itensDaAula = (r: Roteiro): Item[] => [...r.blocos.flatMap((b) => b.itens), ...r.conversa]

const adequada = (s: Sessao): Avaliacao => ({ tipo: 'adequada', reconhecido: s.atual!.item.alvo ?? 'ok' })

const PROBLEMA = 'erro de teste'
const errarPrimeiro = (s: Sessao): Avaliacao =>
  s.atual!.tentativas === 0
    ? { tipo: 'erro', reconhecido: 'x', habilidade: s.atual!.item.habilidades[0], problema: PROBLEMA }
    : adequada(s)

type Turno = { antes: Sessao; avaliacao: Avaliacao; acoes: Acao[] }

/** Conduz a aula até o fim, respondendo cada turno com `responder`. */
function rodar(r: Roteiro, responder: (s: Sessao) => Avaliacao, limite: number) {
  let sessao = iniciar(r).sessao
  const turnos: Turno[] = []
  while (!sessao.encerrada) {
    assert.ok(turnos.length < limite, `${r.id}: a aula não terminou em ${limite} turnos (parou em ${sessao.atual?.item.id})`)
    const avaliacao = responder(sessao)
    const { sessao: depois, acoes } = receber(sessao, avaliacao)
    turnos.push({ antes: sessao, avaliacao, acoes })
    sessao = depois
  }
  const fim = turnos.at(-1)?.acoes.at(-1)
  if (fim?.tipo !== 'encerrar') assert.fail(`${r.id}: a aula terminou sem resumo`)
  return { sessao, turnos, resumo: fim.resumo }
}

for (const arquivo of ARQUIVOS) {
  describe(`roteiro ${arquivo}`, () => {
    const r = carregar(arquivo)

    it('passa no validador', () => {
      assert.deepEqual(validarRoteiro(r), [])
    })

    it('não tem avisos: folha sem respostas, dicas sem a frase, nomes completos', () => {
      assert.deepEqual(avisosDoRoteiro(r), [])
    })

    it('respondendo tudo certo, a aula vai do começo ao fim sem desvio', () => {
      const n = itensDaAula(r).length
      const { turnos, resumo } = rodar(r, adequada, n + 1)
      assert.equal(turnos.length, n, 'um turno por item, sem recuperação')
      assert.equal(resumo.autonomos.length, n)
      assert.deepEqual(resumo.comAjuda, [])
      assert.deepEqual(resumo.pendentes, [])
      assert.deepEqual(resumo.paraRevisar, [])
    })

    it('errando a primeira tentativa de cada item, cada erro recebe ajuda e a aula ainda termina', () => {
      const n = itensDaAula(r).length
      const { sessao, turnos, resumo } = rodar(r, errarPrimeiro, 4 * n + 10)

      for (const { antes, avaliacao, acoes } of turnos) {
        if (avaliacao.tipo !== 'erro') continue
        const { item } = antes.atual!
        const primeira = acoes[0]
        if (item.calibracao) {
          assert.equal(primeira?.tipo, 'modelar', `${item.id}: calibração sem autonomia deve receber o modelo`)
          continue
        }
        if (primeira?.tipo !== 'ajudar') assert.fail(`${item.id}: o erro não gerou ajuda (veio ${primeira?.tipo})`)
        assert.equal(primeira.nivel, 1)
        assert.equal(antes.atual!.item.id, item.id)
        // Construção e substituição têm pista escrita no roteiro: a genérica não deveria aparecer.
        if (item.tipo === 'construcao' || item.tipo === 'substituicao') {
          assert.notEqual(primeira.conteudo, PROBLEMA, `${item.id}: sem pista de autocorreção no roteiro`)
        }
      }

      assert.deepEqual(resumo.autonomos, [])
      assert.deepEqual(resumo.pendentes, [])
      assert.ok(resumo.comAjuda.length >= n, 'todo item da aula saiu com ajuda')
      assert.ok(resumo.paraRevisar.length > 0, 'o resumo aponta o que revisar')
      assert.ok(
        sessao.resultados.some((x) => x.origem === 'recuperacao'),
        'nenhuma dificuldade voltou em recuperação',
      )
    })

    it('cada escada de apoio volta ao item que a abriu', () => {
      const comApoio = r.blocos.flatMap((b) => b.itens).filter((i) => i.apoio)
      for (const item of comApoio) {
        let s = iniciar(r).sessao
        for (let i = 0; i < 200 && s.atual && s.atual.item.id !== item.id; i++) s = receber(s, adequada(s)).sessao
        assert.equal(s.atual?.item.id, item.id, `não cheguei a ${item.id}`)

        const r1 = receber(s, { tipo: 'falta_prerequisito', reconhecido: 'x', problema: 'falta a base' })
        assert.equal(r1.acoes[0].tipo, 'abrir_apoio')
        s = r1.sessao
        for (const degrau of r.apoios[item.apoio!].degraus) {
          assert.equal(s.atual?.item.id, degrau.id)
          s = receber(s, adequada(s)).sessao
        }
        assert.equal(s.atual?.item.id, item.id, `a escada ${item.apoio} não voltou a ${item.id}`)
        assert.equal(s.atual?.contexto, 'retorno')

        s = receber(s, adequada(s)).sessao
        assert.equal(s.resultados.find((x) => x.itemId === item.id)?.resultado, 'apos_apoio')
      }
    })
  })
}
