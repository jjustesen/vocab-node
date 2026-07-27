# Contrato das Questões

O formato único compartilhado por três lados: a IA que gera, o banco que guarda, e o app que renderiza. Se este documento e o código divergirem, este documento está certo.

---

## 1. Por que o formato é "flat"

O instinto seria modelar as questões como união discriminada — cada `tipo` com seus próprios campos. **Não faça isso.** Os provedores de IA aceitam apenas um subconjunto do JSON Schema em saída estruturada, e `oneOf`/`anyOf` é justamente o que costuma faltar (Gemini incluído).

Então: **um objeto plano, com campos opcionais por tipo, validado com Zod depois de receber.** A IA devolve algo simples e previsível; a validação forte acontece no nosso código, onde temos controle total.

Ganho colateral: trocar de provedor de IA não mexe no contrato.

---

## 2. Resposta esperada da IA

```json
{
  "titulo": "Travel vocabulary — Unit 7",
  "nivel": "B1",
  "habilidades": ["leitura", "vocabulario"],
  "questoes": [
    {
      "tipo": "multipla_escolha",
      "enunciado": "Last summer, we ______ to Portugal for two weeks.",
      "opcoes": ["go", "went", "gone", "going"],
      "resposta_correta": "went",
      "respostas_aceitas": [],
      "pares": [],
      "explicacao": "\"went\" é o passado simples de \"go\". Usamos past simple para ações concluídas no passado."
    }
  ]
}
```

**Todos os campos sempre presentes**, mesmo vazios. Campo ausente é a causa nº 1 de erro de parsing em saída estruturada — exigir array vazio em vez de omissão elimina a classe inteira de bug.

---

## 3. Os oito tipos

| `tipo` | `enunciado` | `opcoes` | `resposta_correta` | `respostas_aceitas` | `pares` |
|---|---|---|---|---|---|
| `multipla_escolha` | frase, com `______` se houver lacuna | 3–5 alternativas | texto exato de uma das opções | `[]` | `[]` |
| `lacuna` | frase com `______` | `[]` | a palavra/expressão correta | variantes aceitas (contrações, sinônimos) | `[]` |
| `ordenar_palavras` | instrução em pt-BR | palavras embaralhadas | a frase correta montada | `[]` | `[]` |
| `ligar_colunas` | instrução em pt-BR | `[]` | `""` | `[]` | 3–6 pares |
| `verdadeiro_falso` | a afirmação | `["true", "false"]` | `"true"` ou `"false"` | `[]` | `[]` |
| `resposta_curta` | a pergunta | `[]` | resposta modelo | outras formulações aceitas | `[]` |
| `ordenar_audio` | instrução em pt-BR | palavras da frase **+ 2–3 distratoras**, embaralhadas | a frase correta montada | `[]` | `[]` |
| `pronuncia` | instrução em pt-BR | `[]` | a frase em inglês a ler em voz alta | `[]` | `[]` |

**Regras que valem para todos:**

- O **enunciado e o conteúdo estão em inglês**; a **explicação está sempre em português** (RF-66). A explicação é lida pelo aluno logo depois de responder — é o momento de ensino do produto.
- `resposta_correta` de múltipla escolha precisa bater **caractere a caractere** com um item de `opcoes`. Não é índice, é o texto.
- Lacuna usa exatamente **seis underscores** (`______`) — o app procura esse marcador para renderizar o campo.
- `pares` só existe em `ligar_colunas`: `[{"esquerda": "luggage", "direita": "bagagem"}]`. O app embaralha a coluna direita na renderização.

**Os dois tipos com áudio (adicionados em 26/07/2026):**

