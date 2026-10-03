import type {
  Acao,
  Avaliacao,
  Evento,
  Item,
  NivelAjuda,
  Passo,
  Resultado,
  Resumo,
  Roteiro,
  Sessao,
  Tentando,
} from './tipos.ts'

/**
 * O controlador da sessão — a parte que NÃO pode ficar só no prompt.
 *
 * Ele guarda a posição na aula (item em andamento, frase-base, última frase
 * aceita, ponto de retorno) e decide o próximo passo a partir de uma
 * `Avaliacao`. Não fala com modelo nenhum nem com microfone: recebe o que
 * aconteceu, devolve o que o tutor deve fazer (`Acao[]`). Por isso dá para
 * testar a condução pedagógica inteira sem voz e sem IA — os critérios 2, 3,
 * 4, 5, 7, 8 e 9 da especificação são testes de `test/controlador.test.ts`.
 *
 * Funções puras: cada chamada recebe uma sessão e devolve OUTRA. A anterior
 * continua intacta, o que deixa "desfazer" e reproduzir uma sessão de graça.
 */

/**
 * Erros cometidos já com o modelo dado antes de o item ficar pendente. Dois:
 * o modelo é repetido uma vez; depois disso insistir vira desgaste, e o item
 * sai como pendente (nunca como dominado) para ser revisto depois.
 */
const ERROS_COM_MODELO_MAX = 2

/** Quantas dificuldades o fechamento retoma (Etapa 5: "um ou dois pontos"). */
const RECUPERACOES_NO_FECHAMENTO = 2

// ── API ──────────────────────────────────────────────────────────────────────

export function iniciar(roteiro: Roteiro): { sessao: Sessao; acoes: Acao[] } {
  const fila: Passo[] = []
  for (const bloco of roteiro.blocos) {
    for (const item of bloco.itens) {
      fila.push({
        tipo: 'item',
        item,
        origem: 'bloco',
        contexto: item.calibracao ? 'calibracao' : 'cadeia',
        blocoId: bloco.id,
      })
    }
    fila.push({ tipo: 'fim_de_bloco', blocoId: bloco.id })
  }
  fila.push({ tipo: 'inicio_conversa' })
  for (const item of roteiro.conversa) {
    fila.push({ tipo: 'item', item, origem: 'conversa', contexto: 'conversa', blocoId: null })
  }
  fila.push({ tipo: 'fechamento' })

  const sessao: Sessao = {
    roteiro,
    fila,
    atual: null,
    suspenso: null,
    fraseBase: null,
    ultimaAceita: null,
    calibracao: 'pendente',
    dificuldades: [],
    resultados: [],
    registro: [],
    encerrada: false,
  }
  const acoes: Acao[] = [{ tipo: 'abrir', texto: roteiro.abertura }]
  avancar(sessao, acoes)
  registrarAcoes(sessao, acoes)
  return { sessao, acoes }
}

