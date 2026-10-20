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
    tipo: { type: 'STRING', enum: ['repeticao', 'construcao', 'substituicao', 'transformacao', 'conversa'] },
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
  },
  required: ['tipo', 'alvo', 'habilidades', 'ajudas'],
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

TIPOS DE ITEM (preencha só os campos do tipo; os outros ficam "" ou [])
- "repeticao": o tutor diz "modelo" (inglês) e o aluno repete. "alvo" = o próprio modelo.
- "construcao": o tutor pede "solicitacao" (português, minúsculas, sem ponto final) e o aluno diz em inglês. "alvo" = a frase natural em inglês.
- "substituicao": o tutor diz "pista" e o aluno transforma a última frase aceita. "idiomaDaPista": "pt" quando a pista é em português ("alemão", "não quero", "comeu?"), "en" quando é em inglês. "alvo" = a frase inteira transformada.
- "transformacao": o tutor diz "modelo" (uma frase em inglês) e a "instrucao" ("Passe para a negativa", "Passe para a pergunta", "Passe para o passado", "Passe para a afirmativa"). "alvo" = a frase transformada.
- "conversa": "pergunta" (inglês) sobre a vida do aluno; "criterio" (português) diz o que conta como resposta pertinente; "exemplos" (2–3 respostas em inglês); "acompanhamentos" (1–2 perguntas de seguimento). "alvo" = "".

COMO LER UMA PÁGINA DE DRILLINGS
- Cada seção ("Verbs practice", "Vocabulary", "Useful expressions", "Grammar", "Practice", "Change into …") vira um bloco, na ordem da página. "nome" = 1–2 palavras em português ("Verbos", "Vocabulário", "Expressões", "Gramática", "Negativa", "Passado").
- Cada linha numerada "A / B / C" é uma cadeia dentro do bloco:
  - A em NEGRITO e em inglês → "repeticao" com modelo = A. Se B for só a tradução de A, pule B.
  - A em português → "construcao" com solicitacao = A.
  - Cada elemento seguinte → "substituicao" com a pista como está escrita (corrija só a grafia) e alvo = a frase anterior transformada por ela, mantendo o resto.
  - Verbos soltos ("Falar / Eu falo / Você fala"): construcao "falar" → "To speak."; depois substituicao "eu falo" → "I speak."; "você fala" → "You speak.".
  - "Eu queria - quis" = duas traduções da mesma forma inglesa ("I wanted.").
- "Change into negative / interrogative / past / affirmative" → um bloco de "transformacao", um item por frase. Corrija erros de digitação e maiúsculas da frase (French, English, "don't").
- Mantenha TODAS as linhas da página: o professor quer a atividade como ela é. Corrija só erros de digitação.

EM CADA ITEM
- "habilidades": 1–2 ids em snake_case, coerentes na lição inteira ("negativa_dont", "passado_irregular", "pergunta_do", "verbo_to_speak").
- "ajudas": exatamente 2, em português, do geral para o específico. Nunca escreva a resposta em inglês na dica.
- "errosPrevistos": nos itens principais, 1–2 erros típicos de brasileiro ("I no speak", "You speak English?", "I didn't went", "She don't", "I like eat"), cada um com a habilidade (uma das do item) e uma pista em português que não entrega a resposta.
- "variantes": formas equivalentes que também valem (contração e forma cheia: "I don't" / "I do not"; números por extenso ou não).
- "apoio": o id de um apoio, só no item que precisa dele; senão "".

O RESTO DA LIÇÃO
- "titulo": curto, em português, com o tema da página. "abertura": uma frase em português dizendo o que vamos praticar.
- "apoios": 1 escada de pré-requisito (3–4 degraus, cada degrau é um item) para o ponto em que o aluno mais costuma travar; "id" em snake_case.
- "conversa": 3 itens sobre o tema da página.
- "recuperacao": 1 item por habilidade principal, em contexto NOVO (outra frase, mesma habilidade), tipo "construcao" ou "transformacao".
- "habilidades": TODAS as habilidades usadas, cada uma com "curto" (rótulo de 1–3 palavras, "didn't", "do na pergunta") e "resumo" (como o tutor diz no fim: "o didn't com o verbo na forma básica").
- "painel" (a folha de apoio que o aluno vê): estruturas, vocabulário (en/pt), exemplos e alertas úteis. NUNCA coloque no painel uma frase que seja resposta de um item: use outros exemplos.
- "notasParaAvaliador": 2–4 frases em português com os fatos de gramática que o avaliador precisa respeitar NESTA lição (o que é certo, o que é erro, o que é equivalente).

