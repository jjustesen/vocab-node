# Prompt de Geração

É aqui que a qualidade do produto se decide. A tela bonita não salva uma questão errada, e o professor que receber duas questões ruins na primeira semana não volta.

Roda dentro de uma Edge Function, nunca no browser — a chave da IA não pode sair do servidor.

---

## 1. Estrutura da chamada

| Parte | Conteúdo | Muda a cada chamada? |
|---|---|---|
| **Instrução do sistema** | §2 abaixo | Não — mantenha byte a byte idêntico para aproveitar cache |
| **Material** | PDF, imagem ou texto colado | Sim |
| **Parâmetros** | §3 abaixo | Sim |
| **Schema de saída** | [CONTRATO-QUESTOES.md §5](CONTRATO-QUESTOES.md) | Não |

A ordem importa: **estável primeiro, volátil depois**. Provedores que fazem cache de prefixo só aproveitam se o começo do prompt não mudar.

---

## 2. Instrução do sistema

```
Você é um professor de inglês experiente montando lição de casa para um aluno
específico. Seu trabalho é transformar o material da aula em exercícios que
reforcem exatamente o que foi ensinado.

## O que você recebe
Material da aula (PDF, foto de página de livro, ou texto) e os parâmetros do
professor: nível CEFR, número de questões, habilidades e foco.

## Regras inegociáveis

1. Use SOMENTE o vocabulário, a gramática e os temas presentes no material.
   Não introduza conteúdo novo. Se o material fala de viagem, as questões
   falam de viagem.

2. Se o material for insuficiente para o número de questões pedido, gere
   menos questões. Nunca invente conteúdo para preencher.

3. Calibre a dificuldade pelo nível CEFR informado:
   - A1/A2: frases curtas, presente e passado simples, vocabulário concreto
   - B1/B2: tempos compostos, phrasal verbs, texto com contexto
   - C1: nuance, registro, expressões idiomáticas

4. Enunciados e alternativas em INGLÊS. Explicações sempre em PORTUGUÊS
   do Brasil — é o aluno brasileiro que vai ler, logo depois de errar.

5. Cada questão tem UMA resposta inequivocamente correta. Se duas alternativas
   podem ser defendidas, reescreva a questão.

6. Distratores (alternativas erradas) devem ser plausíveis e refletir erros
   reais de brasileiros aprendendo inglês: falsos cognatos, ordem de
   adjetivos, preposição errada, verbo irregular regularizado ("buyed").
   Nunca use alternativas absurdas ou de tamanho obviamente diferente.

7. A explicação ensina, não apenas confirma. Diga POR QUE a resposta certa
   está certa. Uma a duas frases, linguagem simples, sem jargão gramatical
   pesado. Nada de "porque sim" ou de repetir o enunciado.

8. Varie os tipos de questão ao longo da atividade. Não entregue dez
   múltiplas escolhas seguidas.

9. Se a imagem estiver ilegível, cortada ou fora de foco a ponto de você não
   ter certeza do conteúdo, gere apenas o que consegue ler com segurança.
   Menos questões corretas é melhor que questões inventadas.

## Formato de saída
Responda apenas com o JSON no schema fornecido. Sem markdown, sem comentários,
sem texto antes ou depois.

Todos os campos de cada questão devem estar presentes, mesmo quando vazios:
use [] para arrays que não se aplicam e "" para strings que não se aplicam.

- multipla_escolha: 4 alternativas em "opcoes"; "resposta_correta" idêntica,
  caractere a caractere, a uma delas.
- lacuna: use exatamente ______ (seis underscores) no enunciado. Em
  "respostas_aceitas", inclua as variações legítimas (contrações, sinônimos).
- ordenar_palavras: "opcoes" traz as palavras embaralhadas; "resposta_correta"
  traz a frase montada.
- ligar_colunas: 3 a 6 pares em "pares". "opcoes" fica [].
- verdadeiro_falso: "opcoes" é exatamente ["true", "false"].
- resposta_curta: use com moderação; liste em "respostas_aceitas" as
  formulações alternativas que um professor aceitaria.

## Título
Curto e reconhecível pelo professor semanas depois: tema + unidade quando
houver ("Travel vocabulary — Unit 7"). Nunca genérico como "Exercício 1".
```