/** Um turno do aluno: aplica a avaliação e devolve a sessão nova e o que o tutor faz. */
export function receber(anterior: Sessao, avaliacao: Avaliacao): { sessao: Sessao; acoes: Acao[] } {
  if (anterior.encerrada || !anterior.atual) throw new Error('A sessão não tem item em andamento.')
  const s = structuredClone(anterior)
  const t = s.atual!
  const acoes: Acao[] = []
  registrar(s, { tipo: 'avaliacao', itemId: t.item.id, dados: avaliacao })

  switch (avaliacao.tipo) {
    case 'adequada':
      aceitar(s, avaliacao.reconhecido, acoes, avaliacao.observacao)
      break
    case 'erro':
      errar(s, avaliacao, acoes)
      break
    case 'falta_prerequisito':
      abrirApoio(s, avaliacao, acoes)
      break
    case 'parte_certa':
      // Não é tentativa nem acerto do item: é o aluno respondendo à pergunta
      // da pista. Nível e tentativas ficam como estão; o alvo segue pendente.
      decidir(s, 'Acertou o pedaço que a pista perguntou: confirmar e pedir a frase inteira.', t.item.id)
      acoes.push({ tipo: 'pedir_frase_inteira', item: t.item, reconhecido: avaliacao.reconhecido })
      break
    case 'audio_incerto':
      // Critério 7: incerteza de reconhecimento não é erro de inglês. Nada
      // muda na tentativa, no nível de ajuda nem nas dificuldades.
      decidir(s, 'Reconhecimento incerto: confirmar o que foi dito antes de avaliar. Não conta como erro.', t.item.id)
      acoes.push({ tipo: 'confirmar_audio', item: t.item, reconhecido: avaliacao.reconhecido })
      break
    case 'duvida':
      // Critério 4: a dúvida suspende a avaliação, não o item. O mesmo alvo
      // continua pendente, com as mesmas tentativas.
      decidir(s, 'Dúvida do aluno: responder e retomar o mesmo item, sem contar tentativa.', t.item.id)
      acoes.push({ tipo: 'responder_duvida', pergunta: avaliacao.pergunta, resposta: avaliacao.resposta, retomar: t.item })
      break
    case 'pedido_ajuda':
      ajudarSemTentativa(s, 'pedido_ajuda', acoes, avaliacao.ajuda)
      break
    case 'silencio':
      ajudarSemTentativa(s, 'silencio', acoes)
      break
  }

  registrarAcoes(s, acoes)
  return { sessao: s, acoes }
}

/**
 * A memória mínima da sessão (análise §7), no formato que vai para o prompt do
 * modelo a cada turno. É o que permite ao modelo avaliar "It was sunny
 * yesterday" como erro na pista Yesterday: ele precisa saber que a última
 * frase aceita era a de rainy.
 */
export function memoria(s: Sessao) {
  const t = s.atual
  return {
    modo: t?.origem === 'conversa' ? 'conversa' : 'treino_controlado',
    contexto: t?.contexto ?? null,
    tipo_item: t?.item.tipo ?? null,
    bloco: t?.blocoId ?? null,
    frase_base: s.fraseBase,
    ultima_frase_aceita: s.ultimaAceita,
    solicitacao_pendente: t ? (t.item.pista ?? t.item.solicitacao ?? t.item.modelo ?? t.item.pergunta ?? null) : null,
    alvo_pendente: t?.item.alvo ?? null,
    variantes_aceitas: t?.item.variantes ?? [],
    criterio: t?.item.criterio ?? null,
    habilidades: t?.item.habilidades ?? [],
    nivel_ajuda: t?.nivelAjuda ?? 0,
    tentativas_item: t?.tentativas ?? 0,
    erros_para_revisar: [...new Set(s.dificuldades.filter((d) => d.recuperada !== true).map((d) => d.habilidade))],
    retorno_apos_apoio: s.suspenso?.tentando.item.id ?? null,
    // A pergunta que o tutor acabou de fazer: "weren't" sozinho é resposta a
    // ela, não uma frase errada.
    ultima_ajuda: t?.ultimaAjuda ?? null,
  }
}

// ── Turnos ───────────────────────────────────────────────────────────────────

