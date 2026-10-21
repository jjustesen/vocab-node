// Ouve o turno do aluno e CLASSIFICA a resposta. Quem decide o que o tutor faz
// depois é o controlador, no navegador (poc-tutor/src/controlador.ts) — aqui
// só se ouve e se avalia.
//
// ── Gemini ouve, Jev decide, Gemini só quando precisa ───────────────────────
//
// 1. Transcrição CEGA pelo Gemini: ele ouve o áudio sem saber o que o aluno
//    deveria ter dito. Mesma regra de _shared/ia/transcricao.ts — sabendo a
//    resposta, o modelo "ouve" a resposta, e todo "They was" vira "They were".
// 2. Jev (TypeSafe AI) classifica o texto: adequada, erro, ou "outro" (dúvida,
//    pedido de ajuda, comentário). Responde em ~300 ms, contra 2–5 s do Gemini,
//    e devolve a CONFIANÇA da decisão.
// 3. O Gemini avaliador só entra quando o Jev não basta: confiança baixa,
//    "outro" (é preciso escrever a resposta da dúvida ou a ajuda pedida),
//    conversa (é preciso reagir ao que o aluno contou) e erro onde existe
//    escada de apoio (decidir se falta a base é julgamento mais fino).
//
// Acerto e erro comuns — a maioria dos turnos — saem só com transcrição + Jev.

import { type Custo, ErroDePedido, TIMEOUT_MS } from './comum.ts'

/** ~30s de webm/opus ficam bem abaixo disto; acima, algo está errado. */
const AUDIO_MAX_BASE64 = 4 * 1024 * 1024
/** Abaixo desta confiança, a decisão do Jev vai para o Gemini conferir. */
const CONFIANCA_MINIMA_JEV = 0.8

export type PedidoDeAvaliacao = {
  audio?: { base64: string; mimeType: string }
  texto?: string
  contexto?: Record<string, unknown>
  /**
   * Fatos de gramática do material desta lição, que o avaliador tem de
   * respeitar ("I weren't" é errado…). Vêm do roteiro — no aluno, do banco,
   * nunca do navegador.
   */
  notasDoMaterial?: string
  /** Só para comparar modelos no teste do professor; sem isto, MODELO_TRANSCRICAO. */
  modeloTranscricao?: string
}

/**
 * A transcrição é o passo mais lento do turno (~2 s no Flash). O Flash-Lite
 * ouve em menos tempo; o que importa é que continue CEGO — "They was" tem de
 * sair "They was". O Flash segue julgando (o passo que precisa pensar).
 */
export const MODELO_TRANSCRICAO = Deno.env.get('TUTOR_MODELO_TRANSCRICAO') ?? 'gemini-3.5-flash-lite'
export const MODELOS_DE_TRANSCRICAO = ['gemini-3.5-flash-lite', 'gemini-3.6-flash']

type Transcricao = { texto: string; confianca: 'alta' | 'baixa' }

type AvaliacaoGemini = {
  tipo: 'adequada' | 'erro' | 'falta_prerequisito' | 'duvida' | 'pedido_ajuda' | 'parte_certa'
  habilidade?: string
  pista?: string
  problema?: string
  acerto_parcial?: string
  resposta_duvida?: string
  reacao?: string
  ajuda?: string
}

/** O que volta ao navegador — o `RespostaDoAvaliador` de poc-tutor/src/turno.ts. */
export type Avaliado = {
  transcricao: Transcricao
  avaliacao: AvaliacaoGemini | { tipo: 'audio_incerto' }
  decidiuPor: 'jev' | 'gemini' | 'audio'
  motivoGemini?: string
  jev?: ResultadoJev
  custos: Custo[]
  tempos: Record<string, number>
}

