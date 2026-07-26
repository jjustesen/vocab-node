# MegaInglês — Fluxos de Tela (v0.1)

Complementa o [PRD.md](PRD.md). Os mockups visuais estão em [mockups.html](mockups.html).

---

## 1. Mapa de telas

```
PROFESSOR (desktop/mobile)                  ALUNO (mobile)
─────────────────────────                   ──────────────
P0  Login / Cadastro                        A1  Abertura do link da tarefa
P1  Hoje (home)                             A2  Execução — questão a questão
P2  Alunos (lista)                          A3  Tela final (resultado)
P3  Ficha do aluno                          A4  Convite de cadastro (link único)
P4  Nova atividade (material+parâmetros)    A5  Painel do aluno (logado)
P5  Gerando... (estado de espera)           A6  Trilha do aluno
                                            A7  Fim de etapa (dentro da trilha)
P6  Revisão da atividade
P7  Modal de envio (link/WhatsApp)
P8  Resultado da tarefa
P9  Atividades — biblioteca
P10 Detalhe da atividade + reenvio
P11 Trilhas — lista
P12 Montar trilha
P13 Trilha na ficha do aluno
```

Navegação do professor: sidebar fixa com **Hoje · Alunos · Atividades · Agenda · Financeiro**.
Regra do PRD: uma ação principal por tela — sempre o botão indigo.

---

## 2. Fluxo A — Professor cria e envia atividade (meta < 3 min)

```
P1 Hoje ──"Nova atividade"──▶ P4 Material + parâmetros
   ──"Gerar"──▶ P5 Gerando (60–90s)
   ──▶ P6 Revisão (editar/excluir/pré-visualizar)
   ──"Enviar"──▶ P7 Modal: escolher aluno(s) → copiar link / WhatsApp
```

**Estados de P4:** vazio (dropzone) · arquivo carregado · texto colado · erro de upload.
**Estados de P5:** progresso · falha (retry sem consumir cota, RF-73).
**Estados de P6:** rascunho salvo automaticamente (RF-71).

## 3. Fluxo B — Aluno faz a tarefa (sem conta)

```
Link no WhatsApp ──▶ A1 Abertura (confirma primeiro nome, RF-21)
   ──▶ A2 Uma questão por tela, feedback imediato (RF-83/84)
   ──▶ A3 Final: nota, tempo, refazer erros (RF-86)
```

**Estados de A2:** respondendo · acerto · erro (mostra correta + explicação pt-BR) · retomada (RF-85).
**Estado de A1 retornante:** "Continuar como Júlia" (navegador lembra).

## 4. Fluxo C — Retorno ao professor

```
Aluno conclui ──▶ e-mail ao professor (RF-92)
   ──▶ P8 Resultado: acertos por questão, tempo, erros recorrentes
   ──▶ anotação para a próxima aula (grava na ficha, P3)
```

## 5. Fluxo D — Conta do aluno (criar / resetar)

```
P3 Ficha ──"Gerar link de cadastro" (RF-22)──▶ professor cola no WhatsApp
   ──▶ A4 Aluno define e-mail e cria conta (uso único, 7 dias, RF-23)
   ──▶ histórico preservado (RF-24) ──▶ A5 Painel do aluno

P3 Ficha ──menu "Resetar acesso" (RF-25)──▶ confirmação explícita
   ──▶ e-mail desvinculado + sessões derrubadas + novo link ──▶ A4
```

## 5.1 Fluxo E — Reenviar atividade já cadastrada

```
P9 Biblioteca ──"Enviar" no card──▶ P10 modal de reenvio
   ──▶ seleciona alunos (marca quem já fez e com que nota, RF-122)
   ──▶ prazo opcional + trilha opcional
   ──▶ "Enviar para N alunos" ──▶ um link por aluno (RF-121)
```

Regra: **reenvio não consome cota de IA** — é o que faz a biblioteca valer a pena para o professor e para a margem do produto.

## 5.2 Fluxo F — Criar trilha e acompanhar

```
P11 Trilhas ──"Nova trilha"──▶ P12 Montar
   ──▶ arrasta atividades da biblioteca para a sequência (RF-131)
   ──▶ "Atribuir a alunos" ──▶ TODAS as etapas são criadas de uma vez (RF-132/134)

Aluno ──▶ A6 vê a trilha inteira liberada: concluídas · atual (destaque) · disponíveis
   ──▶ faz uma etapa ──▶ A7 "Continuar agora" ──▶ emenda a próxima (RF-139)
   ──▶ pode repetir até concluir a trilha inteira numa sessão

Professor ──▶ P13 acompanha onde cada aluno está
   ──▶ não libera nada; pode cobrar, pausar, gerar reforço ou adicionar etapa
```

**Estados de etapa:** concluída (menta) · concluída abaixo do limite (manteiga, sugere reforço) · atual (destaque preto/lilás) · disponível (branco, com ação "Fazer").

**Regra que amarra o fluxo:** não existe etapa bloqueada. A ordem é roteiro, não trava — o professor monta a trilha uma vez e sai do caminho. O pior modo de falha do produto seria um aluno motivado abrir o app e não ter o que fazer.

## 6. Decisões de UI tomadas nos mockups (para aprovação)

1. **Cor primária indigo, acento âmbar** (gamificação), erro rose, acerto emerald.
2. **Home = "Hoje"**: agenda do dia + tarefas aguardando, não um dashboard de gráficos.
3. **Ficha do aluno em abas** (Resumo · Atividades · Aulas · Materiais · Pagamentos) — tudo do aluno em um lugar (RF-13).
4. Revisão de questões em **cards editáveis inline**, resposta correta sempre destacada.
5. Aluno: **uma questão por tela**, barra de progresso no topo, chip de sequência.
6. Envio via **modal**, não página — o professor não perde o contexto.
7. **Trilhas moram dentro de "Atividades"**, como uma terceira aba — não viram um quinto item de menu. Trilha é um jeito de organizar atividades, não um módulo separado.
8. **Ícones Lucide** em todo o produto; nenhum emoji na interface.
9. Biblioteca em **cards coloridos por habilidade** (leitura, gramática, listening, vocabulário), com métricas de uso no próprio card.
10. **Sem cadeados em lugar nenhum.** Nenhuma tela do aluno tem estado "bloqueado" — o produto nunca diz não para quem quer estudar.
