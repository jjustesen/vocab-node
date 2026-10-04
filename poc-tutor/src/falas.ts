import type { Acao, Contexto, Item, Sessao } from './tipos.ts'

/**
 * O que o tutor DIZ para cada `Acao` — por template, sem IA.
 *
 * Template e não modelo de linguagem porque quase tudo aqui é fixo pela
 * pedagogia: a pista é a pista ("Windy."), a ajuda de nível 1 é a do roteiro,
 * o modelo é o alvo. Template é instantâneo, não custa nada e nunca "melhora"
 * a frase-alvo por conta própria. Onde a variação é necessária — responder uma
 * dúvida, reagir ao que o aluno contou na conversa — o texto já vem pronto do
 * avaliador, e aqui só é encaixado.
 *
 * Cada fala é uma lista de PARTES com idioma: o tutor mistura português e
 * inglês na mesma frase ("A frase é: It was windy this morning."), e cada
 * parte é lida pela voz do seu idioma. Uma voz brasileira lendo "windy" é
 * exatamente o modelo de pronúncia que a aula não quer dar.
 */

export type Idioma = 'pt' | 'en'
export type Parte = { idioma: Idioma; texto: string }
export type Fala = Parte[]

const pt = (texto: string): Parte => ({ idioma: 'pt', texto })
/** Fecha a frase com ponto, sem dobrar a pontuação que ela já tem ("passado?"). */
const comPonto = (t: string) => (/[.?!)]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`)
const en = (texto: string): Parte => ({ idioma: 'en', texto })

/** A fala inteira como texto, para mostrar na tela. */
export function textoDaFala(fala: Fala): string {
  return fala.map((p) => p.texto).join(' ')
}

export function falaDaAcao(a: Acao, s: Sessao): Fala {
  switch (a.tipo) {
    case 'abrir':
      return [pt(a.texto)]

    case 'solicitar':
      return pedido(a.item, a.contexto, s)

    case 'modelar':
      return [
        pt('Escute:'),
        en(a.modelo),
        ...(a.item.solicitacao ? [pt(`Quer dizer: ${comPonto(a.item.solicitacao)}`)] : []),
        pt('Agora repita a frase.'),
      ]

    case 'confirmar_acerto': {
      // Na conversa, a reação ao CONTEÚDO vale mais que um "muito bem".
      if (a.item.tipo === 'conversa') return [en(a.observacao ?? 'Nice!')]
      if (a.resultado !== 'autonomo') return [pt('Isso, agora sim.')]
      return [pt(ELOGIOS[s.resultados.length % ELOGIOS.length])]
    }

    case 'ajudar': {
      const partes: Fala = []
      const pergunta = a.nivel < 3 && a.conteudo.trim().endsWith('?')
      // Na pista-pergunta o "Quase!" já reconhece o que estava certo; somar
      // "Você acertou They." na frente soava como correção de prova.
      if (a.acertoParcial && !pergunta) partes.push(pt(`Você acertou ${a.acertoParcial}.`))
      if (a.nivel === 3) {
        partes.push(pt('A frase é:'), en(a.conteudo))
      } else if (a.conteudo.trim().endsWith('?')) {
        // Pista em forma de pergunta: o aluno responde a ELA. Pedir a frase
        // inteira na mesma fala atropelaria a pergunta — isso vem depois.
        if (!/^(quase|tem um|opa|isso)/i.test(a.conteudo.trim())) partes.push(pt('Quase!'))
        partes.push(pt(a.conteudo))
        return partes
      } else {
        partes.push(pt(a.conteudo))
      }
      partes.push(pt(a.item.tipo === 'conversa' ? 'Tente responder de novo.' : 'Agora diga a frase inteira.'))
      return partes
    }

    case 'pedir_frase_inteira':
      return [pt('Isso,'), en(a.reconhecido.replace(/[.!]+$/, '') + '!'), pt('Agora diga a frase inteira.')]

    case 'confirmar_audio':
      return a.reconhecido
        ? [pt('Não tenho certeza se entendi. Você disse:'), en(a.reconhecido), pt('Se foi isso, toque em "Foi isso". Se não, fale de novo.')]
        : [pt('Não consegui te ouvir bem. Pode repetir?')]

    case 'responder_duvida':
      return [pt(a.resposta ?? 'Boa pergunta.'), pt('Voltando ao exercício.'), ...retomada(a.retomar, s)]

    case 'abrir_apoio':
      return [pt('Vamos montar essa frase por partes, e depois voltamos a ela.')]

    case 'registrar_pendente':
      if (!a.modelo) return [pt('Tudo bem, vamos seguir. Voltamos a isso depois.')]
      return [pt('Tudo bem. A frase é:'), en(a.modelo), pt('Vamos voltar a ela depois.')]

    case 'iniciar_conversa':
      return [pt('Ótimo treino! Agora vamos conversar um pouco. Responda em inglês, com a sua realidade.')]

    case 'encerrar':
      return encerramento(a.resumo)
  }
}

const ELOGIOS = ['Isso!', 'Muito bem.', 'Perfeito.', 'Boa!', 'Very good!']

function pedido(item: Item, contexto: Contexto, s: Sessao): Fala {
  const antes: Fala = []
  if (contexto === 'retorno') antes.push(pt('Agora sim, de volta à frase de antes.'))
  if (contexto === 'recuperacao') antes.push(pt('Vamos voltar a um ponto que treinamos antes.'))

  switch (item.tipo) {
    case 'repeticao':
      return [...antes, pt('Repita comigo:'), en(item.modelo ?? '')]
    case 'construcao': {
      const abertura = contexto === 'calibracao' ? 'Primeiro, diga em inglês:' : contexto === 'cadeia' ? 'Nova frase. Diga em inglês:' : 'Diga em inglês:'
      return [...antes, pt(`${abertura} ${comPonto(item.solicitacao ?? '')}`)]
    }
    case 'substituicao':
      // A regra do jogo é dita uma vez, antes da primeira pista da aula.
      if (!jaHouveSubstituicao(s)) antes.push(pt('Agora eu digo uma palavra, e você diz a frase inteira com ela.'))
      return [...antes, en(item.pista ?? '')]
    case 'conversa':
      return [...antes, en(item.pergunta ?? '')]
  }
}

/** Depois de uma dúvida: relembra onde paramos, sem dar a resposta. */
function retomada(item: Item, s: Sessao): Fala {
  if (item.tipo === 'substituicao' && s.ultimaAceita) return [pt('A frase era:'), en(s.ultimaAceita), en(item.pista ?? '')]
  if (item.tipo === 'substituicao') return [en(item.pista ?? '')]
  if (item.tipo === 'construcao') return [pt(`Diga em inglês: ${comPonto(item.solicitacao ?? '')}`)]
  if (item.tipo === 'repeticao') return [pt('Repita comigo:'), en(item.modelo ?? '')]
  return [en(item.pergunta ?? '')]
}

function jaHouveSubstituicao(s: Sessao): boolean {
  const ids = new Set<string>()
  for (const bloco of s.roteiro.blocos) for (const item of bloco.itens) if (item.tipo === 'substituicao') ids.add(item.id)
  return s.resultados.some((r) => ids.has(r.itemId))
}

/** Como cada habilidade aparece no resumo para o aluno. */
export const ROTULO_HABILIDADE: Record<string, string> = {
  sujeito_it: 'o sujeito it nas frases sobre o clima',
  was: 'was com I, he, she e it',
  concordancia_were: 'were com you, we e they',
  concordancia_was: "wasn't com I",
  negativa: "as negativas wasn't e weren't",
  pergunta_inversao: 'perguntas começando com Was ou Were',
  what_like: 'a pergunta What was the weather like',
  having_refeicao: 'have dinner e having dinner',
  progressivo: 'o -ing, como em working out',
  plural: 'o plural, como em co-workers',
  preservar_cadeia: 'manter as mudanças anteriores da frase',
  marcador_tempo: 'expressões de tempo, como yesterday e last weekend',
  adjetivo_clima: 'o vocabulário do clima',
  lugar: 'acrescentar o lugar na pergunta',
  substantivo: 'trocar o substantivo mantendo a pergunta',
  presente_passado: 'a diferença entre was e is',
}

const rotulo = (h: string) => ROTULO_HABILIDADE[h] ?? h.replaceAll('_', ' ')

function encerramento(r: Extract<Acao, { tipo: 'encerrar' }>['resumo']): Fala {
  const partes: Fala = [pt('Terminamos!')]
  const n = r.autonomos.length
  if (n > 0) partes.push(pt(n === 1 ? 'Você disse uma frase sozinho.' : `Você disse ${n} frases sozinho.`))
  if (r.comAjuda.length > 0) {
    partes.push(pt(r.comAjuda.length === 1 ? 'Em uma, precisou de ajuda.' : `Em ${r.comAjuda.length}, precisou de ajuda.`))
  }
  if (r.recuperadas.length > 0) {
    partes.push(pt(`E acertou sozinho, na segunda vez, ${r.recuperadas.map(rotulo).join(' e ')}.`))
  }
  partes.push(
    r.paraRevisar.length > 0
      ? pt(`Para revisar: ${rotulo(r.paraRevisar[0])}.`)
      : pt('Nada pendente para revisar. Muito bem!'),
  )
  return partes
}
