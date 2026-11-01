/**
 * A lição do tutor gerada pela IA a partir do material do professor (a página
 * de "drillings"): o schema que o Gemini preenche, o prompt, e a conversão para
 * o `Roteiro` de poc-tutor/src/tipos.ts.
 *
 * O schema não é o Roteiro: o Gemini não aceita mapas (`additionalProperties`),
 * então apoios, recuperação e nomes vêm como listas, e os ids não vêm — quem os
 * dá é `paraRoteiro`, que também garante as regras fáceis de garantir por código
 * (primeiro item com calibração, erro previsto dentro das habilidades do item).
 * O resto o professor revisa no editor, que roda o `validarRoteiro`.
 */

// ── Schema ───────────────────────────────────────────────────────────────────

const STR = { type: 'STRING' }
const LISTA = { type: 'ARRAY', items: STR }

const ITEM = {
  type: 'OBJECT',
  properties: {
    tipo: { type: 'STRING', enum: ['repeticao', 'modelagem', 'construcao', 'substituicao', 'transformacao', 'conversa'] },
    solicitacao: STR,
    pista: STR,
    idiomaDaPista: { type: 'STRING', enum: ['pt', 'en'] },
    modelo: STR,
    instrucao: STR,
    pergunta: STR,
    criterio: STR,
    exemplos: LISTA,
    acompanhamentos: LISTA,
    alvo: STR,
    variantes: LISTA,
    habilidades: LISTA,
    ajudas: LISTA,
    errosPrevistos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { exemplo: STR, habilidade: STR, pista: STR },
        required: ['exemplo', 'habilidade', 'pista'],
      },
    },
    apoio: STR,
    elogio: STR,
  },
  // TODOS obrigatórios ("" ou [] quando não se aplicam): opcional, o Gemini
  // simplesmente pulava a instrução da transformação e o critério da conversa.
  required: [
    'tipo',
    'solicitacao',
    'pista',
    'idiomaDaPista',
    'modelo',
    'instrucao',
    'pergunta',
    'criterio',
    'exemplos',
    'acompanhamentos',
    'alvo',
    'variantes',
    'habilidades',
    'ajudas',
    'errosPrevistos',
    'apoio',
    'elogio',
  ],
}