function aceitar(s: Sessao, reconhecido: string, acoes: Acao[], observacao?: string) {
  const t = s.atual!
  const resultado = resultadoDe(t)
  concluir(s, t, resultado, reconhecido)

  if (t.item.calibracao) s.calibracao = resultado === 'autonomo' ? 'autonomo' : 'precisou_modelo'

  // R05: a cadeia avança com o ALVO, não com a forma exata que o aluno usou —
  // as próximas pistas foram escritas a partir dele, e uma variante aceita
  // ("This morning it was sunny") é equivalente, não uma nova frase-base.
  if (t.item.alvo && t.origem !== 'conversa') {
    if (t.item.tipo !== 'substituicao') s.fraseBase = t.item.alvo
    s.ultimaAceita = t.item.alvo
  }

  if (t.origem === 'recuperacao' && t.habilidadeRecuperada) {
    for (const d of s.dificuldades) {
      if (d.habilidade === t.habilidadeRecuperada) d.recuperada = resultado === 'autonomo'
    }
  } else if (resultado !== 'autonomo' && (t.origem === 'bloco' || t.origem === 'conversa')) {
    // Precisou de ajuda sem ter errado (pediu ajuda, ficou em silêncio):
    // ainda assim é um ponto a recuperar.
    if (!s.dificuldades.some((d) => d.itemId === t.item.id)) adicionarDificuldade(s, t.item.habilidades[0], t)
  }

  decidir(
    s,
    resultado === 'autonomo'
      ? 'Resposta adequada sem ajuda: confirmar e seguir.'
      : `Resposta adequada ${ROTULO_RESULTADO[resultado]}: registrar como produção com ajuda e seguir.`,
    t.item.id,
  )
  acoes.push({ tipo: 'confirmar_acerto', item: t.item, reconhecido, resultado, observacao })
  s.atual = null
  avancar(s, acoes)
}

function errar(s: Sessao, av: Extract<Avaliacao, { tipo: 'erro' }>, acoes: Acao[]) {
  const t = s.atual!
  t.tentativas++
  if (t.origem === 'bloco' || t.origem === 'conversa') adicionarDificuldade(s, av.habilidade, t)

  // Calibração: quem não produz a primeira frase sozinho recebe o modelo de
  // uma vez (Etapa 1), em vez de subir a escada de pistas.
  if (t.item.calibracao && t.nivelAjuda < 3) {
    t.nivelAjuda = 3
    decidir(s, 'Calibração sem produção autônoma: apresentar o modelo, verificar o sentido e pedir repetição.', t.item.id)
    acoes.push({ tipo: 'modelar', item: t.item, modelo: modeloDe(t.item) })
    return
  }

  if (t.nivelAjuda === 3) {
    t.errosComModelo++
    if (t.errosComModelo >= ERROS_COM_MODELO_MAX) return deixarPendente(s, acoes)
  }

  t.nivelAjuda = subir(t.nivelAjuda)
  const conteudo = conteudoDaAjuda(t, av.habilidade, av.problema, av.dica)
  decidir(
    s,
    `Erro em ${av.habilidade} (${av.problema}): ajuda de nível ${t.nivelAjuda} e nova tentativa da frase inteira. O alvo continua pendente.`,
    t.item.id,
  )
  t.ultimaAjuda = conteudo
  acoes.push({ tipo: 'ajudar', item: t.item, nivel: t.nivelAjuda, conteudo, acertoParcial: av.acertoParcial })
}

function ajudarSemTentativa(s: Sessao, motivo: 'pedido_ajuda' | 'silencio', acoes: Acao[], especifica?: string) {
  const t = s.atual!
  const porque = motivo === 'silencio' ? 'Silêncio prolongado' : 'Pedido de ajuda'

  if (t.item.calibracao && t.nivelAjuda < 3) {
    t.nivelAjuda = 3
    decidir(s, `${porque} na calibração: apresentar o modelo e pedir repetição.`, t.item.id)
    acoes.push({ tipo: 'modelar', item: t.item, modelo: modeloDe(t.item) })
    return
  }

  t.nivelAjuda = subir(t.nivelAjuda)
  // O aluno pediu algo ESPECÍFICO ("como é educada?"): responder isso vale
  // mais que a pista genérica do roteiro. No nível 3 a frase inteira já cobre.
  const usarEspecifica = Boolean(especifica) && t.nivelAjuda < 3
  decidir(
    s,
    `${porque}${usarEspecifica ? ` (específico: ${especifica})` : ''}: ajuda de nível ${t.nivelAjuda}, mantendo o mesmo item. Não conta como tentativa.`,
    t.item.id,
  )
  const conteudo = usarEspecifica ? especifica! : conteudoDaAjuda(t, null, null)
  t.ultimaAjuda = conteudo
  acoes.push({ tipo: 'ajudar', item: t.item, nivel: t.nivelAjuda, conteudo })
}

