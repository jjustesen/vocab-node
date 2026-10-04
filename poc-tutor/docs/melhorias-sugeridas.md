# Melhorias sugeridas — tutor oral (POC)

Ideias para a próxima fase da POC, levantadas depois dos primeiros testes reais
(03/10/2026). Nada daqui está implementado. Cada item diz o problema que
resolve, a proposta, o esforço aproximado e a prioridade sugerida.

Esforço: **P** (até 1 dia) · **M** (2–4 dias) · **G** (1 semana ou mais).

## Ordem sugerida

| # | Melhoria | Área | Esforço | Prioridade |
|---|---|---|---|---|
| 1 | Pistas em degraus por tipo de erro | Método | M | Alta |
| 2 | Revisão espaçada dentro da aula | Método | P | Alta |
| 7 | Reduzir a espera entre turnos | Voz | M | Alta |
| 8 | Tela focada na frase, não no chat | Interface | M | Alta |
| 3 | Memória entre aulas | Método | M | Média |
| 10 | Botões "não entendi", "devagar", "pular" | Interface | P | Média |
| 5 | Conversa como cenário | Método | M | Média |
| 4 | Aluno explica a regra | Método | P | Média |
| 9 | Sinais de progresso | Interface | P | Média |
| 6 | Calibrar o rigor com sessões reais | Método | P | Contínua |
| 11 | Painel do professor | Produto | G | Baixa |
| 12 | Gerar lições a partir do material | Produto | G | Baixa |

---

## Método socrático

### 1. Pistas em degraus por tipo de erro

**Problema.** Hoje a escada é fixa por número de tentativa: pergunta → pergunta
mais específica → frase pronta. O professor escolhe a pergunta pelo TIPO de
erro, e tem mais degraus antes de entregar a frase.

**Proposta.** Um repertório de degraus, escolhido pelo erro:

| Degrau | Exemplo | Quando |
|---|---|---|
| Sentido | "O que você quis dizer com isso?" | Resposta sem sentido ou fora do pedido |
| Contraste | "You was ou you were?" | Concordância, tempo verbal |
| Isolar o pedaço | "Como se diz 'vocês estavam'?" | Estrutura ou vocabulário faltando |
| Posição | "Na pergunta, o verbo vem antes ou depois do sujeito?" | Ordem das palavras |
| Lembrar a cadeia | "Qual palavra mudou na frase anterior?" | Perdeu uma mudança anterior |
| Modelo | A frase inteira | Último recurso |

O avaliador (Jev/Gemini) já classifica a habilidade; o controlador passa a
escolher o degrau pela habilidade e pelo histórico do item. Inglês da resposta
continua proibido antes do modelo.

**Onde mexe.** `src/controlador.ts` (`conteudoDaAjuda`), roteiro (degraus por
habilidade), prompt do avaliador.

### 2. Revisão espaçada dentro da aula

**Problema.** O que exigiu ajuda volta UMA vez. Um acerto logo depois da
correção mede memória de curto prazo, não domínio.

**Proposta.** Cada dificuldade volta 2–3 vezes, em contextos diferentes, com
espaço crescente (depois de 1 bloco, depois de 2) e menos ajuda a cada volta.
Só vira "dominada" após duas produções autônomas. Sai da aula uma lista de
pendências pronta para a próxima.

**Onde mexe.** `src/controlador.ts` (agenda de recuperação), roteiro (2–3
itens de recuperação por habilidade).

### 3. Memória entre aulas

**Problema.** Toda aula começa do zero: a calibração repete o básico para quem
já domina, e os pontos fracos da aula anterior se perdem.

**Proposta.** Guardar, por aluno, as habilidades dominadas e pendentes. A aula
seguinte abre retomando uma pendência ("semana passada o *were* com *you* deu
trabalho, vamos ver?") e calibra a partir do que já foi provado.

**Onde mexe.** Identificação simples do aluno (nome no navegador, sem login, na
POC), uma tabela de progresso no Supabase, o controlador lendo o histórico.

### 4. Aluno explica a regra

**Problema.** Repetir a frase certa não garante que o aluno entendeu por quê.

**Proposta.** De vez em quando, depois de uma correção: "Por que é *were* e não
*was* aqui?". O Jev julga se a explicação faz sentido (barato e rápido); o
Gemini só entra se for preciso reformular. Explicar com as próprias palavras é
o que mais fixa.

### 5. Conversa como cenário

**Problema.** A conversa são três perguntas soltas, sem fio.

**Proposta.** Um mini-cenário com começo, meio e fim ("você voltou de viagem;
me conte como estava o tempo, onde ficou, com quem"). O tutor usa o que o aluno
disse nas perguntas seguintes, anota os erros SEM interromper e corrige no fim,
como o professor faz na gravação.

### 6. Calibrar o rigor com sessões reais

**Proposta.** Usar os registros baixados das sessões para montar um conjunto de
casos reais (resposta + decisão esperada) e rodar `scripts/testar-avaliador.ts`
a cada mudança de prompt ou de limiar do Jev (`CONFIANCA_MINIMA_JEV`). Medir:
acerto da classificação, quantas vezes o Gemini foi chamado, tempo e custo.

---

## Interface e voz

### 7. Reduzir a espera entre turnos

**Problema.** 2–4 s entre o aluno terminar e o tutor responder quebram a
sensação de conversa. A maior parte é a geração da voz.

**Proposta.**
- **Streaming do TTS**: tocar o áudio enquanto é gerado (corta ~1 s).
- **Falas curtas instantâneas**: "Isso!", "Quase!" pré-sintetizadas na sessão
  ou pela voz do aparelho; voz do Gemini só nas falas longas.
- **Transcrição em fluxo**: começar a transcrever enquanto o aluno fala.
- **Fim de fala mais esperto**: hoje são 3 s fixos de silêncio; dá para
  encurtar quando a frase parece completa.

### 8. Tela focada na frase, não no chat

**Problema.** O chat esconde o que importa no método: a frase sendo
transformada. O aluno lê histórico em vez de olhar para a estrutura.

**Proposta.** Ver o protótipo [`prototipo-tela.html`](prototipo-tela.html):
- a frase em construção grande, no centro; a palavra que muda com a pista
  "entra" no lugar da antiga, e a cadeia acumulada fica visível;
- a fala do tutor como legenda, não como balão;
- a pista socrática num cartão que sobe por degraus;
- o microfone como um botão único, que mostra o volume enquanto ouve;
- decisões do tutor e custos num "modo professor", fora da vista do aluno.

### 9. Sinais de progresso

Uma trilha com as etapas da aula (calibração → cadeias → conversa →
revisão), as habilidades dominadas e as em revisão. No fim, um resumo visual
em vez de listas.

### 10. Botões que faltam

- **Não entendi a pista** → o tutor reformula a pergunta (mesmo degrau).
- **Ouvir de novo devagar** → repete a última fala mais lenta.
- **Pular** → marca o item como pendente e segue, sem travar a aula.

---

## Produto

### 11. Painel do professor

Ver as sessões de teste de cada aluno: onde travou, quantas pistas precisou,
o que dominou, custo. Hoje isso existe só no arquivo baixado pelo botão
"Registro".

### 12. Gerar lições a partir do material

Hoje o roteiro é escrito à mão. Gerar novas lições a partir do PDF e da folha
de anotações do professor (frases-base, pistas, alvos, erros previstos,
perguntas socráticas), como o app já faz com atividades — e validar com
`validarRoteiro` antes de usar.
