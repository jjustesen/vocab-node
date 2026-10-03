# POC — Tutor de inglês com prática oral guiada

## 1. Objetivo

Demonstrar uma sessão em que o tutor apresenta ou solicita uma frase, escuta o aluno, avalia sua resposta e conduz substituições encadeadas. Quando necessário, oferece pistas, corrige ou reconstrói um pré-requisito antes de retomar o exercício.

A validação deve considerar a qualidade da condução pedagógica e a fluidez da interação por voz.

## 2. Escopo

A POC terá um aluno por sessão e uma única lição baseada nos materiais analisados.

**Conteúdo inicial:**

- Frases afirmativas, negativas e perguntas com *was/were*.
- Vocabulário de clima: *sunny, windy, cloudy, rainy, cold, hot*.
- Perguntas como *What was the weather like yesterday?*
- Uma sequência de apoio com *have dinner / having dinner*.
- Uma conversa curta usando o conteúdo praticado.

A POC deve permitir iniciar, concluir e reiniciar uma sessão. Cadastro, pagamento, múltiplas lições e operação em grande escala ficam para etapas posteriores.

## 3. Como deve funcionar

### Etapa 1 — Início e calibração

O tutor explica brevemente o objetivo e solicita uma frase simples em português:

> “Diga em inglês: estava ensolarado hoje de manhã.”

Se o aluno conseguir produzi-la, começa a prática. Se precisar de apoio, o tutor apresenta o modelo em inglês, verifica o sentido e pede repetição.

O nível de ajuda deve depender do desempenho do aluno.

### Etapa 2 — Substituições encadeadas

Depois de estabelecer a frase, o tutor oferece uma pista curta por vez:

| Intervenção | Resposta esperada |
|---|---|
| Frase inicial | *It was sunny this morning.* |
| “Windy.” | *It was windy this morning.* |
| “Rainy.” | *It was rainy this morning.* |
| “Yesterday.” | *It was rainy yesterday.* |

As mudanças se acumulam. Cada pista transforma a última frase aceita.

O aluno deve produzir a frase completa. A próxima pista só aparece depois da avaliação da tentativa atual.

### Etapa 3 — Correção e ajuda

Quando houver dificuldade, o tutor deve escolher uma intervenção proporcional:

1. Dar uma pista que permita autocorreção.
2. Oferecer o trecho necessário.
3. Apresentar a frase completa, se a dificuldade persistir.
4. Pedir nova produção da frase inteira.

Exemplo:

> Aluno: “They was at home.”  
> Tutor: “Com they, usamos was ou were?”  
> Aluno: “Were.”  
> Tutor: “Agora diga a frase inteira.”

Se faltar um pré-requisito, o tutor abre uma sequência curta de apoio. Por exemplo:

> *Have dinner → They are having dinner → Are they having dinner together? → Were they having dinner together?*

Ao terminar, retorna ao exercício que estava pendente.

### Etapa 4 — Aplicação em conversa

Depois do treino, o tutor faz perguntas sobre situações reais:

> “What was the weather like in your city yesterday?”

Nesse momento, o aluno responde ao conteúdo da pergunta. Diferentes respostas coerentes são válidas.

O tutor faz um acompanhamento simples e usa o vocabulário já praticado.

### Etapa 5 — Recuperação e fechamento

O tutor retoma uma estrutura que exigiu ajuda, usando outro contexto.

Ao encerrar, informa brevemente:

- O que o aluno conseguiu produzir com autonomia.
- O que ainda exigiu apoio.
- Um ponto para revisar.

## 4. Requisitos funcionais

| ID | Requisito |
|---|---|
| R01 | Permitir que o aluno fale pelo microfone e ouça as intervenções do tutor. |
| R02 | Conduzir uma solicitação por turno e esperar a resposta. |
| R03 | Usar um roteiro interno com frases-base, substituições, objetivos e respostas de referência. |
| R04 | Exibir um painel simples com estruturas e vocabulário de apoio. |
| R05 | Preservar a última frase aceita e as alterações acumuladas em cada cadeia. |
| R06 | Distinguir repetição de modelo, construção/tradução de frase, substituição e resposta em conversa. |
| R07 | Avaliar sentido, estrutura e realização da transformação solicitada, aceitando variantes naturais equivalentes. |
| R08 | Oferecer ajuda progressiva e solicitar nova tentativa depois da correção. |
| R09 | Reconstruir um pré-requisito e depois retornar ao alvo original. |
| R10 | Responder a uma dúvida do aluno e retomar a atividade pendente. |
| R11 | Recuperar posteriormente pelo menos um ponto que exigiu correção. |
| R12 | Registrar os exercícios, respostas reconhecidas, intervenções e resultados para revisão da sessão. |

## 5. Regras pedagógicas

- Uma resposta errada mantém a pista e o alvo pendentes.
- Uma nova cadeia estabelece uma nova frase-base.
- Uma mudança de sujeito deve incluir os ajustes necessários: *he was → they were*.
- Um acerto obtido após ouvir o modelo deve ser registrado como produção com ajuda.
- A correção deve priorizar um problema por vez.
- Acertos parciais podem ser reconhecidos sem declarar a frase inteira correta.
- No treino controlado, a resposta precisa realizar a transformação solicitada.
- Na conversa, o tutor deve aceitar respostas pertinentes que diferem dos exemplos.
- As respostas completas devem ser apresentadas no momento de modelagem ou ajuda, sem antecipar uma tentativa independente.
- O material da lição deve usar formas corretas, incluindo *I wasn’t* e *you weren’t*.

## 6. Requisitos da interação por voz

O tutor deve permitir que o aluno termine a resposta e se autocorrija.

Uma pausa breve não deve ser tratada automaticamente como desistência. Depois de silêncio prolongado, o tutor pode oferecer uma pista, mantendo o exercício atual.

Se o reconhecimento de voz estiver incerto, deve pedir confirmação antes de corrigir. Falhas de áudio não devem ser registradas como erros de inglês.

O aluno deve conseguir interromper a fala do tutor para perguntar ou pedir ajuda.

Para esta POC, a avaliação principal será de sentido e estrutura. Comentários específicos de pronúncia só devem ocorrer quando houver evidência confiável no áudio.

## 7. Informações que a sessão precisa preservar

- Etapa e modo de atividade.
- Frase-base e última frase aceita.
- Pista e resposta-alvo pendentes.
- Número de tentativas e nível de ajuda.
- Ponto de retorno após uma dúvida ou sequência de apoio.
- Dificuldades selecionadas para recuperação posterior.

O fluxo principal será:

**Iniciar → calibrar → solicitar → escutar → avaliar → corrigir ou substituir → recuperar → conversar → encerrar.**

## 8. Critérios de sucesso

A POC será considerada bem-sucedida quando demonstrar que:

1. O aluno consegue completar uma sessão por voz.
2. As substituições preservam corretamente as mudanças anteriores.
3. Um erro gera ajuda e nova tentativa, sem avanço prematuro.
4. Uma dúvida pode ser respondida sem perder a posição no exercício.
5. Uma sequência de apoio retorna ao alvo original.
6. Uma resposta válida em conversa é aceita mesmo sendo diferente do exemplo.
7. Uma falha de reconhecimento é tratada como incerteza de áudio.
8. Um conteúdo corrigido reaparece depois para verificar produção independente.
9. O registro da sessão permite entender por que o tutor avançou, corrigiu ou ofereceu ajuda.