/**
 * Critério 5 / R09: o erro revelou uma base ausente. O item é SUSPENSO com a
 * memória da cadeia dele, a escada de apoio entra na frente da fila e, ao
 * terminar, o mesmo item volta — no passado, se o alvo era no passado. Uma
 * frase no presente dentro da escada nunca conclui o exercício original.
 */
function abrirApoio(s: Sessao, av: Extract<Avaliacao, { tipo: 'falta_prerequisito' }>, acoes: Acao[]) {
  const t = s.atual!
  const apoioId = av.apoio ?? t.item.apoio
  const apoio = apoioId ? s.roteiro.apoios[apoioId] : undefined

  // Sem escada para este item, ou já dentro de uma: vira um erro comum. Uma
  // escada dentro da outra perderia o aluno — e o professor também não faz.
  if (!apoio || s.suspenso || t.origem === 'apoio') {
    return errar(s, { tipo: 'erro', reconhecido: av.reconhecido, habilidade: t.item.habilidades[0], problema: av.problema }, acoes)
  }

  t.tentativas++
  t.passouPorApoio = true
  t.nivelAjuda = 0
  if (t.origem === 'bloco' || t.origem === 'conversa') adicionarDificuldade(s, t.item.habilidades[0], t)

  s.suspenso = { tentando: t, fraseBase: s.fraseBase, ultimaAceita: s.ultimaAceita }
  s.fraseBase = null
  s.ultimaAceita = null
  s.fila.unshift(
    ...apoio.degraus.map(
      (item): Passo => ({ tipo: 'item', item, origem: 'apoio', contexto: 'apoio', blocoId: t.blocoId }),
    ),
    { tipo: 'retorno' },
  )
  s.atual = null

  decidir(s, `Falta pré-requisito (${av.problema}): abrir a escada "${apoioId}" e voltar depois a ${t.item.id}.`, t.item.id)
  acoes.push({ tipo: 'abrir_apoio', objetivo: apoio.objetivo, retornoA: t.item })
  avancar(s, acoes)
}

/** Depois do modelo, a frase ainda não saiu: encerra o item como pendente — nunca como dominado. */
function deixarPendente(s: Sessao, acoes: Acao[]) {
  const t = s.atual!
  concluir(s, t, 'pendente', null)
  // A cadeia continua da frase que o tutor modelou: as próximas pistas foram
  // escritas a partir dela, e o aluno acabou de ouvi-la inteira.
  if (t.item.alvo && t.origem !== 'conversa') s.ultimaAceita = t.item.alvo
  decidir(s, `Sem produção adequada mesmo após o modelo: ${t.item.id} fica pendente para revisão.`, t.item.id)
  acoes.push({ tipo: 'registrar_pendente', item: t.item, modelo: modeloDe(t.item) })
  s.atual = null
  avancar(s, acoes)
}

// ── Fila ─────────────────────────────────────────────────────────────────────