- `ordenar_audio` **exige** palavras distratoras: `opcoes.length` tem que ser maior que o número de palavras da frase, e toda palavra da frase precisa de uma ficha própria (contando repetição — "the cat saw the" pede duas fichas de "the"). Sem distratora o aluno acerta usando todas as fichas, sem ouvir nada; sem ficha suficiente o exercício é insolúvel. As duas regras são `refine` do Zod, não convenção.
- O áudio de `ordenar_audio` **não é armazenado**: o `speechSynthesis` do navegador fala `resposta_correta`, que já viaja ao cliente (§7). Sem bucket, sem TTS pago. Em aparelho sem voz em inglês instalada a tela oferece ler a frase em vez de ouvir — degrada para `ordenar_palavras` em vez de travar o aluno.
- `pronuncia` guarda a gravação do aluno no bucket `audio-respostas` e a nota em `respostas.pontuacao` (0–100). `valor` guarda um JSON `{transcricao, tentativas}` — a transcrição é o que a IA **ouviu**, que pode divergir da frase-alvo, e `tentativas` é o que limita o custo (teto de 4 por questão).

---

## 4. Correção

| Tipo | Regra |
|---|---|
| `multipla_escolha`, `verdadeiro_falso` | igualdade exata |
| `lacuna`, `resposta_curta` | normaliza (minúsculas, sem acento, sem espaço nas bordas, apóstrofo unificado) e compara com `resposta_correta` + `respostas_aceitas` |
| `ordenar_palavras` | compara a frase montada, normalizada |
| `ligar_colunas` | acerto por par; a questão conta como correta só com todos os pares certos |
| `ordenar_audio` | idêntica a `ordenar_palavras` — compara a frase montada, normalizada. As fichas distratoras simplesmente sobram |
| `pronuncia` | **no servidor**: a IA ouve e dá 0–100; `correta` é derivada (nota ≥ 70, `CORTE_PRONUNCIA`) |

`resposta_curta` é a única que pode precisar de revisão humana (RF-91): quando não bate com nenhuma resposta aceita, marca como errada **mas sinaliza para o professor revisar** — a IA erra mais aqui do que o aluno.

---

## 5. Schema para saída estruturada

Passe este schema ao provedor de IA. Mantém-se dentro do subconjunto que Gemini e os demais aceitam: só `object`, `array`, `string`, `enum` e `required`.

```json
{
  "type": "object",
  "required": ["titulo", "nivel", "habilidades", "questoes"],
  "properties": {
    "titulo": { "type": "string" },
    "nivel": { "type": "string", "enum": ["A1", "A2", "B1", "B2", "C1"] },
    "habilidades": {
      "type": "array",
      "items": { "type": "string", "enum": ["leitura", "escrita", "listening", "vocabulario", "gramatica"] }
    },
    "questoes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["tipo", "enunciado", "opcoes", "resposta_correta", "respostas_aceitas", "pares", "explicacao"],
        "properties": {
          "tipo": {
            "type": "string",
            "enum": ["multipla_escolha", "lacuna", "ordenar_palavras", "ligar_colunas", "verdadeiro_falso", "resposta_curta", "pronuncia", "ordenar_audio"]
          },
          "enunciado": { "type": "string" },
          "opcoes": { "type": "array", "items": { "type": "string" } },
          "resposta_correta": { "type": "string" },
          "respostas_aceitas": { "type": "array", "items": { "type": "string" } },
          "pares": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["esquerda", "direita"],
              "properties": {
                "esquerda": { "type": "string" },
                "direita": { "type": "string" }
              }
            }
          },
          "explicacao": { "type": "string" }
        }
      }
    }
  }
}
```

---

## 6. Validação em TypeScript

Saída estruturada reduz o erro, não elimina. Valide sempre — e valide as regras que o JSON Schema não expressa (a resposta correta estar entre as opções, por exemplo).