export const LICAO_GERADA_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titulo: STR,
    abertura: STR,
    notasParaAvaliador: STR,
    painel: {
      type: 'OBJECT',
      properties: {
        estruturas: LISTA,
        vocabulario: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { en: STR, pt: STR }, required: ['en', 'pt'] },
        },
        exemplos: LISTA,
        alertas: LISTA,
      },
      required: ['estruturas', 'vocabulario', 'exemplos', 'alertas'],
    },
    blocos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { nome: STR, objetivo: STR, itens: { type: 'ARRAY', items: ITEM } },
        required: ['nome', 'objetivo', 'itens'],
      },
    },
    apoios: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: STR, objetivo: STR, degraus: { type: 'ARRAY', items: ITEM } },
        required: ['id', 'objetivo', 'degraus'],
      },
    },
    conversa: { type: 'ARRAY', items: ITEM },
    recuperacao: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { habilidade: STR, item: ITEM }, required: ['habilidade', 'item'] },
    },
    habilidades: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: STR, curto: STR, resumo: STR },
        required: ['id', 'curto', 'resumo'],
      },
    },
  },
  required: ['titulo', 'abertura', 'notasParaAvaliador', 'painel', 'blocos', 'apoios', 'conversa', 'recuperacao', 'habilidades'],
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export const INSTRUCAO_LICAO = `Você monta lições para um TUTOR ORAL de inglês, a partir do material de aula de um professor brasileiro (em geral uma página de "drillings"). O aluno é adulto, brasileiro, e fala as respostas em voz alta.

COMO O TUTOR FUNCIONA
- Pede uma coisa de cada vez, o aluno responde falando, e o tutor corrige UM problema por vez.
- Quando o aluno erra, o tutor dá uma dica (em português, de preferência uma pergunta) que leva o aluno a produzir ele mesmo a resposta. A dica NUNCA contém a resposta em inglês.
- Uma "cadeia" começa com uma frase-base e segue com pistas que transformam a ÚLTIMA frase aceita, preservando o resto dela.

PADRÃO OURO — É ASSIM QUE NOSSOS PROFESSORES MONTAM AS LIÇÕES
As lições de referência foram revisadas à mão por um professor; toda lição sua deve parecer com elas.
- Muita prática curta. 3–4 blocos ("Verbos", "Vocabulário", "Expressões", "Gramática"), cada um com 15–24 itens. O aluno fala muitas frases simples, não poucas frases difíceis.
- Tudo em CADEIAS CURTAS: 1 frase-base + 2 ou 3 substituições, depois uma frase-base nova. Nunca mais de 4 substituições seguidas na mesma base.
- Cada substituição troca UMA coisa (sujeito, objeto, adjetivo, marca de tempo) e mantém o resto. A frase cresce aos poucos ao longo do bloco: "I eat bread." → "I eat bread and butter." → "I eat bread and butter for breakfast." → "I ate bread and cheese yesterday.".
- Frases curtas e do dia a dia, sempre com o vocabulário da página. Nada de frase rebuscada ou longa demais para o nível.
- Como a cadeia começa depende do nível:
  - A1: a base é "construcao" (o tutor diz em português, o aluno diz em inglês) e as pistas são em PORTUGUÊS ("idiomaDaPista": "pt"). A pista é só a palavra que muda ("leite", "café", "ontem") ou o pedaço com o sujeito novo ("você bebe", "você comeu").
  - A2 em diante: a base é "repeticao" (o aluno ouve e repete a frase-modelo) e as pistas são em INGLÊS, uma palavra ou expressão curta ("She", "They", "windy", "this morning", "last weekend").
- Bloco de verbos no A1: verbo no infinitivo, presente, e passado, com I e you. Ex.: "comer" → "To eat."; "eu como" → "I eat."; substituição "você come" → "You eat."; "eu comi" → "I ate."; substituição "você comeu" → "You ate.".
- Para APRESENTAR uma expressão nova (algo que o aluno ainda não sabe montar sozinho, como "What was the weather like yesterday?"), use "modelagem" e, em seguida, 2–3 substituições a partir dela.
- Elogio com moderação: só 1 item a cada 4–6 recebe "elogio", em geral o último da cadeia. Use "Very good!", "Great!", "Exactly!" ou "Boa!". Nos outros itens, "elogio" fica "" — o tutor segue direto para o próximo pedido, e é isso que deixa a aula dinâmica.

TIPOS DE ITEM (preencha só os campos do tipo; os outros ficam "" ou [])
- "repeticao": o tutor diz "modelo" (inglês) e o aluno repete. "alvo" = o próprio modelo. "ajudas": uma só, "Escute e repita a frase.".
- "modelagem": o tutor apresenta uma frase nova, diz o que ela quer dizer e o aluno repete. "modelo" = a frase em inglês; "solicitacao" = o que ela quer dizer, em português ("Como estava o clima ontem?"); "alvo" = o próprio modelo.
- "construcao": o tutor pede "solicitacao" (português, minúsculas, sem ponto final) e o aluno diz em inglês. "alvo" = a frase natural em inglês.
- "substituicao": o tutor diz "pista" e o aluno transforma a última frase aceita. "idiomaDaPista": "pt" quando a pista é em português ("alemão", "não quero", "comeu?"), "en" quando é em inglês. "alvo" = a frase inteira transformada.
- "transformacao": o tutor diz "modelo" (uma frase em inglês) e a "instrucao" ("Passe para a negativa", "Passe para a pergunta", "Passe para o passado", "Passe para a afirmativa"). "alvo" = a frase transformada.
- "conversa": "pergunta" (inglês) sobre a vida do aluno; "criterio" (português) diz o que conta como resposta pertinente; "exemplos" (2–3 respostas em inglês); "acompanhamentos" (1–2 perguntas de seguimento). "alvo" = "".

COMO LER UMA PÁGINA DE DRILLINGS
- Cada seção ("Verbs practice", "Vocabulary", "Useful expressions", "Grammar", "Practice", "Change into …") vira um bloco, na ordem da página. "nome" = 1–2 palavras em português ("Verbos", "Vocabulário", "Expressões", "Gramática", "Negativa", "Passado").
- Cada linha numerada "A / B / C" é uma cadeia dentro do bloco:
  - A em NEGRITO e em inglês, seguida da tradução em português (B) → no A1, "construcao" com solicitacao = B e alvo = A: o aluno produz a frase, e a cadeia segue dos próximos elementos. Do A2 em diante, "repeticao" com modelo = A (ou "modelagem" com solicitacao = B, quando a frase traz uma expressão nova). Sem tradução ao lado, "repeticao" com modelo = A em qualquer nível (repetir não conta como feito sozinho).
  - A em português → "construcao" com solicitacao = A.
  - Cada elemento seguinte → "substituicao" com a pista como está escrita (corrija só a grafia) e alvo = a frase anterior transformada por ela, mantendo o resto.
  - Verbos soltos ("Falar / Eu falo / Você fala"): construcao "falar" → "To speak."; depois substituicao "eu falo" → "I speak."; "você fala" → "You speak.".
  - "Eu queria - quis" = duas traduções da mesma forma inglesa ("I wanted.").
- "Change into negative / interrogative / past / affirmative" → um bloco de "transformacao", um item por frase. Uma linha com duas frases separadas por "/" ("I eat / I drink") vira DOIS itens. Corrija erros de digitação e maiúsculas da frase (French, English, "don't").
- Mantenha TODAS as linhas da página: o professor quer a atividade como ela é. Corrija só erros de digitação. Uma linha comprida demais vira duas cadeias curtas, não uma cadeia longa.

EM CADA ITEM
- "habilidades": 1–2 ids em snake_case, coerentes na lição inteira ("verbo_eat", "passado_simples", "to_be_passado_were", "vocab_comida", "vocabulario_clima").
- "ajudas", em português, do geral para o específico, e nunca com a resposta em inglês:
  - construção: 2 ("Como se diz 'água' em inglês?", "Junte o sujeito com o verbo beber.");
  - substituição: 1 ou 2, a primeira dizendo o que trocar ("Troque 'leite' por 'café'.", "Troque o sujeito para She.") e a segunda, se houver, lembrando a regra ("Com 'they', usamos 'were'.");
  - repetição: 1, "Escute e repita a frase.".
- "errosPrevistos": na frase-base de cada cadeia e em toda substituição que troca o sujeito ou o tempo, 1–2 erros típicos de brasileiro ("She were at home.", "I eat cookies yesterday.", "I like eat", "Did your sister was...", "I drink juice in breakfast"). A pista nomeia o erro e devolve uma pergunta: "Para 'she', usamos 'was' ou 'were'?", "'Yesterday' indica passado. Qual é o passado de eat?", "to drink é beber. Como eu digo comer?". Substituições que só trocam uma palavra de vocabulário não precisam.
- "variantes": tudo o que também vale — contração e forma cheia ("I'm cold." / "I am cold."), "and" e "with" quando os dois servem ("I want bread and butter." / "I want bread with butter."), singular e plural ("fruit" / "fruits", "a cookie" / "cookies").
- "elogio": "" na maioria dos itens; uma frase curta ("Very good!", "Great!", "Exactly!", "Boa!") em 1 a cada 4–6, no fim da cadeia.
- "apoio": o id de um apoio, só no item que precisa dele; senão "".

O RESTO DA LIÇÃO
- "titulo": "<nível> - <tema curto>", ex.: "A1 - Breakfast". "abertura": começa com "Hey there student." e segue em português dizendo o que vamos praticar ("Hey there student. Hoje vamos praticar os verbos to eat e to drink no presente e no passado, além do vocabulário de café da manhã.").
- "apoios": no máximo 1 escada de pré-requisito (3–4 degraus, cada degrau é um item) para o ponto em que o aluno mais costuma travar (ex.: was × were conforme o sujeito); "id" em snake_case. Sem um ponto claro, [].
- "conversa": 3 perguntas simples sobre a vida do aluno, no tema da página e usando a estrutura da lição ("What do you usually eat for breakfast?", "Where were you yesterday morning?"). Cada uma com "criterio" objetivo ("Mencionar em inglês pelo menos um alimento que come no café da manhã."), 2–4 "exemplos" curtos, 1–2 "acompanhamentos", 2 "ajudas" que dão o começo da resposta ("Comece com 'It was...'.") e 1 erro previsto.
- "recuperacao": 1 item por habilidade principal, em contexto NOVO (outra frase, mesma habilidade), tipo "construcao" (pedido em português) ou "transformacao" (negativa, pergunta).
- "habilidades": TODAS as habilidades usadas, cada uma com "curto" (rótulo de 1–3 palavras, "eat/ate", "was no passado") e "resumo" (como o tutor diz no fim: "o uso de were com os sujeitos you, we e they").
- "painel" (a folha de apoio que o aluno vê):
  - "vocabulario": TODAS as palavras novas da página, em/pt ("sunny" / "ensolarado"); pode agrupar ("bread / butter / cheese" / "pão / manteiga / queijo");
  - "estruturas": os moldes da gramática da lição, com reticências ("I / He / She / It was...", "Were you / we / they...?", "A slice of ... / A glass of ...");
  - "alertas": 1–3 avisos curtos do erro mais comum ("Nunca use did ou didn't com o verbo to be no passado.", "Para dizer 'no café da manhã', use 'for breakfast'.");
  - "exemplos": 0–3 frases que NÃO sejam resposta de nenhum item.
  NUNCA coloque no painel uma frase que seja resposta de um item.
- "notasParaAvaliador": 2–4 frases em português com os fatos de gramática que o avaliador precisa respeitar NESTA lição e as variações que valem ("Aceite variações normais de artigo e plural, como 'fruit' e 'fruits'.").

EXEMPLOS DO PADRÃO OURO (formato; os campos vazios foram omitidos aqui)
A1, cadeia com construção e pistas em português:
{"tipo":"construcao","solicitacao":"eu bebo água","alvo":"I drink water.","habilidades":["verbo_drink","vocab_comida"],"ajudas":["Como se diz 'água' em inglês?","Junte 'eu bebo' com 'água'."]}
{"tipo":"substituicao","pista":"leite","idiomaDaPista":"pt","alvo":"I drink milk.","habilidades":["vocab_comida"],"ajudas":["Troque 'água' por 'leite'.","Como é 'leite' em inglês?"]}
{"tipo":"substituicao","pista":"café","idiomaDaPista":"pt","alvo":"I drink coffee.","habilidades":["vocab_comida"],"ajudas":["Troque 'leite' por 'café'."],"elogio":"Exactly!"}
A1, frase que cresce e vai para o passado:
{"tipo":"construcao","solicitacao":"eu comi biscoito ontem","alvo":"I ate cookies yesterday.","variantes":["I ate a cookie yesterday."],"habilidades":["verbo_eat","passado_simples"],"ajudas":["Se foi ontem, é passado. Qual é o passado de 'comer'?","Ontem vai no fim da frase."],"errosPrevistos":[{"exemplo":"I eat cookies yesterday.","habilidade":"passado_simples","pista":"'Yesterday' indica passado. Qual é o passado de eat?"}]}
A2, cadeia com repetição e pistas em inglês:
{"tipo":"repeticao","modelo":"I was at home yesterday.","alvo":"I was at home yesterday.","habilidades":["to_be_passado_was"],"ajudas":["Escute e repita a frase."]}
{"tipo":"substituicao","pista":"She","idiomaDaPista":"en","alvo":"She was at home yesterday.","habilidades":["to_be_passado_was"],"ajudas":["Troque o sujeito para She.","Mantenha o verbo no passado."],"errosPrevistos":[{"exemplo":"She were at home yesterday.","habilidade":"to_be_passado_was","pista":"Para 'she', usamos 'was' ou 'were'?"}]}
{"tipo":"substituicao","pista":"We","idiomaDaPista":"en","alvo":"We were at home yesterday.","habilidades":["to_be_passado_were"],"ajudas":["Troque o sujeito para We.","Com 'we', usamos 'were'."],"errosPrevistos":[{"exemplo":"We was at home yesterday.","habilidade":"to_be_passado_were","pista":"Com 'we', usamos 'was' ou 'were'?"}],"elogio":"Very good!"}
A2, expressão nova apresentada por modelagem:
{"tipo":"modelagem","modelo":"What was the weather like yesterday?","solicitacao":"Como estava o clima ontem?","alvo":"What was the weather like yesterday?","habilidades":["to_be_passado_pergunta","vocabulario_clima"],"errosPrevistos":[{"exemplo":"How was the weather like yesterday?","habilidade":"to_be_passado_pergunta","pista":"A estrutura correta usa 'What ... like?'."}],"elogio":"Great!"}
{"tipo":"substituicao","pista":"this morning","idiomaDaPista":"en","alvo":"What was the weather like this morning?","habilidades":["to_be_passado_pergunta"],"ajudas":["Troque 'yesterday' por 'this morning'."]}
Transformação ("Change into negative"):
{"tipo":"transformacao","modelo":"She was at school yesterday.","instrucao":"Passe para a negativa","alvo":"She wasn't at school yesterday.","variantes":["She was not at school yesterday."],"habilidades":["to_be_passado_negativa"],"ajudas":["Qual é a forma negativa de 'was'?","Não usamos didn't com o verbo to be."],"errosPrevistos":[{"exemplo":"She didn't was at school yesterday.","habilidade":"to_be_passado_negativa","pista":"Não use 'didn't' com o verbo to be. Qual é a negativa de was?"}]}

Preencha todos os campos do schema; use "" ou [] quando não se aplica.`