function avancar(s: Sessao, acoes: Acao[]) {
  for (;;) {
    const passo = s.fila.shift()
    if (!passo) return encerrar(s, acoes)

    switch (passo.tipo) {
      case 'item': {
        // Nova cadeia (Etapa 2 / regra "uma nova cadeia estabelece uma nova
        // frase-base"): o primeiro item de um bloco zera a memória da anterior.
        if (passo.contexto === 'cadeia' && passo.item.tipo !== 'substituicao') {
          s.fraseBase = null
          s.ultimaAceita = null
        }
        s.atual = comecar(passo)
        acoes.push({ tipo: 'solicitar', item: passo.item, contexto: passo.contexto })
        return
      }

      case 'fim_de_bloco': {
        // Critério 8: o que exigiu ajuda volta DEPOIS de outro bloco, e não
        // logo em seguida — repetir na hora mede memória de curto prazo, não
        // produção independente.
        const d = proximaRecuperacao(s, (dif) => dif.blocoId !== null && dif.blocoId !== passo.blocoId)
        if (d) agendarRecuperacao(s, d.habilidade, 'cadeia')
        continue
      }

      case 'retorno': {
        const susp = s.suspenso!
        s.suspenso = null
        s.fraseBase = susp.fraseBase
        s.ultimaAceita = susp.ultimaAceita
        s.atual = { ...susp.tentando, contexto: 'retorno' }
        decidir(s, `Escada de apoio concluída: voltar ao alvo original ${susp.tentando.item.id}.`, susp.tentando.item.id)
        acoes.push({ tipo: 'solicitar', item: susp.tentando.item, contexto: 'retorno' })
        return
      }

      case 'inicio_conversa':
        s.fraseBase = null
        s.ultimaAceita = null
        decidir(s, 'Treino controlado concluído: passar à aplicação em conversa.')
        acoes.push({ tipo: 'iniciar_conversa' })
        continue

      case 'fechamento': {
        let agendadas = 0
        while (agendadas < RECUPERACOES_NO_FECHAMENTO) {
          const d = proximaRecuperacao(s, () => true)
          if (!d) break
          agendarRecuperacao(s, d.habilidade, 'fim')
          agendadas++
        }
        s.fila.push({ tipo: 'encerrar' })
        continue
      }

      case 'encerrar':
        return encerrar(s, acoes)
    }
  }
}

function comecar(passo: Extract<Passo, { tipo: 'item' }>): Tentando {
  return {
    item: passo.item,
    origem: passo.origem,
    contexto: passo.contexto,
    blocoId: passo.blocoId,
    tentativas: 0,
    // Na repetição o aluno acabou de ouvir o modelo: começa no nível 3.
    nivelAjuda: passo.item.tipo === 'repeticao' ? 3 : 0,
    errosComModelo: 0,
    passouPorApoio: false,
    habilidadeRecuperada: passo.habilidadeRecuperada,
  }
}

function proximaRecuperacao(s: Sessao, filtro: (d: Sessao['dificuldades'][number]) => boolean) {
  return s.dificuldades.find(
    (d) => d.recuperada === null && !d.agendada && s.roteiro.recuperacao[d.habilidade] && filtro(d),
  )
}

function agendarRecuperacao(s: Sessao, habilidade: string, quando: 'cadeia' | 'fim') {
  for (const d of s.dificuldades) if (d.habilidade === habilidade) d.agendada = true
  const item = s.roteiro.recuperacao[habilidade]
  const passo: Passo = { tipo: 'item', item, origem: 'recuperacao', contexto: 'recuperacao', blocoId: null, habilidadeRecuperada: habilidade }
  if (quando === 'fim') s.fila.push(passo)
  else s.fila.unshift(passo)
  decidir(
    s,
    `Recuperar ${habilidade} em contexto novo (${item.id}) ${quando === 'fim' ? 'no fechamento' : 'depois de outro bloco'}, para testar produção independente.`,
    item.id,
  )
}

function encerrar(s: Sessao, acoes: Acao[]) {
  s.encerrada = true
  s.atual = null
  const daAula = s.resultados.filter((r) => r.origem !== 'apoio')
  const texto = (r: (typeof daAula)[number]) => r.reconhecido ?? r.alvo ?? r.itemId
  const resumo: Resumo = {
    autonomos: daAula.filter((r) => r.resultado === 'autonomo').map(texto),
    comAjuda: daAula.filter((r) => r.resultado !== 'autonomo' && r.resultado !== 'pendente').map(texto),
    pendentes: daAula.filter((r) => r.resultado === 'pendente').map((r) => r.alvo ?? r.itemId),
    recuperadas: [...new Set(s.dificuldades.filter((d) => d.recuperada === true).map((d) => d.habilidade))],
    paraRevisar: [...new Set(s.dificuldades.filter((d) => d.recuperada !== true).map((d) => d.habilidade))],
  }
  decidir(s, 'Fim do roteiro: resumir o que saiu com autonomia, o que precisou de apoio e um ponto para revisar.')
  acoes.push({ tipo: 'encerrar', resumo })
}

