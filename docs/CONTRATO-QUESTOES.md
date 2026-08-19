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

- **`instrucao` é campo próprio, separado do `enunciado`** (migration 0011, 13/08/2026). Guarda o comando em pt-BR — "Complete a frase" — enquanto o `enunciado` fica só com a frase em inglês. Vieram juntos até então, no mesmo negrito, e o aluno não achava onde começava o inglês que importa; agora a tela dá pesos diferentes aos dois. Nos quatro tipos cuja linha acima diz "instrução em pt-BR" no `enunciado` (`ordenar_palavras`, `ligar_colunas`, `ordenar_audio`, `pronuncia`) não há frase-alvo a destacar — ali `instrucao` fica `""` e nada muda. Questões criadas antes da migration têm `instrucao` nulo: a tela divide o enunciado por heurística (comando + `:` + frase entre aspas) e, se não der, usa o comando padrão do tipo — ver `dividirEnunciado` em `app/src/types/questao.ts`. Não houve backfill: adivinhar errado num texto já aprovado pelo professor é pior que deixar como está.
- O **enunciado e o conteúdo estão em inglês**; a **explicação está sempre em português** (RF-66). A explicação é lida pelo aluno logo depois de responder — é o momento de ensino do produto.
- `resposta_correta` de múltipla escolha precisa bater **caractere a caractere** com um item de `opcoes`. Não é índice, é o texto.
- Lacuna usa exatamente **seis underscores** (`______`) — o app procura esse marcador para renderizar o campo.
- `pares` só existe em `ligar_colunas`: `[{"esquerda": "luggage", "direita": "bagagem"}]`. O app embaralha **as duas colunas** na renderização (ver §4 para o porquê de nenhuma das ordens da tela importar).

**Os dois tipos com áudio (adicionados em 26/07/2026):**

- `ordenar_audio` **exige** palavras distratoras: `opcoes.length` tem que ser maior que o número de palavras da frase, e toda palavra da frase precisa de uma ficha própria (contando repetição — "the cat saw the" pede duas fichas de "the"). Sem distratora o aluno acerta usando todas as fichas, sem ouvir nada; sem ficha suficiente o exercício é insolúvel. As duas regras são `refine` do Zod, não convenção.
- O áudio de `ordenar_audio` é gerado **uma vez, quando o professor salva a atividade** (TTS do Gemini — mesmo `generateContent`, com `responseModalities: ["AUDIO"]` — em `_shared/ia/tts.ts`), guardado no bucket privado `audio-questoes` e servido ao aluno por URL assinada de 1h em `tarefa-obter`. Chegou a ser o `speechSynthesis` do navegador (26/07/2026, revertido no mesmo dia): em teste real, boa parte dos aparelhos não tinha voz em inglês instalada, tornando o exercício impossível. Se a geração falhar ao salvar, a questão fica com `audio_path` nulo — o professor vê o aviso na ficha da atividade e pode gerar de novo; o aluno, nesse ínterim, cai no fallback de revelar o texto em vez de ouvir.
- `pronuncia` guarda a gravação do aluno no bucket `audio-respostas` e a nota em `respostas.pontuacao` (0–100). `valor` guarda a **transcrição** — o que o reconhecedor ouviu, que pode divergir da frase-alvo. A gravação é opcional: sem `MediaRecorder` o professor perde o áudio, mas o aluno não perde a resposta.

---

## 4. Correção

| Tipo | Regra |
|---|---|
| `multipla_escolha`, `verdadeiro_falso` | igualdade exata |
| `lacuna`, `resposta_curta` | normaliza (minúsculas, sem acento, sem espaço nas bordas, apóstrofo unificado) e compara com `resposta_correta` + `respostas_aceitas` |
| `ordenar_palavras` | compara a frase montada, normalizada |
| `ligar_colunas` | acerto por par; a questão conta como correta só com todos os pares certos. `valor` é um JSON de `string[]` com a "direita" de cada par, **na ordem de `pares`** — nunca na ordem da tela |
| `ordenar_audio` | idêntica a `ordenar_palavras` — compara a frase montada, normalizada. As fichas distratoras simplesmente sobram |
| `pronuncia` | `valor` é a TRANSCRIÇÃO que o `SpeechRecognition` do navegador ouviu. Nota 0–100 pela média harmônica entre cobertura e precisão da subsequência comum de palavras; `correta` = nota ≥ 70 (`CORTE_PRONUNCIA`). **Transcrição vazia não é resposta** — ver abaixo |

`resposta_curta` é a única que pode precisar de revisão humana (RF-91): quando não bate com nenhuma resposta aceita, marca como errada **mas sinaliza para o professor revisar** — a IA erra mais aqui do que o aluno.

