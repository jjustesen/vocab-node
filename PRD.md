# Vocab Node — Documento de Requisitos (PRD)

**Versão:** 0.1 (rascunho para validação)
**Data:** 25/07/2026
**Referência de mercado:** [flui.so](https://flui.so) — geração automática de lição de casa a partir do material do professor.

---

## 1. Visão

Uma plataforma onde o **professor autônomo de inglês** gerencia seus alunos e aulas, e transforma o material que ele já usa em **atividades interativas** que o aluno faz pelo celular.

**Princípio central: extremamente simples.**
O professor não tem equipe, não tem tempo de configuração e resolve tudo pelo WhatsApp. Se uma funcionalidade exige tutorial, ela está errada.

Três regras de design que valem para todo o produto:

1. **Nenhuma tela do professor pode ter mais de uma ação principal.**
2. **O aluno nunca é bloqueado por cadastro** — o link abre e funciona.
3. **A IA propõe, o professor decide.** Nada é enviado ao aluno sem o professor ver antes.

### Posicionamento

Não é um Duolingo (que ensina sozinho) e não é um Google Classroom (que é genérico e pesado).
É a **extensão da aula particular**: reforça exatamente o que aquele professor ensinou naquela aula.

---

## 2. Público-alvo

**Persona primária — Professor autônomo brasileiro**
- 5 a 40 alunos, aulas 1:1 ou duplas, online e/ou presencial.
- Usa Google Meet/Zoom, PDF/livro fotografado, Google Drive e WhatsApp.
- Perde 2–5h/semana montando exercício e cobrando lição de casa.
- Sensível a preço (referência mental: R$ 30–80/mês).
- Baixa tolerância a software complexo.

**Persona secundária — Aluno**
- Adulto ou adolescente, faz a lição pelo celular, à noite, em 5–15 minutos.
- Não quer instalar app nem criar senha.
- Motivado por feedback imediato e por não decepcionar o professor.

**Fora do público nesta fase:** escolas de idiomas, coordenação pedagógica, turmas grandes, B2B.

---

## 3. Problemas a resolver (jobs)

| # | Job do professor | Dor hoje |
|---|---|---|
| J1 | Saber quem é meu aluno, o que já dei e o que falta | Anotação em caderno/planilha |
| J2 | Passar lição depois da aula sem gastar 40 min | Monta manualmente ou não passa |
| J3 | Saber se o aluno fez e onde errou | Cobra no WhatsApp, sem resposta |
| J4 | Ter o histórico do aluno para mostrar evolução | Não tem — dificulta renovação |
| J5 | Controlar quem pagou o mês | Planilha ou memória |

| # | Job do aluno | Dor hoje |
|---|---|---|
| J6 | Praticar entre as aulas sem esforço de organização | PDF perdido no WhatsApp |
| J7 | Saber se acertou, na hora | Só descobre na aula seguinte |

---

## 4. Escopo

### 4.1 MVP (v1)

- Cadastro do professor e lista de alunos.
- Agenda simples de aulas com anotação por aula.
- Biblioteca de materiais do aluno.
- **Geração de atividade por IA** a partir de material (PDF, foto, texto colado).
- Edição da atividade pelo professor antes de enviar.
- Envio por link (WhatsApp) e execução pelo aluno no celular.
- Correção automática das questões objetivas + resultado para o professor.
- Conta opcional do aluno (link de cadastro gerado pelo professor).
- **Biblioteca de atividades**: tudo o que foi criado fica salvo e pode ser reenviado a qualquer aluno.
- **Trilhas**: sequência ordenada de atividades da biblioteca, atribuída a um ou mais alunos.
- Controle manual de mensalidade (pago / pendente).

### 4.2 Fora do MVP (fases seguintes)

| Item | Fase |
|---|---|
| Exercício de **speaking** com gravação e avaliação de pronúncia | v2 |
| Pagamento integrado (Pix / cartão) e cobrança automática | v2 |
| Turmas / grupos de alunos | v2 |
| Compartilhar atividades entre professores (banco público) | v2 |
| Videochamada dentro da plataforma | Não planejado |
| Contas de escola, múltiplos professores, permissões | v3 |
| App nativo (o MVP é web responsivo / PWA) | v3 |
| Marketplace professor↔aluno | Não planejado |

---

## 5. Fluxos principais

### 5.1 Fluxo do professor (caminho feliz — meta: < 3 minutos)

```
Login → Aluno → "Nova atividade"
  → sobe PDF / tira foto da página / cola texto
  → escolhe nível (CEFR) e nº de questões
  → IA gera em ~60s
  → professor revisa, edita ou remove questões
  → "Enviar" → copia link → cola no WhatsApp
```

### 5.2 Fluxo do aluno

```
Abre link → vê nome do professor e a tarefa
  → (se não identificado) digita o primeiro nome
  → responde questão a questão, com feedback imediato
  → tela final com acertos e opção de refazer os erros
```

### 5.3 Fluxo de retorno

```
Aluno conclui → professor recebe notificação (e-mail/push)
  → abre o resultado: acertos, erros, tempo, questões mais difíceis
  → anota observação para a próxima aula
```

---

## 6. Requisitos funcionais

Prioridade: **P0** = obrigatório no MVP · **P1** = desejável no MVP · **P2** = fase seguinte.

### 6.1 Conta do professor

| ID | Requisito | Pri |
|---|---|---|
| RF-01 | Cadastro com e-mail + senha e login com Google | P0 |
| RF-02 | Recuperação de senha por e-mail | P0 |
| RF-03 | Perfil: nome, foto e nome de exibição visto pelo aluno | P0 |
| RF-04 | Exclusão da conta com remoção de dados (LGPD) | P0 |
| RF-05 | Idioma da interface do professor em pt-BR (interface do aluno em pt-BR, conteúdo em inglês) | P0 |

### 6.2 Alunos

| ID | Requisito | Pri |
|---|---|---|
| RF-10 | Criar aluno informando **apenas o nome** — e-mail é opcional | P0 |
| RF-11 | Campos opcionais: e-mail, telefone, nível CEFR, objetivo, valor da aula, dia/hora fixa, observações | P0 |
| RF-12 | Lista de alunos com busca e status (ativo / arquivado) | P0 |
| RF-13 | Ficha do aluno reunindo: aulas, materiais, atividades enviadas, desempenho e pagamentos | P0 |
| RF-14 | Arquivar aluno sem perder histórico | P0 |
| RF-15 | Importar alunos de CSV | P2 |

### 6.3 Identidade e acesso do aluno

Este é o ponto mais sensível do produto: **o aluno pode existir em dois estados** e transitar entre eles sem perder histórico.

| Estado | Como acessa | Histórico |
|---|---|---|
| **Sem conta** (padrão) | Link direto da tarefa | Preso ao registro de aluno criado pelo professor |
| **Com conta** | Login por e-mail (link mágico ou senha) | Vê todas as tarefas, passadas e futuras, em um painel |

| ID | Requisito | Pri |
|---|---|---|
| RF-20 | Toda tarefa enviada gera um **link único e não adivinhável** (token ≥ 128 bits) que abre sem login | P0 |
| RF-21 | Ao abrir um link pela primeira vez, o aluno confirma o primeiro nome; o navegador guarda a identificação para os próximos links do mesmo professor | P0 |
| RF-22 | O professor pode gerar um **link de cadastro** para um aluno específico, para enviar por WhatsApp | P0 |
| RF-23 | Pelo link de cadastro, o aluno define o próprio e-mail e cria a conta; o link é de **uso único** e expira em 7 dias | P0 |
| RF-24 | Ao criar a conta, **todo o histórico anterior daquele aluno é preservado e vinculado** ao novo login | P0 |
| RF-25 | O professor pode **resetar o acesso do aluno**: desvincula o e-mail atual, invalida as sessões ativas e gera um novo link de cadastro, **mantendo todo o histórico** | P0 |
| RF-26 | O reset exige confirmação explícita e fica registrado na ficha do aluno (data e hora) | P0 |
| RF-27 | Um e-mail só pode estar vinculado a um aluno por professor; a mesma pessoa pode ter contas com professores diferentes | P0 |
| RF-28 | Aluno logado vê um painel com tarefas pendentes, concluídas e seu desempenho | P1 |
| RF-29 | O aluno pode trocar o próprio e-mail, com confirmação no e-mail novo | P2 |
| RF-30 | Links de tarefa podem ser revogados pelo professor a qualquer momento | P1 |

### 6.4 Aulas e anotações

| ID | Requisito | Pri |
|---|---|---|
| RF-40 | Registrar aula: aluno, data, duração, status (agendada / realizada / cancelada / falta) | P0 |
| RF-41 | Anotação livre por aula ("o que foi dado", "o que revisar") | P0 |
| RF-42 | Aula recorrente (mesmo dia e horário toda semana) | P1 |
| RF-43 | Agenda da semana em uma tela | P1 |
| RF-44 | Lembrete automático da aula para o aluno | P2 |
| RF-45 | Sincronização com Google Calendar | P2 |

### 6.5 Materiais

| ID | Requisito | Pri |
|---|---|---|
| RF-50 | Upload de PDF, DOCX, imagem (foto de página de livro) e áudio, até 25 MB por arquivo | P0 |
| RF-51 | Colar texto direto, sem arquivo | P0 |
| RF-52 | Material vinculado a um aluno e/ou a uma aula | P0 |
| RF-53 | Compartilhar material com o aluno pelo mesmo tipo de link da tarefa | P1 |
| RF-54 | Importar conteúdo de um link (página web, vídeo do YouTube com legenda) | P2 |

### 6.6 Geração de atividades por IA

| ID | Requisito | Pri |
|---|---|---|
| RF-60 | Gerar atividade a partir de material selecionado ou texto colado | P0 |
| RF-61 | Parâmetros de geração: nível CEFR (A1–C1), número de questões (5–20), habilidades e foco (ex.: "past simple", "vocabulário de viagem") | P0 |
| RF-62 | Tipos de questão no MVP: múltipla escolha, completar lacuna, ordenar palavras, ligar colunas, verdadeiro/falso, resposta curta | P0 |
| RF-63 | Questões de **listening** com áudio gerado por TTS a partir do texto | P1 |
| RF-64 | Questões de **speaking** com gravação do aluno e feedback de pronúncia | P2 |
| RF-65 | Geração em até 90 segundos, com indicação de progresso | P0 |
| RF-66 | Toda questão gerada traz a resposta correta e uma explicação curta em português | P0 |
| RF-67 | O professor pode editar enunciado, alternativas, resposta correta e explicação; e excluir ou reordenar questões | P0 |
| RF-68 | O professor pode adicionar uma questão manualmente | P1 |
| RF-69 | "Gerar mais questões" sobre o mesmo material, sem repetir as existentes | P1 |
| RF-70 | Pré-visualizar a atividade exatamente como o aluno verá | P0 |
| RF-71 | Salvar como rascunho e retomar depois | P0 |
| RF-72 | Duplicar uma atividade para outro aluno | P1 |
| RF-73 | Se a geração falhar, oferecer nova tentativa sem consumir cota | P0 |

### 6.7 Envio e execução da tarefa

| ID | Requisito | Pri |
|---|---|---|
| RF-80 | Enviar atividade para um ou mais alunos, gerando um link por aluno | P0 |
| RF-81 | Botão "compartilhar no WhatsApp" com mensagem pronta | P0 |
| RF-82 | Prazo opcional; após o prazo o aluno ainda pode responder, marcado como atrasado | P1 |
| RF-83 | Interface do aluno **mobile-first**, uma questão por tela | P0 |
| RF-84 | Feedback imediato por questão: certo/errado + explicação | P0 |
| RF-85 | Progresso salvo automaticamente — se fechar o navegador, retoma de onde parou | P0 |
| RF-86 | Tela final com pontuação, tempo e opção de refazer apenas os erros | P0 |
| RF-87 | Elementos de jogo leves: barra de progresso, sequência de acertos, comemoração ao concluir | P1 |
| RF-88 | Funciona sem instalar nada; instalável como PWA | P1 |

### 6.8 Correção e acompanhamento

| ID | Requisito | Pri |
|---|---|---|
| RF-90 | Correção automática de todas as questões objetivas | P0 |
| RF-91 | Respostas curtas/abertas: a IA sugere uma correção e o professor confirma ou ajusta | P1 |
| RF-92 | Notificar o professor (e-mail) quando o aluno concluir | P0 |
| RF-93 | Resultado detalhado: acertos, erros por questão, tempo total, tentativas | P0 |
| RF-94 | Painel do aluno na ficha: % de acerto ao longo do tempo e erros recorrentes por tema | P1 |
| RF-95 | Lista de tarefas pendentes de todos os alunos, para cobrança | P1 |
| RF-96 | Exportar relatório do aluno em PDF | P2 |

### 6.9-A Biblioteca de atividades

A geração por IA custa dinheiro e tempo; reenviar não custa nada. A biblioteca é o que transforma a plataforma de "gerador de exercício" em acervo do professor — e melhora a margem a cada mês de uso.

| ID | Requisito | Pri |
|---|---|---|
| RF-120 | Toda atividade enviada fica salva na biblioteca do professor, com título, nível, habilidades e data | P0 |
| RF-121 | Reenviar uma atividade existente para um ou mais alunos, **sem consumir cota de geração** | P0 |
| RF-122 | Ao escolher os alunos, indicar quem já fez a atividade e com que nota (permitindo reenvio como reforço) | P0 |
| RF-123 | Buscar e filtrar a biblioteca por título, nível, habilidade e tema | P1 |
| RF-124 | Cada atividade exibe número de envios, média de acertos e as questões mais erradas | P1 |
| RF-125 | Duplicar uma atividade para editar uma variação sem alterar a original | P1 |
| RF-126 | Arquivar atividade sem apagar o histórico de quem já fez | P1 |
| RF-127 | Reenviar a mesma atividade ao mesmo aluno cria uma nova tentativa, preservando a anterior | P0 |

### 6.9-B Trilhas

Uma trilha é uma **sequência ordenada de atividades que já existem na biblioteca** — não se cria conteúdo dentro da trilha. Resolve o job de "não ter que lembrar de mandar a próxima lição".

**Decisão central:** a trilha é entregue **inteiramente liberada**. A ordem organiza a experiência (uma etapa por vez, com a próxima em destaque), mas nunca segura o aluno: quem quiser fazer as 6 etapas numa noite, faz. O professor não é gargalo — ele monta a trilha uma vez e sai do caminho. Isso elimina o pior modo de falha do produto: aluno motivado que abre o app e não tem o que fazer.

Trava de ordem opcional (exigir conclusão sequencial) fica para a v2, se algum professor pedir.

| ID | Requisito | Pri |
|---|---|---|
| RF-130 | Criar trilha com nome, nível e descrição | P0 |
| RF-131 | Adicionar atividades da biblioteca à trilha e reordená-las por arrastar | P0 |
| RF-132 | **Toda a trilha nasce liberada.** Nenhuma etapa é bloqueada: o aluno pode concluir a trilha inteira de uma vez, sem depender de liberação do professor nem de intervalo entre etapas | P0 |
| RF-133 | Gerar uma nova atividade já direto para uma etapa da trilha | P1 |
| RF-134 | Atribuir a trilha a um ou mais alunos; cada aluno tem progresso independente | P0 |
| RF-135 | A ordem das etapas é **roteiro sugerido, não trava**: a UI conduz para a próxima etapa, mas o aluno pode abrir qualquer etapa da lista | P1 |
| RF-136 | Visão da trilha com o progresso de todos os alunos atribuídos | P1 |
| RF-137 | Visão por aluno: etapas concluídas com nota, etapa atual e etapas ainda não iniciadas | P0 |
| RF-138 | O aluno vê a trilha como uma linha de etapas: concluídas (com nota), atual (em destaque, com botão) e disponíveis (com ação "Fazer") | P0 |
| RF-139 | Ao concluir uma etapa, a tela final oferece **"Continuar agora"** para a próxima, permitindo emendar a trilha inteira em uma sessão | P0 |
| RF-140 | Pausar a trilha de um aluno, ou removê-lo dela, sem perder o histórico | P1 |
| RF-141 | Duplicar uma trilha inteira para reaproveitar com outro aluno | P1 |
| RF-142 | Sugerir reforço quando uma etapa é concluída abaixo de um limite (ex.: < 70%) | P2 |

### 6.9-C Financeiro (mínimo)

| ID | Requisito | Pri |
|---|---|---|
| RF-100 | Registrar valor mensal ou por aula de cada aluno | P0 |
| RF-101 | Marcar mês como pago / pendente, manualmente | P0 |
| RF-102 | Tela com pendências do mês | P1 |
| RF-103 | Cobrança por Pix/cartão dentro da plataforma | P2 |

### 6.10 Planos e limites

| ID | Requisito | Pri |
|---|---|---|
| RF-110 | Plano gratuito: até 3 alunos e 10 gerações de IA por mês | P0 |
| RF-111 | Plano pago mensal: alunos ilimitados e cota alta de geração | P0 |
| RF-112 | Aviso claro ao se aproximar e ao atingir o limite | P0 |
| RF-113 | Assinatura via gateway (Stripe ou similar), com cancelamento pelo próprio professor | P0 |

---

## 7. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Web responsivo, mobile-first. O aluno usa celular; o professor usa desktop e celular |
| RNF-02 | Abertura do link da tarefa em até 2s em 4G |
| RNF-03 | Geração de atividade em até 90s (p95) |
| RNF-04 | Disponibilidade alvo: 99,5% |
| RNF-05 | Interface do professor em pt-BR; interface do aluno em pt-BR com conteúdo em inglês |
| RNF-06 | Acessibilidade: contraste AA, navegação por teclado, alvos de toque ≥ 44px |
| RNF-07 | Conformidade com a LGPD: base legal definida, política de privacidade, exclusão de dados sob solicitação |
| RNF-08 | Alunos menores de 16 anos: consentimento do responsável coletado pelo professor, com registro |
| RNF-09 | Tokens de link não sequenciais e não indexáveis (`noindex`, sem link público) |
| RNF-10 | Materiais enviados são privados; URLs de arquivo assinadas e temporárias |
| RNF-11 | Custo de IA por atividade monitorado e limitado por cota, para proteger a margem |
| RNF-12 | Logs de auditoria para reset de acesso, exclusão de aluno e alteração de e-mail |

---

## 8. Modelo de dados (essencial)

```
Professor      id, nome, email, senha_hash, plano, criado_em
Aluno          id, professor_id, nome, email?, telefone?, nivel_cefr?,
               valor?, status, criado_em
ContaAluno     id, aluno_id, email, verificado_em, ultimo_login
               (opcional — 0..1 por Aluno)
ConviteAluno   id, aluno_id, token, expira_em, usado_em
Aula           id, aluno_id, data, duracao, status, anotacao
Material       id, professor_id, aluno_id?, tipo, arquivo_url|texto, criado_em
Atividade      id, professor_id, material_id?, titulo, nivel, habilidades,
               status(rascunho|publicada|arquivada), criada_em
Questao        id, atividade_id, tipo, enunciado, opcoes, resposta_correta,
               explicacao, ordem
Trilha         id, professor_id, nome, nivel
TrilhaEtapa    id, trilha_id, atividade_id, ordem
TrilhaAluno    id, trilha_id, aluno_id, status(ativa|pausada|concluida),
               iniciada_em, concluida_em?
Atribuicao     id, atividade_id, aluno_id, token, prazo?, enviada_em,
               concluida_em?, revogada_em?, trilha_etapa_id?, tentativa
Resposta       id, atribuicao_id, questao_id, valor, correta, tempo_ms, tentativa
Pagamento      id, aluno_id, referencia_mes, valor, status, pago_em?
```

**Regra-chave 1:** o histórico pende de `Aluno`, nunca de `ContaAluno`. Por isso criar, trocar ou resetar o e-mail (RF-24, RF-25) nunca perde dados — apenas troca a `ContaAluno` vinculada.

**Regra-chave 2:** uma etapa de trilha não é um objeto novo — `Atribuicao.trilha_etapa_id` apenas marca que aquele envio pertence a uma trilha. Uma atividade enviada solta e a mesma atividade dentro de uma trilha são o mesmo mecanismo, e por isso compartilham link, correção e resultado.

**Regra-chave 3:** não existe campo de "etapa liberada" nem `etapa_atual`. Atribuir uma trilha a um aluno cria de uma vez as `Atribuicao` de **todas** as etapas. A "etapa atual" é derivada em tempo de leitura — a primeira etapa sem `concluida_em` —, nunca armazenada. Isso é o que torna impossível o aluno ficar travado esperando.

---

## 9. Métricas de sucesso

**Ativação**
- % de professores que enviam a primeira atividade nas primeiras 24h — meta: **60%**
- Tempo do cadastro até a primeira atividade enviada — meta: **< 10 min**

**Valor entregue**
- % de tarefas enviadas que são concluídas pelo aluno — meta: **70%**
- Tempo médio de montagem de uma atividade — meta: **< 3 min**

**Retenção**
- Professores ativos na semana 4 — meta: **40%**
- Conversão do gratuito para pago — meta: **8%**

**Saúde**
- Custo de IA por atividade gerada — teto: **R$ 0,40**
- Taxa de falha na geração — teto: **3%**

---

## 10. Riscos e decisões em aberto

| Risco | Mitigação |
|---|---|
| Qualidade da IA em material fotografado com má iluminação | OCR com pré-processamento; aviso ao professor quando a extração for ruim |
| Professor não confia na questão gerada | Revisão obrigatória antes do envio (RF-67, RF-70); nunca envio automático |
| Aluno abandona na primeira tela | Zero cadastro obrigatório (RF-20); uma questão por tela |
| Custo de IA come a margem | Cotas por plano (RF-110/111) e monitoramento (RNF-11) |
| Link de tarefa vazado ou compartilhado | Token longo, revogação (RF-30), sem dados sensíveis na tela do aluno |
| Concorrência direta (Flui e similares) | Diferencial: gestão do aluno + atividades no mesmo lugar, em pt-BR e no fluxo do WhatsApp |

**Stack (decidida em 26/07/2026)**

| Camada | Escolha |
|---|---|
| Front-end | React + Vite, TypeScript, Tailwind |
| Estado / dados | TanStack Query, Axios |
| Rotas | React Router |
| Back-end | Supabase (Postgres, Auth, Storage) + Edge Functions |
| IA | Gemini, atrás de uma interface de provedor |

Regra de acesso que decorre disso: **o RLS serve apenas ao professor. Todo acesso do aluno passa por Edge Function**, que autentica por posse do token (hash) — não por sessão, que o aluno não tem. Ver [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql).

**Correção no navegador, não no servidor (decidido em 26/07/2026).** `tarefa-obter` devolve o gabarito completo de todas as questões já na primeira chamada, e a correção roda na hora no navegador do aluno — sem viagem ao servidor a cada resposta, para a experiência ficar rápida. `tarefa-responder` grava o histórico em segundo plano, sem bloquear a tela. **Custo assumido:** um aluno que inspecionar a página vê o gabarito inteiro antes de responder. Aceito porque é lição de casa, não prova com peso — ver [docs/CONTRATO-QUESTOES.md §7](docs/CONTRATO-QUESTOES.md).

**Edição de atividade travada após a primeira resposta (decidido em 26/07/2026).** Título, nível e habilidades sempre podem ser editados. As questões só podem ser reescritas enquanto nenhum aluno respondeu nada — depois disso, `respostas.questao_id` referencia a questão com `on delete cascade`, e reescrever apagaria o histórico do aluno junto. Quando trava, a saída é criar uma atividade nova (RF-72, duplicar, ainda não implementado, resolveria isso).

**Geração por IA entregue como rascunho revisável, nunca como atividade pronta (decidido em 26/07/2026).** `gerar-atividade` (com JWT — o professor está logado, diferente das funções do aluno) devolve o resultado direto para a tela de revisão, o mesmo `AtividadeForm` da criação manual. Nada é persistido antes do professor clicar "Salvar atividade" — só depois disso vira um rascunho normal, sujeito às mesmas regras de edição/trava. Questão que falha na validação Zod é descartada, e uma segunda chamada complementa a diferença sem repetir o que já foi aceito (docs/PROMPT-GERACAO.md §5). Medido no primeiro uso real: atividade de 6 questões (B1) custou US$ 0,0062 com `gemini-3.6-flash` (988 tokens de entrada, 632 de saída) — bem abaixo do teto de R$ 0,40, mas a amostra é de 1 atividade.

**PDF/foto sem OCR separado — o modelo multimodal lê direto (decidido em 26/07/2026).** O roteiro (§11) chamava a etapa 3 de "OCR", mas não existe um passo de OCR isolado: a foto (redimensionada para ~1500px e reencodada em JPEG no navegador do professor) ou o PDF vão como `inline_data` na própria chamada ao Gemini, que lê o conteúdo nativamente junto com a instrução. O material que gerou a atividade é persistido (bucket privado `materiais`, RLS por prefixo de path = `professor_id`) e linkado em `atividades.material_id` — vale para os três tipos de origem (texto/imagem/pdf), não só arquivo. Medido no primeiro uso real com foto: atividade de 6 questões custou US$ 0,0095 (1929 tokens de entrada — mais que texto puro, por causa dos tokens de visão — e 877 de saída).

**Resultado do professor lido direto por RLS, sem Edge Function (decidido em 26/07/2026).** Ao contrário de `tarefa-*` (aluno sem sessão), quem lê `/resultados/:atribuicaoId` é o professor autenticado — as policies `prof_owns_via_atribuicao` e `prof_owns_via_atividade` já liberam a leitura de `respostas`/`questoes` das próprias atividades, então o front consulta direto via `supabase-js`. Notificação por e-mail ao aluno concluir (RF-92) ficou de fora desta etapa: o usuário optou por adiar em vez de escolher um provedor agora.

**Aluno logado ainda passa por Edge Function, nunca por RLS — mesmo tendo um `auth.users` real (decidido em 26/07/2026).** Criar conta (RF-23) dá ao aluno um login de verdade no Supabase Auth, com JWT próprio. Mesmo assim, `painel-aluno-obter` resolve a identidade pelo JWT e lê `atribuicoes`/`atividades`/`respostas` via `service_role` — RLS deste banco continua sem nenhuma policy para o aluno, logado ou não (ver cabeçalho de 0001_init.sql). A trilha dupla (token anônimo `{token}` OU `{atribuicao_id, access_token}` da sessão) foi estendida para dentro de `tarefa-obter`/`responder`/`concluir` via um resolver único (`_shared/atribuicao.ts`), para que o aluno logado consiga mesmo abrir e responder uma tarefa pendente pelo painel — não só ver o histórico.

**Sessão do aluno isolada da sessão do professor no mesmo navegador (decidido em 26/07/2026).** `lib/supabase-aluno.ts` usa um `storageKey` próprio (`sb-aluno-auth-token`) — sem isso, professor testando no mesmo navegador que um aluno logado sobrescreveria a sessão um do outro, já que os dois clientes apontam pro mesmo projeto Supabase.

**Reset de acesso não usa `auth.admin.signOut` (corrigido em 26/07/2026, bug pego em teste manual).** A tentativa inicial chamava `signOut(userId, 'global')` para derrubar sessões — mas essa API do GoTrue exige o **JWT da sessão a derrubar**, não um `user_id`; não existe "deslogar de fora" por id. O erro só apareceu testando de verdade (`invalid JWT: token contains an invalid number of segments`). A solução final não depende dessa API: como todo acesso do aluno (painel, tarefa via `atribuicao_id`) resolve a identidade fazendo lookup em `contas_aluno` por `user_id`, apagar essa linha já corta o acesso ao produto — o JWT antigo pode continuar criptograficamente válido no Supabase Auth até expirar sozinho, mas não abre mais nada aqui. RF-25 ("invalida as sessões ativas") é satisfeito na camada do produto, não na do provedor de auth — decisão pragmática registrada aqui para não ser reintroduzido por engano depois.

**Pagamento pendente é a AUSÊNCIA de uma linha, não uma linha com status='pendente' (decidido em 26/07/2026).** `pagamentos` tem `unique(aluno_id, referencia_mes)`, mas não pré-criamos uma linha por aluno por mês — isso exigiria um job/cron rodando todo dia 1º para todo professor. Em vez disso, "pendente" é o estado implícito de um aluno com `valor_mensal` definido e nenhuma linha para o mês corrente; a linha só nasce de verdade na primeira vez que o professor mexe no status (geralmente ao marcar como pago). Simplifica o modelo (sem job nenhum) às custas de: o histórico de meses "sempre pendentes, nunca pagos" não fica registrado — só existe linha para o que já foi tocado.

**Aula recorrente sem tabela de série (decidido em 26/07/2026).** RF-42 pedia "aula recorrente", mas o schema de `aulas` não tem um conceito de série/recorrência — cada linha é independente. Resolvido no nível mais simples possível: ao criar, "repetir semanalmente" insere N linhas adicionais (mesmo dia da semana e horário, `data_hora` + 7 dias × i) na mesma chamada. Consequência aceita: editar ou cancelar "a série toda" não existe — cada aula editada/excluída é individual. Se isso virar um problema real de uso, aí sim vale introduzir uma tabela `serie_aulas`.

**Cota de geração é a única barreira aplicada no servidor; cota de alunos é só do cliente (decidido em 26/07/2026).** `gerar-atividade` conta as gerações do mês antes de chamar o Gemini e rejeita com 429 se estourou o limite do plano — testado direto via `fetch`, sem passar pela UI, e barrou corretamente. Já o limite de alunos (RF-110) só é checado dentro de `useCriarAluno`, no navegador; um `POST` direto contra o Postgrest com o mesmo JWT insere sem problema (testado e confirmado). Aceito conscientemente: RLS já garante que um professor só vê/mexe nos próprios dados — o que falta aqui é só um limite de negócio (quantos alunos o plano permite), não uma fronteira de segurança, e o "atacante" seria o próprio professor tentando usar mais do que pagou. Vale endurecer com um trigger no Postgres se isso virar abuso de verdade; por ora, dinheiro real só é gasto na geração por IA, e essa está protegida.

**RF-113 (Stripe) fora desta etapa (decidido em 26/07/2026).** O usuário optou por implementar só RF-110/111/112 (limites e avisos) agora, sem gateway de cobrança — trocar o `plano` de um professor continua sendo manual, direto no banco, até haver conta/chaves de um gateway real para integrar.

**Padrão de erro do resultado usa tipo de questão, não tema gramatical (decidido em 26/07/2026).** O mockup P8 mostra o card afirmando "as 2 questões erradas envolvem past simple de verbos irregulares". Isso não é derivável: `questoes` não tem coluna de tema, e `habilidades` é da atividade inteira — o mesmo motivo pelo qual "erros recorrentes" na ficha do aluno já usa habilidade como proxy (RF-94). Preencher o card com um tema plausível gerado na hora seria afirmar algo falso sobre o desempenho de um aluno real, então ele mostra o que dá para provar: o tipo de questão que concentrou os erros, mais a comparação com a tarefa anterior **quando ambas treinam a mesma habilidade**. Para chegar ao nível do mockup seria preciso a IA marcar um tema por questão na geração — muda schema, prompt e contrato de saída; fica como decisão de produto futura, não como dívida técnica.

**Rascunho é atividade não enviada, não `atividades.status` (decidido em 26/07/2026).** O enum `atividade_status` (`rascunho|publicada|arquivada`) existe desde a migration inicial, mas nenhuma policy, constraint ou índice depende dele, e nenhum RF pede "publicar" — o RF-71 literal é "salvar como rascunho e retomar depois". A aba "Rascunhos" da biblioteca filtra pela existência de `atribuicoes`, que é o que o professor entende por "ainda não mandei pra ninguém". A dívida anterior no README, que descrevia RF-71 como "publicar formal sem UI", estava errada e foi corrigida. Se `status` precisar significar algo (arquivar, RF-126), isso vira decisão nova.

**Materiais avulsos reaproveitam a tabela que já nascia da geração por IA (decidido em 26/07/2026).** `materiais` existia desde a etapa 3, mas só como registro de procedência do que gerou uma atividade. RF-50/51/52 foi atendido sem tabela nova: a coluna `aluno_id` (nullable, já no schema) passa a ser preenchida quando o professor envia material pela ficha. Consequência: um material ou é de origem de atividade (sem `aluno_id`) ou é avulso de um aluno — não há vínculo com vários alunos, o que RF-52 também não pede. A URL assinada (RNF-10) é gerada no clique, não ao listar: assinar tudo de antemão gastaria requisição em link que ninguém abre e deixaria mais links válidos circulando.

**Etapa da trilha vale pela tentativa mais recente, não por "já concluiu alguma vez" (decidido em 26/07/2026, bug pego em teste).** Reatribuir a trilha cria uma tentativa nova por etapa (RF-127) — é assim que o reenvio de reforço funciona (RF-122). Na primeira versão, o painel do aluno pegava uma atribuição qualquer da etapa (na prática a mais antiga) e o progresso do professor contava "existe alguma tentativa concluída". Resultado no teste real: o professor via 1/3 e o aluno via 0/3 na mesma trilha, e a etapa reenviada aparecia duplicada como tarefa avulsa. Os dois lados passaram a olhar só a atribuição mais recente de cada `(aluno, etapa)`, e todas as atribuições de etapa — inclusive tentativas antigas — saem das listas soltas do painel.

**"Continuar agora" (RF-139) exige sessão; por link anônimo não tem como (decidido em 26/07/2026).** A continuação abre a próxima etapa por `atribuicao_id`, rota que passa pelo JWT do aluno. Para quem recebeu a trilha por link, o token da etapa seguinte não é recuperável — só o hash é persistido (mesma decisão de segurança do RF-20). Consequência aceita: aluno sem conta faz a trilha etapa a etapa, um link de cada vez, e o professor recebe os links de todas as etapas ao atribuir. É mais um motivo para o aluno recorrente ter conta (RF-22).

**Reordenar a sequência grava tudo numa requisição só (decidido em 26/07/2026).** `trilha_etapas` tem `unique(trilha_id, ordem) deferrable initially deferred` justamente para isso: uma requisição PostgREST é uma transação, e a restrição só é verificada no commit, então trocar duas etapas de lugar num `upsert` em lote nunca passa por um estado inválido. Atualizar etapa por etapa violaria a unicidade no meio do caminho. Detalhe que custou um bug em teste: o `upsert` precisa montar as colunas explicitamente — passar o objeto da UI (que carrega título/nível/questões calculados no cliente) faz o PostgREST responder 400 (PGRST204, coluna inexistente), e o cast de TypeScript não remove nada em runtime.

**RF-86 é treino, não nova tentativa (decidido em 26/07/2026).** "Refazer apenas os erros" reabre no cliente só as questões erradas, com o mesmo feedback de sempre, e **não** reenvia nada: o placar que o professor recebeu continua o mesmo, e a tela avisa o aluno disso. Regravar valendo nota exigiria reabrir uma tentativa concluída — `tarefa-responder` recusa com 409 justamente para não reescrever resultado já entregue —, e reenviar como tentativa nova seria refazer a atividade inteira, não os erros. Se um dia o professor quiser "vale a segunda nota", isso é reenvio da atividade (RF-127), que já existe.

**Estado por questão vazava entre questões (corrigido em 26/07/2026, bug pego ao construir o repasse).** Cada componente de resposta guarda em estado próprio o que o aluno escolheu ou digitou, e a `TarefaPage` trocava só a prop `questao` — o React mantinha a mesma instância, então o texto digitado numa questão aparecia preenchido na seguinte. Resolvido com `key={questao.id}` no contêiner das respostas, que força a remontagem. O bug era anterior às trilhas; só ficou evidente no repasse dos erros, onde a mesma questão é reaberta.

**Contagem de etapas concluídas: sempre a tentativa mais recente (reforçado em 26/07/2026).** A mesma armadilha apareceu três vezes — progresso do professor, painel do aluno e tela de fim de etapa —, sempre porque reatribuir a trilha cria tentativas novas e as antigas continuam concluídas no banco. Em todos os três a regra é a mesma: agrupar por `(aluno, etapa)`, ordenar por `enviada_em` decrescente e olhar só a primeira. Quem escrever a próxima consulta sobre etapas de trilha deve seguir isso.

**Alertas da trilha só aparecem com sinal, nunca como placeholder (decidido em 26/07/2026).** Na tela P13 o mockup mostra três blocos de análise — atraso, ponto fraco e reenviar etapa. Todos são condicionais no código: o alerta de atraso exige que a etapa atual esteja parada há **mais tempo do que aquele aluno costuma levar** (média das etapas que ele já fechou, calculada de `enviada_em` a `concluida_em`); sem histórico não há como afirmar atraso, e o card não aparece. "Reenviar etapa" só é oferecido para etapas concluídas abaixo de 70% — reenviar uma que o aluno nem abriu seria duplicata, não reforço. E o "ponto fraco" usa **habilidade**, não tema: pela mesma limitação de schema do RF-94, não existe tema por questão. Um painel de análise que sempre mostra alguma coisa treina o professor a ignorá-lo.

**Decisões em aberto**
0. **O produto nunca foi ao ar.** §11 pede validação com 3–5 professores reais a cada etapa; as 7 foram construídas sem nenhuma. Não há deploy nem CI, e não existe teste automatizado — toda verificação até aqui foi manual, no navegador. É a lacuna de maior risco do projeto, e não é de código.
1. Preço do plano pago — pesquisar disposição a pagar com 10 professores.
2. Teto de custo por atividade — os R$ 0,40 foram estimados com outra tabela de preços; as medições reais (texto: US$ 0,0062; foto: US$ 0,0095) sugerem folga, mas rode o conjunto de avaliação completo (docs/PROMPT-GERACAO.md §6) antes de fechar o número.
3. Speaking (RF-64) é o principal diferencial pedagógico — vale antecipar para o MVP se o custo permitir?
4. Nome do produto (o diretório está como "Vocab Node" — placeholder).

---

## 11. Sequência de construção sugerida

| Etapa | Entrega | O que valida |
|---|---|---|
| 1 | Conta do professor + alunos + envio manual de atividade escrita à mão | O link e o fluxo do aluno funcionam — **pronto** |
| 2 | Geração por IA a partir de texto colado | A qualidade da questão é aceitável — **pronto** |
| 3 | Upload de PDF e foto com OCR | Entra no material real do professor — **pronto** |
| 4 | Resultados, notificação e ficha do aluno | O professor volta à plataforma — resultado detalhado e ficha **prontos**; notificação por e-mail adiada (sem provedor escolhido) |
| 5 | Contas de aluno, reset de acesso e painel do aluno | O aluno vira usuário recorrente — **pronto** |
| 6 | Aulas, anotações e financeiro | Vira a ferramenta central do professor — **pronto** |
| 7 | Planos, cotas e cobrança | Receita — cotas/limites **prontos**; cobrança via Stripe adiada (decisão do usuário, exige conta/chaves reais) |
| 8 | Trilhas (§6.9-B, RF-130 a RF-142) | O aluno motivado sempre tem o que fazer — **pronto**; P0 completo (RF-130/131/132/134/137/138/139), mais RF-136/140/141. RF-133 (gerar direto para a etapa) e RF-142 (sugerir reforço) fora |

Depois da etapa 7, seis telas do professor foram reaproximadas dos mockups (P1, P3, P4, P6, P8, P9) e três lacunas foram fechadas: materiais avulsos por aluno (RF-50/51/52), aba Rascunhos na biblioteca e o rastro de auditoria do reset (RF-26), que era gravado mas nunca exibido.

Cada etapa deve ir ao ar para 3–5 professores reais antes da seguinte — **regra ainda não cumprida nenhuma vez**, ver "Decisões em aberto" §10, item 0.