// ── Apoio ────────────────────────────────────────────────────────────────────

function resultadoDe(t: Tentando): Resultado {
  if (t.nivelAjuda === 3 || t.item.tipo === 'repeticao') return 'com_modelo'
  if (t.passouPorApoio) return 'apos_apoio'
  if (t.nivelAjuda > 0) return 'com_pista'
  return 'autonomo'
}

const ROTULO_RESULTADO: Record<Resultado, string> = {
  autonomo: 'sem ajuda',
  com_pista: 'depois de pista',
  com_modelo: 'depois do modelo',
  apos_apoio: 'depois da escada de apoio',
  pendente: 'pendente',
}

/**
 * Etapa 3, ajuda proporcional: 1 e 2 = PERGUNTAS em português que levam o
 * aluno a produzir o pedaço ("como se pergunta 'vocês estavam'?") — a do erro
 * previsto, a que o avaliador escreveu para este erro, ou a do roteiro; 3 = a
 * frase inteira. Inglês da resposta só aparece no nível 3, nunca antes.
 */
function conteudoDaAjuda(t: Tentando, habilidade: string | null, problema: string | null, dica?: string): string {
  const { item } = t
  const generico = problema ?? 'Tente de novo a frase inteira.'
  if (t.nivelAjuda === 1) {
    const prevista = habilidade ? item.errosPrevistos?.find((e) => e.habilidade === habilidade)?.pista : undefined
    // Erro previsto no roteiro > pista do avaliador para um erro imprevisto > a do roteiro.
    return prevista ?? dica ?? item.ajudas?.[0] ?? generico
  }
  // Nível 2: a pergunta que o avaliador escreveu para ESTE erro vale mais que a
  // genérica do item — o aluno pode estar errando outra coisa agora.
  if (t.nivelAjuda === 2) return dica ?? item.ajudas?.[1] ?? item.ajudas?.[0] ?? generico
  return modeloDe(item)
}

function modeloDe(item: Item): string {
  return item.alvo ?? item.modelo ?? item.exemplos?.[0] ?? ''
}

function subir(nivel: NivelAjuda): NivelAjuda {
  return Math.min(3, nivel + 1) as NivelAjuda
}

function concluir(s: Sessao, t: Tentando, resultado: Resultado, reconhecido: string | null) {
  s.resultados.push({ itemId: t.item.id, origem: t.origem, resultado, reconhecido, alvo: t.item.alvo ?? null })
}

function adicionarDificuldade(s: Sessao, habilidade: string, t: Tentando) {
  if (s.dificuldades.some((d) => d.habilidade === habilidade && d.itemId === t.item.id)) return
  // Se a habilidade já foi recuperada antes, um erro novo a reabre.
  const jaRecuperada = s.dificuldades.some((d) => d.habilidade === habilidade && d.recuperada !== null)
  s.dificuldades.push({
    habilidade,
    itemId: t.item.id,
    blocoId: t.blocoId,
    recuperada: null,
    agendada: false,
  })
  if (jaRecuperada) for (const d of s.dificuldades) if (d.habilidade === habilidade) d.agendada = false
}

// ── Registro (R12) ───────────────────────────────────────────────────────────

function registrar(s: Sessao, evento: Omit<Evento, 'seq'>) {
  s.registro.push({ seq: s.registro.length + 1, ...evento })
}

function decidir(s: Sessao, motivo: string, itemId?: string) {
  registrar(s, { tipo: 'decisao', itemId, motivo })
}

/** No registro, o item vai pelo id: o roteiro já tem o resto, e o log fica legível. */
function registrarAcoes(s: Sessao, acoes: Acao[]) {
  for (const a of acoes) {
    const dados = JSON.parse(
      JSON.stringify(a, (chave, valor) =>
        chave === 'item' || chave === 'retornoA' || chave === 'retomar' ? (valor as Item).id : valor,
      ),
    )
    registrar(s, { tipo: 'acao', itemId: 'item' in a ? a.item.id : undefined, dados })
  }
}