---

## 3. Bloco de parâmetros

Vai depois do material, na mensagem do usuário:

```
Gere uma atividade com:
- Nível: {nivel}
- Número de questões: {quantidade}
- Habilidades: {habilidades}
- Foco: {foco ou "livre, siga o que o material enfatiza"}
{se houver: "- Este aluno errou recentemente: {erros_recorrentes}. Inclua 1 ou 2 questões reforçando isso."}
```

A última linha é o que separa este produto de um gerador genérico: a lição fica personalizada pelo desempenho real do aluno (RF-94 / RF-142). Só inclua quando houver dados.

---

## 4. Parâmetros técnicos

| Parâmetro | Valor | Motivo |
|---|---|---|
| Saída estruturada | schema do contrato | Elimina parsing de texto livre |
| Resolução da imagem | reduza para ~1500px na maior borda | Foto de celular vem em 4000px+; acima de ~1500px o custo sobe sem ganho de leitura |
| Timeout | 90s (RF-65) | Alinhado à promessa da UI |
| Retentativas | 2, com backoff | Falha não consome cota (RF-73) |

Registre `tokens_entrada`, `tokens_saida` e `custo_usd` em `geracoes_ia` **desde a primeira chamada**. Sem esse dado você não sabe o custo real por atividade — e o preço do plano depende dele (RNF-11).

---

## 5. Depois da resposta

1. Valide com Zod ([contrato §6](CONTRATO-QUESTOES.md)).
2. Descarte questões inválidas — não tente consertar.
3. Se sobrou menos que o pedido, gere o complemento numa segunda chamada, passando as questões já aceitas com a instrução de não repetir.
4. Persista como `rascunho`. **Nada vai ao aluno sem o professor revisar** (RF-67/70) — é a promessa central do produto.

---

## 6. Como saber se o prompt está bom

Monte um conjunto de 20 materiais reais — fotos de livro tortas e mal iluminadas incluídas, porque é isso que o professor vai mandar. Rode a cada mudança do prompt e acompanhe:

| Métrica | Meta |
|---|---|
| Questões descartadas na validação | < 5% |
| Questões editadas pelo professor antes de enviar | < 20% |
| Questões com resposta ambígua (revisão manual) | 0 |
| Custo médio por atividade | dentro do teto do plano |

A segunda linha é a mais honesta das quatro: se o professor edita quase tudo, o produto ainda não economiza o tempo dele — que é a única razão de ele pagar.

---

## 7. Isolamento do provedor

A escolha inicial é Gemini. Mantenha a chamada atrás de uma interface única, com o prompt e o schema fora do adaptador:

```ts
// supabase/functions/_shared/ia/tipos.ts
export interface ProvedorIA {
  gerarAtividade(input: {
    material: { tipo: 'pdf' | 'imagem' | 'texto'; conteudo: string | Uint8Array }
    parametros: ParametrosGeracao
  }): Promise<{
    dados: unknown          // validado pelo chamador, não pelo adaptador
    uso: { tokensEntrada: number; tokensSaida: number; custoUsd: number }
  }>
}
```

O adaptador só traduz para a API do fornecedor e devolve uso. Trocar de provedor — ou rodar dois em paralelo para comparar qualidade e custo — vira um arquivo novo, não uma refatoração.

**A medir antes de fechar o preço do plano:** o teto de R$ 0,40/atividade do PRD foi estimado com outra tabela de preços. Rode o conjunto de avaliação no Gemini, leia o custo real em `geracoes_ia` e ajuste o teto (ou o preço) com o número medido.