EXEMPLO DE UMA CADEIA E UMA TRANSFORMAÇÃO (formato)
Página: "1. **I speak English.** / Eu falo inglês / alemão" e "Change into negative: 1. I eat bread."
Itens: {"tipo":"repeticao","modelo":"I speak English.","alvo":"I speak English.","habilidades":["verbo_speak"],"ajudas":["Escute de novo e repita a frase inteira.","Comece com o sujeito: eu."], …}
{"tipo":"substituicao","pista":"alemão","idiomaDaPista":"pt","alvo":"I speak German.","variantes":[],"habilidades":["idioma"],"ajudas":["Como se diz 'alemão' em inglês?","É o nome da língua da Alemanha, começa com G."], …}
{"tipo":"transformacao","modelo":"I eat bread.","instrucao":"Passe para a negativa","alvo":"I don't eat bread.","variantes":["I do not eat bread."],"habilidades":["negativa_dont"],"ajudas":["Na negativa do presente, que palavra entra antes do verbo?","Com I, usamos don't. Onde ele entra?"],"errosPrevistos":[{"exemplo":"I no eat bread.","habilidade":"negativa_dont","pista":"Em inglês não usamos 'no' antes do verbo. Qual palavra usamos?"}], …}

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

const TIPOS = new Set(['repeticao', 'construcao', 'substituicao', 'transformacao', 'conversa'])
const MAX_BLOCOS = 12
const MAX_ITENS = 40

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
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

  const item = (i: ItemIA, itemId: string) => {
    const tipo = TIPOS.has(texto(i.tipo)) ? texto(i.tipo) : 'construcao'
    const habilidades = unicos(lista(i.habilidades).map(slug))
    const errosPrevistos = (i.errosPrevistos ?? [])
      .map((e) => ({ exemplo: texto(e.exemplo), habilidade: slug(texto(e.habilidade)), pista: texto(e.pista) }))
      .filter((e) => e.exemplo && e.pista && e.habilidade)
    // O validador exige o erro previsto dentro das habilidades do item.
    for (const e of errosPrevistos) if (!habilidades.includes(e.habilidade)) habilidades.push(e.habilidade)
    if (!habilidades.length) habilidades.push('estrutura')

    const so = (campo: string, valor: string) => (valor ? { [campo]: valor } : {})
    const soLista = (campo: string, valor: string[]) => (valor.length ? { [campo]: valor } : {})
    const apoio = slug(texto(i.apoio))
    return {
      id: itemId,
      tipo,
      ...(tipo === 'construcao' ? so('solicitacao', texto(i.solicitacao)) : {}),
      ...(tipo === 'substituicao' ? so('pista', texto(i.pista)) : {}),
      ...(tipo === 'substituicao' && texto(i.idiomaDaPista) === 'pt' ? { idiomaDaPista: 'pt' } : {}),
      ...(tipo === 'repeticao' || tipo === 'transformacao' ? so('modelo', texto(i.modelo)) : {}),
      ...(tipo === 'transformacao' ? so('instrucao', texto(i.instrucao)) : {}),
      ...(tipo === 'conversa'
        ? {
            ...so('pergunta', texto(i.pergunta)),
            ...so('criterio', texto(i.criterio)),
            ...soLista('exemplos', lista(i.exemplos)),
            ...soLista('acompanhamentos', lista(i.acompanhamentos)),
          }
        : {}),
      ...(tipo !== 'conversa' ? so('alvo', texto(i.alvo) || (tipo === 'repeticao' ? texto(i.modelo) : '')) : {}),
      ...soLista('variantes', unicos(lista(i.variantes))),
      habilidades,
      ...soLista('ajudas', lista(i.ajudas).slice(0, 2)),
      ...(errosPrevistos.length ? { errosPrevistos } : {}),
      ...(apoio && idsDeApoio.has(apoio) ? { apoio } : {}),
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
        itens: (b.itens ?? []).slice(0, MAX_ITENS).map((i, n) => item(i, `${blocoId}.${n + 1}`)),
      }
    })
  const primeiro = blocos[0]?.itens[0] as Record<string, unknown> | undefined
  if (primeiro) primeiro.calibracao = true

  const apoios: Record<string, { objetivo: string; degraus: ReturnType<typeof item>[] }> = {}
  for (const a of apoiosIA) {
    const apoioId = slug(texto(a.id))
    apoios[apoioId] = {
      objetivo: texto(a.objetivo) || apoioId,
      degraus: (a.degraus ?? []).slice(0, 8).map((d, n) => item(d, `${apoioId}.${n + 1}`)),
    }
  }

  const recuperacao: Record<string, ReturnType<typeof item>> = {}
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

  const painel = l.painel ?? {}
  return {
    id,
    titulo: texto(l.titulo) || 'Lição nova',
    abertura: texto(l.abertura) || 'Vamos praticar.',
    notasParaAvaliador: texto(l.notasParaAvaliador),
    painel: {
      estruturas: unicos(lista(painel.estruturas)),
      vocabulario: (painel.vocabulario ?? [])
        .map((v) => ({ en: texto(v.en), pt: texto(v.pt) }))
        .filter((v, i, todos) => v.en && v.pt && todos.findIndex((o) => o.en === v.en) === i),
      exemplos: unicos(lista(painel.exemplos)),
      alertas: unicos(lista(painel.alertas)),
    },
    blocos,
    apoios,
    conversa: (l.conversa ?? []).slice(0, 6).map((c, n) => item({ ...c, tipo: 'conversa' }, `conversa.${n + 1}`)),
    recuperacao,
    nomes: { blocos: nomesDosBlocos, habilidades },
  }
}
