import { iniciar, receber } from './controlador.ts'
import { chaveDaFala } from './chaveDaFala.ts'
import { falaDaAcao, type Fala } from './falas.ts'
import type { Acao, Avaliacao, Item, Roteiro, Sessao } from './tipos.ts'

/**
 * As falas do tutor que já se sabe de antemão — as que saem só do roteiro e
 * dos templates, sem nada do que o aluno disse —, por chave (chaveDaFala).
 * São as que valem a pena gravar: tocam na hora e não custam nada na aula.
 *
 * Usado por scripts/gravar-falas.ts (a lição do laboratório, no bundle), por
 * scripts/publicar-licao.ts e pelo painel Áudios do editor de lições no app
 * (as lições do banco, no bucket `tutor-falas`).
 *
 * `quantos`: só os primeiros N itens dos blocos (o padrão é todos).
 */
export function falasFixas(roteiro: Roteiro, quantos = Infinity): Map<string, Fala> {
  const itens = roteiro.blocos.flatMap((b) => b.itens).slice(0, quantos)
  const ids = new Set(itens.map((i) => i.id))
  const falas = new Map<string, Fala>()

  function guardar(acoes: Acao[], s: Sessao) {
    for (const a of acoes) {
      if ('item' in a && !ids.has(a.item.id)) continue
      const fala = falaDaAcao(a, s)
      falas.set(chaveDaFala(fala), fala)
    }
  }

  // Caminho "feliz" até cada item; dali, todas as sequências de até 4 respostas
  // enquanto o item não muda.
  let base = iniciar(roteiro)
  guardar(base.acoes, base.sessao)
  for (const item of itens) {
    while (base.sessao.atual?.item.id !== item.id) {
      base = receber(base.sessao, { tipo: 'adequada', reconhecido: 'ok' })
    }
    const explorar = (s: Sessao, profundidade: number) => {
      if (profundidade === 0 || s.atual?.item.id !== item.id) return
      for (const av of respostasPara(item)) {
        const r = receber(s, av)
        guardar(r.acoes, r.sessao)
        explorar(r.sessao, profundidade - 1)
      }
    }
    explorar(base.sessao, 4)
  }
  return falas
}

/**
 * As respostas "sem conteúdo do aluno" que o controlador pode receber: acerto,
 * erro em cada habilidade prevista (e numa imprevista, que cai na ajuda do
 * roteiro), pedido de ajuda, silêncio, áudio que não deu para ouvir e pular.
 * Nada de `dica`, `acertoParcial` nem `reconhecido` na fala: esses mudam a
 * cada aluno e vão para o stream.
 */
function respostasPara(item: Item): Avaliacao[] {
  const habilidades = new Set([...item.habilidades, ...(item.errosPrevistos ?? []).map((e) => e.habilidade), 'outra'])
  return [
    { tipo: 'adequada', reconhecido: item.alvo ?? '' },
    ...[...habilidades].map((habilidade): Avaliacao => ({ tipo: 'erro', reconhecido: '-', habilidade, problema: '-' })),
    { tipo: 'pedido_ajuda' },
    { tipo: 'silencio' },
    { tipo: 'audio_incerto' },
    { tipo: 'pular' },
  ]
}