**`pronuncia`: no CELULAR quem transcreve é o servidor** (13/08/2026). O `SpeechRecognition` do navegador é estruturalmente frágil no celular por dois motivos somados: o microfone costuma ser recurso exclusivo do aparelho, então o `MediaRecorder` e o reconhecedor disputam o mesmo mic e o segundo recebe silêncio; e o motor do Chrome depende de enviar áudio a servidores do Google, o que conexão móvel instável derruba. Havia ainda um terceiro, este nosso: `rec.start()` era chamado **depois** de um `await getUserMedia`, e a permissão de microfone só vale enquanto dura a ativação por gesto do toque — no iOS isso derrubava a leitura sem erro visível. Hoje: em aparelho de toque (`maxTouchPoints > 1` + `pointer: coarse`) o reconhecedor nem entra em campo, gravamos e `tarefa-pronuncia` transcreve com o Gemini (`_shared/ia/transcricao.ts`); no desktop segue o caminho grátis, com o servidor como rede quando ele volta vazio. **A frase-alvo nunca vai no prompt de transcrição** — sabendo o que o aluno deveria ler, o modelo devolveria exatamente isso e toda leitura viraria 100/100. No modo treino (RF-86) o cliente manda `apenas_transcrever: true`: transcreve e pontua sem gravar nada, e por isso essa chamada também escapa da trava de "atividade já concluída".

**`pronuncia`: silêncio não vira nota** (13/08/2026). Quando o reconhecedor não devolve palavra nenhuma — microfone ocupado, `no-speech`, rede caída — a transcrição vem vazia. Isso caía na mesma conta de quem leu tudo errado e virava **0/100**, com o agravante de que a lista "Não reconheci: ..." só era anexada quando a nota era maior que zero: no caso mais grave a tela ficava muda. Agora o componente para antes de enviar e mostra "não consegui te ouvir", **sem gravar resposta e sem queimar a questão**, com um escape ("seguir mesmo assim") para quem não é ouvido de jeito nenhum — senão a atividade fica impossível de concluir, já que o servidor exige resposta para toda questão. Havendo som, a transcrição aparece com as palavras divergentes sublinhadas (`compararFala`), que é o feedback possível sem análise fonética. Reler é livre: `tarefa-pronuncia` já gravava por `upsert`, então a última leitura substitui a anterior, áudio incluído.

**`ligar_colunas` envia a PRIMEIRA tentativa, não o estado final** (13/08/2026). A tela deixou de ser cinco menus suspensos e virou tocar-de-um-lado-e-do-outro, com o par certo travando na hora e o errado se desfazendo. Como par errado nunca gruda, o aluno termina **sempre** com tudo certo na tela — enviar o estado final faria toda questão desse tipo virar acerto. Então o componente guarda, para cada item da esquerda, a primeira "direita" que o aluno tentou, e é esse array que vai no `valor`. A régua vira "acertou de primeira", e nada mais precisou mudar: o formato na rede, `corrigir()` (aqui e em `_shared/correcao.ts`) e a tela de resultado do professor seguem idênticos. Efeito colateral proposital: `respostas.valor` passa a registrar o que o aluno **de fato sabia**, não o que ele conseguiu por eliminação.

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

> **`pronuncia` não é exceção a isto** (foi, por algumas horas em 26/07/2026, enquanto a nota vinha do Gemini). Quem transcreve é o `SpeechRecognition` do próprio navegador, então a nota sai local e instantânea como a de qualquer outro tipo, e `tarefa-pronuncia` roda em segundo plano só para guardar o áudio e RECALCULAR a nota a partir da transcrição — o registro que o professor vê nunca sai do que o cliente mandou.
>
> O que se mede aqui é se o reconhecedor ENTENDEU o aluno, não a qualidade fonética dele: o motor tem modelo de linguagem e puxa para o inglês plausível, então sotaque carregado passa mais fácil do que passaria com um avaliador de fonema. Trocado por custo zero de olhos abertos.

A primeira chamada a `tarefa-obter` já devolve o gabarito **completo** de todas as questões — `resposta_correta`, `respostas_aceitas`, `pares` e `explicacao` — não só das que o aluno já respondeu. A correção acontece no navegador do aluno, na hora, com `corrigir()` (duplicada em `app/src/types/questao.ts` e `supabase/functions/_shared/correcao.ts`). O servidor grava a resposta em segundo plano, sem bloquear a tela.

| Campo | Antes de responder | Depois de responder |
|---|---|---|
| `tipo`, `enunciado`, `opcoes`, `pares` | ✅ | ✅ |
| `resposta_correta`, `respostas_aceitas` | ✅ | ✅ |
| `explicacao` | ✅ | ✅ |

**O custo assumido conscientemente:** um aluno que abrir o DevTools (aba Network ou o estado do React) vê o gabarito inteiro antes de responder qualquer coisa. Isso é aceito porque o público é lição de casa de inglês entre professor e aluno — não uma prova com peso, e não há por que investir em anti-cola aqui. Se um dia o produto precisar disso (ex.: um modo de avaliação formal), o modelo anterior — gabarito liberado questão a questão, só depois de responder — está descrito no histórico do repositório e volta a ser uma opção.

O que **continua valendo** sem exceção: o aluno nunca fala com o Postgres direto, mesmo com ou sem conta. Todo acesso passa pela Edge Function, que valida o token por hash antes de devolver qualquer coisa — isso é sobre autenticação (provar que é o dono do link), não sobre esconder o gabarito. Ver o cabeçalho de [0001_init.sql](../supabase/migrations/0001_init.sql).