export async function avaliarTurno(chave: string, pedido: PedidoDeAvaliacao): Promise<Avaliado> {
  if (!pedido.contexto) throw new ErroDePedido('Falta o contexto do exercício.')
  if (!pedido.audio && typeof pedido.texto !== 'string') throw new ErroDePedido('Mande áudio ou texto.')
  if (pedido.audio && pedido.audio.base64.length > AUDIO_MAX_BASE64) throw new ErroDePedido('Áudio longo demais.', 413)

  const modelo = Deno.env.get('POC_TUTOR_MODELO') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
  const custos: Custo[] = []
  const tempos: Record<string, number> = {}
  const contexto = pedido.contexto

  // ── 1. O que foi dito ────────────────────────────────────────────────────
  let transcricao: Transcricao
  if (pedido.audio) {
    const inicio = Date.now()
    const modeloTranscricao = pedido.modeloTranscricao ?? MODELO_TRANSCRICAO
    const r = await chamarGemini<Transcricao>(chave, modeloTranscricao, {
      sistema: INSTRUCAO_TRANSCRICAO,
      parts: [{ inline_data: { mime_type: pedido.audio.mimeType, data: pedido.audio.base64 } }],
      schema: SCHEMA_TRANSCRICAO,
      temperatura: 0,
    })
    transcricao = r.dados
    custos.push({ servico: modeloTranscricao, ...r.uso })
    tempos.transcricaoMs = Date.now() - inicio
  } else {
    // Texto digitado: não há incerteza de reconhecimento.
    transcricao = { texto: pedido.texto!.trim(), confianca: 'alta' }
  }

  // Critério 7: sem fala, ou fala que o modelo não distinguiu com segurança,
  // é incerteza de ÁUDIO — nunca vai para a avaliação de inglês.
  if (!transcricao.texto || transcricao.confianca === 'baixa') {
    return { transcricao, avaliacao: { tipo: 'audio_incerto' }, decidiuPor: 'audio', custos, tempos }
  }

  // ── 2. Jev: certo, errado, ou não é resposta ──────────────────────────────
  let motivoGemini = 'Jev indisponível'
  const chaveJev = Deno.env.get('TYPESAFE_API_KEY')
  if (chaveJev) {
    try {
      const inicio = Date.now()
      const jev = await classificarComJev(chaveJev, contexto, transcricao.texto)
      tempos.jevMs = Date.now() - inicio
      custos.push({ servico: 'jev', entrada: jev.uso.entrada, saida: 0 })

      const conversa = contexto.modo === 'conversa'
      const apoio = contexto.apoio_disponivel === true
      if (jev.confianca < CONFIANCA_MINIMA_JEV) motivoGemini = `Jev sem certeza (${jev.classe}, ${jev.confianca})`
      else if (jev.classe === 'outro') motivoGemini = 'não é tentativa de resposta (dúvida ou pedido)'
      else if (jev.classe === 'parte') motivoGemini = 'respondeu só à pergunta da pista'
      else if (conversa) motivoGemini = 'conversa: reagir ao conteúdo'
      else if (jev.classe === 'erro' && apoio) motivoGemini = 'erro com escada de apoio disponível'
      else if (jev.classe === 'erro' && jev.habilidade === 'outra') motivoGemini = 'erro fora das habilidades do exercício'
      // A pista do roteiro só serve na primeira tentativa e para o erro que ele
      // previu. Fora disso, o Gemini escreve a pergunta para ESTE erro.
      else if (jev.classe === 'erro' && Number(contexto.nivel_ajuda ?? 0) > 0) motivoGemini = 'segunda tentativa: pergunta para este erro'
      else if (jev.classe === 'erro' && !erroPrevisto(contexto, jev.habilidade)) motivoGemini = 'erro não previsto: escrever a pergunta'
      else {
        const avaliacao: AvaliacaoGemini =
          jev.classe === 'adequada'
            ? { tipo: 'adequada' }
            : { tipo: 'erro', habilidade: jev.habilidade, problema: `erro em ${jev.habilidade}` }
        return { transcricao, avaliacao, decidiuPor: 'jev', jev, custos, tempos }
      }
    } catch (e) {
      // Jev fora do ar não pode parar a aula: o Gemini avalia sozinho.
      console.error('tutor jev:', e)
      motivoGemini = 'Jev falhou'
    }
  }

  // ── 3. Gemini: quando é preciso julgar mais fino ou escrever algo ─────────
  const inicio = Date.now()
  const r = await chamarGemini<AvaliacaoGemini>(chave, modelo, {
    sistema: instrucaoDeAvaliacao(pedido.notasDoMaterial),
    parts: [
      {
        text:
          `CONTEXTO DO EXERCÍCIO (JSON):\n${JSON.stringify(contexto, null, 2)}\n\n` +
          `RESPOSTA DO ALUNO (transcrita):\n"""${transcricao.texto}"""`,
      },
    ],
    schema: SCHEMA_AVALIACAO,
    temperatura: 0.2,
  })
  custos.push({ servico: modelo, ...r.uso })
  tempos.avaliacaoMs = Date.now() - inicio
  return { transcricao, avaliacao: r.dados, decidiuPor: 'gemini', motivoGemini, custos, tempos }
}