```ts
import { z } from 'zod'

export const TIPOS_QUESTAO = [
  'multipla_escolha', 'lacuna', 'ordenar_palavras',
  'ligar_colunas', 'verdadeiro_falso', 'resposta_curta',
  'pronuncia', 'ordenar_audio',
] as const

const parSchema = z.object({
  esquerda: z.string().min(1),
  direita: z.string().min(1),
})

export const questaoSchema = z.object({
  tipo: z.enum(TIPOS_QUESTAO),
  enunciado: z.string().min(1),
  opcoes: z.array(z.string()),
  resposta_correta: z.string(),
  respostas_aceitas: z.array(z.string()),
  pares: z.array(parSchema),
  explicacao: z.string().min(1),
})
  // A regra que o JSON Schema não consegue expressar — e que a IA erra.
  .refine(
    (q) => q.tipo !== 'multipla_escolha' || q.opcoes.includes(q.resposta_correta),
    { message: 'resposta_correta precisa ser idêntica a uma das opcoes' },
  )
  .refine(
    (q) => q.tipo !== 'ligar_colunas' || q.pares.length >= 3,
    { message: 'ligar_colunas precisa de ao menos 3 pares' },
  )
  .refine(
    (q) => q.tipo !== 'lacuna' || q.enunciado.includes('______'),
    { message: 'lacuna precisa do marcador ______ no enunciado' },
  )

export const atividadeGeradaSchema = z.object({
  titulo: z.string().min(1),
  nivel: z.enum(['A1', 'A2', 'B1', 'B2', 'C1']),
  habilidades: z.array(z.enum(['leitura', 'escrita', 'listening', 'vocabulario', 'gramatica'])),
  questoes: z.array(questaoSchema).min(1),
})

export type Questao = z.infer<typeof questaoSchema>
export type AtividadeGerada = z.infer<typeof atividadeGeradaSchema>
```

**Questão que falha na validação é descartada, não corrigida na marra.** Se sobrarem menos questões do que o professor pediu, gere o complemento em vez de entregar uma atividade capenga — e registre a taxa de descarte: ela é o termômetro da qualidade do prompt.

---

## 7. O que o aluno pode ver, e quando

**Atualizado em 26/07/2026 — decisão de produto, não limitação técnica.**

> **A exceção: `pronuncia`.** Tudo abaixo vale para os outros sete tipos. Nota de fala não tem como sair do navegador — depende de chave de API — então esse tipo, e só ele, faz a tela do aluno ESPERAR uma volta ao servidor (`tarefa-pronuncia`), que já grava a resposta por conta própria. `corrigir()` lança erro se receber `pronuncia`, dos dois lados, em vez de devolver `false` calado; use `correcaoEhLocal(tipo)` antes de chamar. E o custo dela é por RESPOSTA, não por geração — cada gravação é uma chamada paga, daí o teto de tentativas.

A primeira chamada a `tarefa-obter` já devolve o gabarito **completo** de todas as questões — `resposta_correta`, `respostas_aceitas`, `pares` e `explicacao` — não só das que o aluno já respondeu. A correção acontece no navegador do aluno, na hora, com `corrigir()` (duplicada em `app/src/types/questao.ts` e `supabase/functions/_shared/correcao.ts`). O servidor grava a resposta em segundo plano, sem bloquear a tela.

| Campo | Antes de responder | Depois de responder |
|---|---|---|
| `tipo`, `enunciado`, `opcoes`, `pares` | ✅ | ✅ |
| `resposta_correta`, `respostas_aceitas` | ✅ | ✅ |
| `explicacao` | ✅ | ✅ |

**O custo assumido conscientemente:** um aluno que abrir o DevTools (aba Network ou o estado do React) vê o gabarito inteiro antes de responder qualquer coisa. Isso é aceito porque o público é lição de casa de inglês entre professor e aluno — não uma prova com peso, e não há por que investir em anti-cola aqui. Se um dia o produto precisar disso (ex.: um modo de avaliação formal), o modelo anterior — gabarito liberado questão a questão, só depois de responder — está descrito no histórico do repositório e volta a ser uma opção.

O que **continua valendo** sem exceção: o aluno nunca fala com o Postgres direto, mesmo com ou sem conta. Todo acesso passa pela Edge Function, que valida o token por hash antes de devolver qualquer coisa — isso é sobre autenticação (provar que é o dono do link), não sobre esconder o gabarito. Ver o cabeçalho de [0001_init.sql](../supabase/migrations/0001_init.sql).