/** O pedido ao Gemini: o nível e, se houver, um título sugerido. */
export function blocoDoPedido(nivel: string, titulo?: string): string {
  return [`## Pedido`, `Nível da turma: ${nivel}.`, titulo ? `Título sugerido pelo professor: ${titulo}.` : ''].filter(Boolean).join('\n')
}

// ── Conversão para o Roteiro ─────────────────────────────────────────────────

type ItemIA = {
  tipo?: string
  solicitacao?: string
  pista?: string
  idiomaDaPista?: string
  modelo?: string
  instrucao?: string
  pergunta?: string
  criterio?: string
  exemplos?: string[]
  acompanhamentos?: string[]
  alvo?: string
  variantes?: string[]
  habilidades?: string[]
  ajudas?: string[]
  errosPrevistos?: { exemplo?: string; habilidade?: string; pista?: string }[]
  apoio?: string
  elogio?: string
}

type LicaoIA = {
  titulo?: string
  abertura?: string
  notasParaAvaliador?: string
  painel?: { estruturas?: string[]; vocabulario?: { en?: string; pt?: string }[]; exemplos?: string[]; alertas?: string[] }
  blocos?: { nome?: string; objetivo?: string; itens?: ItemIA[] }[]
  apoios?: { id?: string; objetivo?: string; degraus?: ItemIA[] }[]
  conversa?: ItemIA[]
  recuperacao?: { habilidade?: string; item?: ItemIA }[]
  habilidades?: { id?: string; curto?: string; resumo?: string }[]
}