function erroPrevisto(contexto: Record<string, unknown>, habilidade: string): boolean {
  const previstos = (contexto.erros_previstos as { habilidade: string }[] | undefined) ?? []
  return previstos.some((e) => e.habilidade === habilidade)
}

const AULA_PARA_O_JEV =
  'Aula oral de inglês para brasileiro. Na substituição, a pista transforma a ÚLTIMA FRASE ACEITA e o resto dela deve ser preservado.'
const TRANSFORMACAO_PARA_O_JEV =
  ' Na transformação, o aluno diz pedido.frase_para_transformar transformada conforme pedido.instrucao (negativa, interrogativa, passado…); repetir a frase sem transformar é erro.'

function tipoDoPedido(contexto: Record<string, unknown>): unknown {
  return (contexto.pedido as { tipo?: unknown } | undefined)?.tipo
}

type ResultadoJev = {
  classe: 'adequada' | 'erro' | 'outro' | 'parte'
  confianca: number
  habilidade: string
  uso: { entrada: number }
}

/**
 * Duas perguntas numa chamada só: a classe da resposta e, se for erro, qual
 * habilidade falhou (entre as do exercício). O contexto vai inteiro como
 * "state" — o Jev precisa da última frase aceita para ver que "It was sunny
 * yesterday" perdeu o rainy.
 */
