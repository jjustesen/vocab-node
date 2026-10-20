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
  return new Map([...falasFixasComItens(roteiro, quantos)].map(([chave, { fala }]) => [chave, fala]))
}

/**
 * As mesmas falas, cada uma com os itens em que o tutor a diz. Uma fala de um
 * item só ("Diga em inglês: eu falo inglês.", a dica dele) é DAQUELE exercício;
 * a que aparece em vários ("Muito bem.") é geral. O editor mostra as primeiras
 * dentro de cada exercício, com o play de cada uma.
 */
export function falasFixasComItens(
  roteiro: Roteiro,
  quantos = Infinity,
): Map<string, { fala: Fala; itens: Set<string> }> {
  const itens = roteiro.blocos.flatMap((b) => b.itens).slice(0, quantos)
  const ids = new Set(itens.map((i) => i.id))
  const falas = new Map<string, { fala: Fala; itens: Set<string> }>()

  function guardar(acoes: Acao[], s: Sessao) {
    for (const a of acoes) {
      if ('item' in a && !ids.has(a.item.id)) continue
      const fala = falaDaAcao(a, s)
      const chave = chaveDaFala(fala)
      const registro = falas.get(chave) ?? { fala, itens: new Set<string>() }
      if ('item' in a) registro.itens.add(a.item.id)
      falas.set(chave, registro)
    }
  }

  // Caminho "feliz" até cada item; dali, todas as sequências de até 4 respostas
  // enquanto o item não muda.
  //
  // Caminhos diferentes chegam ao MESMO estado (errar em sujo_it e depois em
  // was deixa o item onde errar duas vezes em was deixa): dali em diante as
  // falas são as mesmas, então cada estado é explorado uma vez só, na maior
  // profundidade em que apareceu. Sem isso uma lição de 60 itens levava minutos.
  let base = iniciar(roteiro)
  guardar(base.acoes, base.sessao)
  for (const item of itens) {
    while (base.sessao.atual?.item.id !== item.id) {
      base = receber(base.sessao, { tipo: 'adequada', reconhecido: 'ok' })
    }
    // O registro das decisões só cresce e não muda fala nenhuma — mas cada
    // turno copia a sessão inteira, e com ele a lição ficava mais lenta a cada item.
    base = { ...base, sessao: { ...base.sessao, registro: [] } }
    const explorados = new Map<string, number>()
    const explorar = (s: Sessao, profundidade: number) => {
      if (profundidade === 0 || s.atual?.item.id !== item.id) return
      const estado = assinatura(s)
      if ((explorados.get(estado) ?? 0) >= profundidade) return
      explorados.set(estado, profundidade)
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

/** Tudo o que decide as próximas falas: o item em andamento, a cadeia, as dificuldades e a contagem dos elogios. */
function assinatura(s: Sessao): string {
  const { item, ...atual } = s.atual!
  return JSON.stringify([
    item.id,
    atual,
    s.suspenso?.tentando.item.id ?? null,
    s.fraseBase,
    s.ultimaAceita,
    s.calibracao,
    s.resultados.length,
    s.dificuldades,
    s.fila.length,
  ])
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