/** O `Item` de poc-tutor/src/tipos.ts, do jeito que sai daqui (campos vazios não entram). */
type ItemDoRoteiro = {
  id: string
  tipo: string
  calibracao?: boolean
  solicitacao?: string
  pista?: string
  idiomaDaPista?: string
  modelo?: string
  instrucao?: string
  pergunta?: string
  criterio?: string
  exemplos?: string[]
  acompanhamentos?: string[]
  alvo?: string
  variantes?: string[]
  habilidades: string[]
  ajudas?: string[]
  errosPrevistos?: { exemplo: string; habilidade: string; pista: string }[]
  apoio?: string
  elogio?: { frase?: string }
}

const TIPOS = new Set(['repeticao', 'modelagem', 'construcao', 'substituicao', 'transformacao', 'conversa'])
const MAX_BLOCOS = 12
const MAX_ITENS = 40

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
/** Para comparar frases sem maiúscula nem pontuação — o mesmo critério de avisosDoRoteiro. */
const normal = (t: string) =>
  t
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[.,!?…"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A transformação sem instrução: o nome do bloco ("Negativa", "Passado") diz qual é. */
function instrucaoDoBloco(nome: string): string {
  const n = normal(nome)
  if (/negativ/.test(n)) return 'Passe para a negativa'
  if (/pergunt|interrogativ/.test(n)) return 'Passe para a pergunta'
  if (/passad/.test(n)) return 'Passe para o passado'
  if (/afirmativ/.test(n)) return 'Passe para a afirmativa'
  return 'Transforme a frase'
}

const CRITERIO_PADRAO = 'Qualquer resposta pertinente à pergunta, em inglês, com a estrutura da lição compreensível.'
const lista = (v: unknown) => (Array.isArray(v) ? v.map(texto).filter(Boolean) : [])
/** Sem duplicatas: a folha de apoio usa os textos como chave de lista. */
const unicos = (v: string[]) => [...new Set(v)]
const slug = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'bloco'

/** O `Roteiro` (poc-tutor/src/tipos.ts) pronto para o editor, com o `id` da linha. */
export function paraRoteiro(bruto: unknown, id: string) {
  const l = (bruto ?? {}) as LicaoIA
  const apoiosIA = (l.apoios ?? []).filter((a) => texto(a.id) && (a.degraus ?? []).length)
  const idsDeApoio = new Set(apoiosIA.map((a) => slug(texto(a.id))))

  const item = (i: ItemIA, itemId: string, nomeDoBloco = ''): ItemDoRoteiro => {
    const tipo = TIPOS.has(texto(i.tipo)) ? texto(i.tipo) : 'construcao'
    const respostas = [texto(i.alvo), ...lista(i.variantes)].filter(Boolean).map(normal)
    // Dica que já diz a frase não é dica: o editor avisaria, então nem entra.
    const semResposta = (dica: string) => !respostas.some((r) => normal(dica).includes(r))
    const habilidades = unicos(lista(i.habilidades).map(slug))
    const errosPrevistos = (i.errosPrevistos ?? [])
      .map((e) => ({ exemplo: texto(e.exemplo), habilidade: slug(texto(e.habilidade)), pista: texto(e.pista) }))
      .filter((e) => e.exemplo && e.pista && e.habilidade && semResposta(e.pista))
    // O validador exige o erro previsto dentro das habilidades do item.
    for (const e of errosPrevistos) if (!habilidades.includes(e.habilidade)) habilidades.push(e.habilidade)
    if (!habilidades.length) habilidades.push('estrutura')

    const so = (campo: string, valor: string) => (valor ? { [campo]: valor } : {})
    const soLista = (campo: string, valor: string[]) => (valor.length ? { [campo]: valor } : {})
    const apoio = slug(texto(i.apoio))
    const repete = tipo === 'repeticao' || tipo === 'modelagem'
    const elogio = texto(i.elogio)
    return {
      id: itemId,
      tipo,
      ...(tipo === 'construcao' || tipo === 'modelagem' ? so('solicitacao', texto(i.solicitacao)) : {}),
      ...(tipo === 'substituicao' ? so('pista', texto(i.pista)) : {}),
      ...(tipo === 'substituicao' && texto(i.idiomaDaPista) === 'pt' ? { idiomaDaPista: 'pt' } : {}),
      ...(repete || tipo === 'transformacao' ? so('modelo', texto(i.modelo)) : {}),
      ...(tipo === 'transformacao' ? { instrucao: texto(i.instrucao) || instrucaoDoBloco(nomeDoBloco) } : {}),
      ...(tipo === 'conversa'
        ? {
            ...so('pergunta', texto(i.pergunta)),
            criterio: texto(i.criterio) || CRITERIO_PADRAO,
            ...soLista('exemplos', lista(i.exemplos)),
            ...soLista('acompanhamentos', lista(i.acompanhamentos)),
          }
        : {}),
      ...(tipo !== 'conversa' ? so('alvo', texto(i.alvo) || (repete ? texto(i.modelo) : '')) : {}),
      ...soLista('variantes', unicos(lista(i.variantes))),
      habilidades,
      ...soLista('ajudas', lista(i.ajudas).filter(semResposta).slice(0, 2)),
      ...(errosPrevistos.length ? { errosPrevistos } : {}),
      ...(apoio && idsDeApoio.has(apoio) ? { apoio } : {}),
      // Na conversa o acerto vira a reação ao conteúdo: elogio ali não seria dito.
      ...(elogio && tipo !== 'conversa' ? { elogio: { frase: elogio } } : {}),
    }
  }

  const nomesDosBlocos: Record<string, string> = {}
  const blocos = (l.blocos ?? [])
    .filter((b) => (b.itens ?? []).length)
    .slice(0, MAX_BLOCOS)
    .map((b) => {
      let blocoId = slug(texto(b.nome))
      for (let n = 2; nomesDosBlocos[blocoId]; n++) blocoId = `${slug(texto(b.nome))}_${n}`
      nomesDosBlocos[blocoId] = texto(b.nome) || blocoId
      return {
        id: blocoId,
        objetivo: texto(b.objetivo) || texto(b.nome),
        itens: (b.itens ?? []).slice(0, MAX_ITENS).map((i, n) => item(i, `${blocoId}.${n + 1}`, texto(b.nome))),
      }
    })
  const primeiro = blocos[0]?.itens[0]
  if (primeiro) primeiro.calibracao = true

  const apoios: Record<string, { objetivo: string; degraus: ItemDoRoteiro[] }> = {}
  for (const a of apoiosIA) {
    const apoioId = slug(texto(a.id))
    apoios[apoioId] = {
      objetivo: texto(a.objetivo) || apoioId,
      degraus: (a.degraus ?? []).slice(0, 8).map((d, n) => item(d, `${apoioId}.${n + 1}`)),
    }
  }

  const recuperacao: Record<string, ItemDoRoteiro> = {}
  for (const r of l.recuperacao ?? []) {
    const habilidade = slug(texto(r.habilidade))
    if (!habilidade || !r.item || recuperacao[habilidade]) continue
    const it = item(r.item, `rec.${habilidade}`)
    // A recuperação de uma habilidade tem de treinar essa habilidade.
    if (!it.habilidades.includes(habilidade)) it.habilidades.unshift(habilidade)
    recuperacao[habilidade] = it
  }

  const habilidades: Record<string, { curto: string; resumo: string }> = {}
  for (const h of l.habilidades ?? []) {
    const hid = slug(texto(h.id))
    if (hid && texto(h.curto)) habilidades[hid] = { curto: texto(h.curto), resumo: texto(h.resumo) || texto(h.curto) }
  }

  // A folha de apoio não pode mostrar a resposta de um exercício (avisosDoRoteiro).
  const respostasDosBlocos = blocos.flatMap((b) =>
    b.itens.flatMap((i) => [i.alvo, ...(i.variantes ?? [])]).filter((x): x is string => Boolean(x)).map(normal),
  )
  const naoEntrega = (t: string) => !respostasDosBlocos.some((r) => normal(t).includes(r))
  const painel = l.painel ?? {}
  return {
    id,
    titulo: texto(l.titulo) || 'Lição nova',
    abertura: texto(l.abertura) || 'Vamos praticar.',
    notasParaAvaliador: texto(l.notasParaAvaliador),
    painel: {
      estruturas: unicos(lista(painel.estruturas)).filter(naoEntrega),
      vocabulario: (painel.vocabulario ?? [])
        .map((v) => ({ en: texto(v.en), pt: texto(v.pt) }))
        .filter((v, i, todos) => v.en && v.pt && todos.findIndex((o) => o.en === v.en) === i)
        .filter((v) => naoEntrega(`${v.en} | ${v.pt}`)),
      exemplos: unicos(lista(painel.exemplos)).filter(naoEntrega),
      alertas: unicos(lista(painel.alertas)).filter(naoEntrega),
    },
    blocos,
    apoios,
    conversa: (l.conversa ?? []).slice(0, 6).map((c, n) => item({ ...c, tipo: 'conversa' }, `conversa.${n + 1}`)),
    recuperacao,
    nomes: { blocos: nomesDosBlocos, habilidades },
  }
}