async function classificarComJev(chave: string, contexto: Record<string, unknown>, resposta: string): Promise<ResultadoJev> {
  const habilidades = (contexto.habilidades as string[] | undefined)?.length
    ? (contexto.habilidades as string[])
    : ['estrutura']
  const errosPrevistos = (contexto.erros_previstos as { exemplo: string; habilidade: string }[] | undefined) ?? []
  const criteriosHabilidade = Object.fromEntries(
    habilidades.map((h) => {
      const exemplos = errosPrevistos.filter((e) => e.habilidade === h).map((e) => `"${e.exemplo}"`)
      return [h, exemplos.length ? `erro em ${h} (por exemplo ${exemplos.join(', ')})` : `erro em ${h}`]
    }),
  )
  // Sem esta saída o Jev é obrigado a encaixar qualquer erro numa habilidade
  // do exercício — "It's windy" (tempo verbal) virava "adjetivo do clima", e a
  // pista do roteiro apontava para o lugar errado.
  criteriosHabilidade.outra = 'o erro é de outro tipo, fora destas habilidades (tempo verbal, sujeito, palavra trocada…)'

  const controlador = new AbortController()
  const timeoutId = setTimeout(() => controlador.abort(), 10_000)
  try {
    const r = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      signal: controlador.signal,
      body: JSON.stringify({
        model: 'jev-latest',
        state: {
          aula: AULA_PARA_O_JEV + (tipoDoPedido(contexto) === 'transformacao' ? TRANSFORMACAO_PARA_O_JEV : ''),
          exercicio: contexto,
          resposta_do_aluno: resposta,
        },
        questions: {
          classe: {
            type: 'choice',
            instructions: 'Classifique a resposta do aluno ao pedido pendente.',
            criteria: {
              adequada:
                'realiza o que foi pedido (transformação, tradução, repetição ou resposta pertinente na conversa); aceita contrações, variantes naturais equivalentes, maiúsculas, pontuação e hesitações',
              erro: 'tenta responder em inglês, mas não realiza o pedido ou erra a estrutura-alvo (inclusive perder uma mudança anterior da cadeia)',
              outro: 'não é uma tentativa de resposta: pergunta, dúvida, pedido de ajuda, "não sei", comentário em português, ou tentativa interrompida por um pedido',
              parte: 'o tutor acabou de fazer uma pergunta na pista (exercicio.ultima_ajuda) e o aluno respondeu SÓ a ela, com uma palavra ou um pedaço curto, sem dizer a frase inteira',
            },
          },
          habilidade: {
            type: 'choice',
            instructions: 'Se a resposta tiver erro, qual habilidade falhou? Se não tiver erro, escolha a mais próxima.',
            criteria: criteriosHabilidade,
          },
        },
      }),
    })
    if (!r.ok) throw new Error(`Jev respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    return {
      classe: j.answers.classe.choice,
      confianca: j.answers.classe.confidence,
      habilidade: j.answers.habilidade?.choice ?? habilidades[0],
      uso: { entrada: j.usage?.input_tokens ?? 0 },
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── Gemini (texto) ───────────────────────────────────────────────────────────

type Uso = { entrada: number; saida: number }

async function chamarGemini<T>(
  chave: string,
  modelo: string,
  { sistema, parts, schema, temperatura }: { sistema: string; parts: unknown[]; schema: unknown; temperatura: number },
): Promise<{ dados: T; uso: Uso }> {
  const controlador = new AbortController()
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controlador.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sistema }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: temperatura,
            responseMimeType: 'application/json',
            responseSchema: schema,
            // Transcrever e classificar não pedem raciocínio longo: o
            // "pensamento" era mais da metade do custo e parte da demora.
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      },
    )
    if (!resposta.ok) throw new Error(`Gemini respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`)
    const json = await resposta.json()
    const texto = json.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => typeof p.text === 'string')?.text
    if (typeof texto !== 'string') throw new Error('Gemini não devolveu conteúdo.')
    // `thoughtsTokenCount` é cobrado como saída nos modelos que "pensam".
    const m = json.usageMetadata ?? {}
    const uso = { entrada: m.promptTokenCount ?? 0, saida: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0) }
    return { dados: JSON.parse(texto) as T, uso }
  } catch (e) {
    if (controlador.signal.aborted) throw new Error(`Gemini não respondeu em ${TIMEOUT_MS / 1000}s.`)
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const INSTRUCAO_TRANSCRICAO = `Transcreva literalmente o que a pessoa disse no áudio.

Ela é brasileira e está numa aula de inglês: pode falar em inglês, em português, ou misturar os dois (por exemplo, para fazer uma pergunta ao professor).

Regras:
- Transcreva o que foi DITO, nunca o que "deveria" ter sido dito. Erros de gramática ficam como saíram: "They was at home" continua "They was at home".
- Se a pessoa se corrigiu no meio, transcreva tudo, inclusive a correção ("It is... it was sunny").
- Sem tradução, sem comentário, sem aspas.
- "confianca": "alta" se você ouviu as palavras com clareza; "baixa" se houve ruído, corte, ou palavras que você não conseguiu distinguir com segurança.
- Se não houver fala audível, "texto" vazio.`

const SCHEMA_TRANSCRICAO = {
  type: 'OBJECT',
  properties: {
    texto: { type: 'STRING' },
    confianca: { type: 'STRING', enum: ['alta', 'baixa'] },
  },
  required: ['texto', 'confianca'],
}

const INSTRUCAO_AVALIACAO = `Você avalia UMA resposta de um aluno brasileiro numa aula oral de inglês.

Você NÃO conduz a aula. Um controlador decide o próximo passo a partir da sua classificação. Não invente a próxima pergunta, não decida se avança: só classifique.

O contexto traz: o modo ("treino_controlado" ou "conversa"), o tipo de pedido (repeticao, construcao, substituicao, transformacao, conversa), o que foi pedido, a resposta de referência (alvo), variantes aceitas, a última frase aceita da cadeia e as habilidades em jogo.

TIPOS

"adequada"
- Treino controlado: a resposta realiza a transformação pedida e preserva o resto da última frase aceita. Na substituição, a pista transforma a ÚLTIMA FRASE ACEITA: se a última era "It was rainy this morning" e a pista é "Yesterday", "It was sunny yesterday" NÃO é adequada (perdeu rainy).
- Aceite contrações e formas cheias (weren't / were not), variantes naturais equivalentes (listadas ou não), diferenças de maiúscula e pontuação, hesitações ("uh", "hmm"). Se o aluno se autocorrigiu, avalie a última versão completa.
- Mudança de sujeito exige a concordância junto (he was → they were).
- Repetição: adequada se repetiu o modelo de forma compreensível.
- Substituição com pista em português ("idioma_da_pista": "pt", como "alemão"): o aluno põe o equivalente EM INGLÊS na última frase aceita ("I speak German."). Dizer a palavra em português na frase não realiza o pedido.
- Transformação: o tutor disse "frase_para_transformar" e pediu a "instrucao" (passar para a negativa, a interrogativa, o passado, a afirmativa…). Adequada se o aluno disse ESSA frase transformada, preservando o resto dela. Repetir a frase sem transformar não realiza o pedido.
- Conversa: qualquer resposta pertinente e plausível à pergunta, mesmo diferente dos exemplos (se o exemplo diz sunny e o aluno diz rainy, vale). Exija só a estrutura-alvo compreensível; erros secundários não impedem.
- Na conversa, preencha "reacao": uma frase curta e natural, EM INGLÊS, reagindo ao conteúdo ("Rainy and cold! I hope you stayed warm."). Sem fazer nova pergunta.

"erro"
- A resposta não realiza o pedido, ou tem erro na estrutura-alvo.
- "habilidade": de preferência uma das habilidades do contexto; se o erro previsto do contexto bate, use a habilidade dele.
- "problema": em português, curto, UM só — o mais importante para o objetivo do exercício.
- "pista": a pergunta que o tutor vai fazer, como o professor faz: em PORTUGUÊS, pedindo ao aluno que produza ele mesmo o pedaço que falta. O jeito preferido é perguntar como se diz o trecho em português: "Como se pergunta 'vocês estavam' em inglês?", "Como se diz 'eu estava dormindo'?". Também vale apontar o trecho errado com leveza: "Tem um errinho no aren't. Como fica 'eles não estavam'?".
  PROIBIDO na pista: qualquer palavra em inglês da RESPOSTA certa (nada de "dizemos 'I was sleeping'", nada de "Were you…", nada de "use were"). Só pode aparecer em inglês a palavra ERRADA que o próprio aluno disse, para apontá-la. Uma pergunta só, curta, terminando em "?". Nunca um diagnóstico ("Uso do presente em vez do passado").
  Se "nivel_ajuda" já é maior que 0, o aluno já recebeu uma pista: faça uma pergunta mais específica, sobre o pedaço exato que ainda está errado, ainda em português.
- "acerto_parcial": se uma parte relevante estava certa, SÓ o trecho em inglês que acertou, de 1 a 3 palavras, sem frase nem explicação ("having", "They", "at home"). O tutor vai dizer "Você acertou <isto>." Na dúvida, deixe vazio.

"falta_prerequisito"
- SÓ quando "apoio_disponivel" for true E o erro mostra que falta a base para montar a frase (ex.: não sabe que jantar é "have dinner": omite o verbo, diz "dinnering"). Erro pontual corrigível com uma pista é "erro", não isto.

"duvida"
- O aluno perguntou ou comentou algo sobre a aula em vez de tentar responder (geralmente em português: "por que é were?", "o que é windy?").
- Preencha "resposta_duvida": explicação curta (1 a 3 frases) em português, com um contraste de exemplo se ajudar. NÃO dê a resposta do item pendente.

"parte_certa"
- O contexto traz "ultima_ajuda": a pergunta que o tutor acabou de fazer. Se o aluno respondeu SÓ a ela (uma palavra ou pedaço, como "weren't" ou "they were") e a resposta está CERTA, é "parte_certa". Se respondeu só o pedaço e está errado, é "erro" (com nova "pista").

"pedido_ajuda"
- Disse que não sabe, pediu ajuda ou para repetir, ou ficou só em hesitação sem tentar a frase.
- Inclui a tentativa interrompida por um pedido ("She was... não lembro como é educada").
- Se pediu algo ESPECÍFICO (uma palavra, um pedaço), preencha "ajuda" em português com SÓ esse pedaço ("Educada é polite."). Nunca a frase inteira: o aluno ainda precisa montá-la. Pedido genérico ("não sei"): deixe vazio.

REGRAS
- Você só tem o TEXTO transcrito: não comente pronúncia.
- Corrija um problema por vez.`

/** A regra "Material:" é da lição, não do avaliador: cada roteiro traz a sua. */
function instrucaoDeAvaliacao(notasDoMaterial?: string): string {
  const notas = notasDoMaterial?.trim()
  return notas ? `${INSTRUCAO_AVALIACAO}\n- Material: ${notas}` : INSTRUCAO_AVALIACAO
}

const SCHEMA_AVALIACAO = {
  type: 'OBJECT',
  properties: {
    tipo: { type: 'STRING', enum: ['adequada', 'erro', 'falta_prerequisito', 'duvida', 'pedido_ajuda', 'parte_certa'] },
    pista: { type: 'STRING' },
    habilidade: { type: 'STRING' },
    problema: { type: 'STRING' },
    acerto_parcial: { type: 'STRING' },
    resposta_duvida: { type: 'STRING' },
    reacao: { type: 'STRING' },
    ajuda: { type: 'STRING' },
  },
  required: ['tipo'],
  // Ordem explícita: sem ela o modelo chegou a escrever a pista DENTRO de
  // resposta_duvida, com o JSON quebrado. A pista vem logo depois do problema.
  propertyOrdering: ['tipo', 'habilidade', 'problema', 'pista', 'acerto_parcial', 'ajuda', 'resposta_duvida', 'reacao'],
}
