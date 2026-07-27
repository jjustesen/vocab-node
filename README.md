# Vocab Node

Plataforma para professores autônomos de inglês: gestão de alunos e aulas, atividades interativas geradas por IA a partir do material da aula, e trilhas de estudo.

| Documento | O que é |
|---|---|
| [PRD.md](PRD.md) | Requisitos, escopo, modelo de dados, métricas |
| [FLUXOS.md](FLUXOS.md) | Mapa de telas e fluxos |
| [mockups.html](mockups.html) | Todas as telas aprovadas (abra no navegador) |
| [docs/CONTRATO-QUESTOES.md](docs/CONTRATO-QUESTOES.md) | Formato das questões — IA, banco e app |
| [docs/PROMPT-GERACAO.md](docs/PROMPT-GERACAO.md) | Prompt de geração e parâmetros |

---

## Stack

React + Vite · TypeScript · Tailwind v4 · TanStack Query · React Router · Supabase (Postgres, Auth, Storage, Edge Functions) · Gemini

---

## Rodando local

```bash
cd app
npm install
cp .env.example .env.local   # preencha com os dados do seu projeto Supabase
npm run dev
```

> **Atenção no Windows:** não gere o `.env.local` com `Out-File` do PowerShell — ele escreve BOM, e o BOM gruda na primeira variável, que passa a chegar como `undefined` no Vite. Use um editor ou `cp` do Git Bash.

### Configurando o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Linke o projeto e aplique as migrations:
   ```bash
   supabase link --project-ref <seu-project-ref>
   supabase db push --include-all
   ```
   Ou rode os arquivos de `supabase/migrations/` em ordem, direto no SQL Editor.
3. Em **Project Settings → API**, copie `Project URL` e `anon public` para o `.env.local`.
4. Em **Authentication → Providers**, deixe *Email* ligado. Para testar sem caixa de entrada, desligue *Confirm email* enquanto estiver em desenvolvimento.
5. Publique as Edge Functions (não precisa de Docker rodando — o deploy usa bundling remoto):
   ```bash
   supabase functions deploy tarefa-obter --no-verify-jwt
   supabase functions deploy tarefa-responder --no-verify-jwt
   supabase functions deploy tarefa-concluir --no-verify-jwt
   supabase functions deploy convite-obter --no-verify-jwt
   supabase functions deploy convite-concluir --no-verify-jwt
   supabase functions deploy gerar-atividade
   supabase functions deploy painel-aluno-obter
   supabase functions deploy tarefa-pronuncia --no-verify-jwt
   ```
   `--no-verify-jwt` é obrigatório nas quatro primeiras: quem chama é o navegador do aluno sem sessão (tarefa-\*) ou ainda sem conta (convite-\*) — a autorização vem da posse do token, validado por hash dentro de cada função, nunca do gateway. `gerar-atividade` e `painel-aluno-obter` são o oposto — quem chama já está autenticado (professor ou aluno logado), então rodam com verify-jwt ligado (padrão).
6. Gere uma chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e configure o secret (nunca entra no `.env` do front — só a Edge Function enxerga):
   ```bash
   supabase secrets set GEMINI_API_KEY=sua_chave_aqui
   ```

A chave `service_role` **nunca** entra no front — ela vive só nas Edge Functions, injetada automaticamente pelo Supabase como variável de ambiente (`SUPABASE_SERVICE_ROLE_KEY`).

---

## Regra de acesso

O RLS deste banco serve **exclusivamente ao professor autenticado**. O aluno — com ou sem conta — nunca fala com o Postgres direto: todo acesso dele passa por Edge Function. Sem conta, a autorização vem da posse do token do link, validado por hash (`tarefa-*`, `convite-*`). Com conta (RF-28), a autorização vem do JWT da sessão própria do aluno (`lib/supabase-aluno.ts`) — mas a leitura das tabelas continua indo por `service_role` dentro da função (`painel-aluno-obter`), nunca por RLS: RLS deste banco não tem policy nenhuma para o aluno, com ou sem sessão.

Detalhes no cabeçalho de [0001_init.sql](supabase/migrations/0001_init.sql).

### Correção: no navegador do aluno, não no servidor

Decisão de produto de 26/07/2026: `tarefa-obter` devolve o gabarito **completo** (resposta_correta, respostas_aceitas, pares, explicação) de todas as questões já na primeira chamada — não só das já respondidas. A correção roda na hora, no navegador do aluno (`corrigir()`), sem esperar uma viagem ao servidor a cada resposta. `tarefa-responder` continua sendo chamada, mas em segundo plano, sem bloquear a tela — só persiste o histórico que o professor vê depois.

**Custo assumido conscientemente:** um aluno que abrir o DevTools vê o gabarito inteiro antes de responder. Aceito porque o público é lição de casa entre professor e aluno, não uma prova — ver [docs/CONTRATO-QUESTOES.md §7](docs/CONTRATO-QUESTOES.md).

---

## Estrutura

```
app/src/
  components/       Layout (barra escura + área creme), Chip (seleção), EmBreve
  features/
    auth/           AuthProvider, LoginPage (sessão do PROFESSOR)
    aluno-auth/     AlunoAuthProvider (sessão do ALUNO, separada), EntrarAlunoPage
    cadastro/       CadastroAlunoPage (/cadastro/:token) — RF-22/23/24
    painel/         PainelAlunoPage (/painel) — RF-28
    alunos/         api.ts (queries e mutations), lista, ficha (com abas reais), EditarAlunoModal, AcessoAlunoModal (gerar link/resetar acesso)
    aulas/          api.ts, AbaAulas (ficha do aluno), AgendaPage (/agenda) — RF-40/41/42/43
    materiais/      api.ts, AbaMateriais (ficha do aluno) — RF-50/51/52
    financeiro/     api.ts, AbaPagamentos (ficha do aluno), FinanceiroPage (/financeiro) — RF-100/101/102
    hoje/           api.ts (pendentes, concluídas recentes) + home do professor
    planos/         api.ts — plano do professor e uso do mês (RF-110/111/112)
    trilhas/        api.ts, PainelTrilhas (aba dentro de Atividades), TrilhaDetalhePage (montar), TrilhaDoAlunoPage (P13) — RF-130 a RF-142
    atividades/     criar, editar (com trava pós-resposta), gerar com IA (texto/PDF/foto → revisão), biblioteca, detalhe, enviar, construtor de questões, QuestaoLeitura (modo leitura compartilhado), BotaoNovaAtividade
    resultados/     ResultadoAtribuicaoPage — visão do professor sobre uma tentativa já respondida, questão a questão
    tarefa/         TarefaPage — fluxo do aluno, aceita /t/:token (anônimo) OU /painel/tarefa/:atribuicaoId (logado)
  lib/
    supabase.ts        cliente do PROFESSOR (RLS)
    supabase-aluno.ts  cliente do ALUNO logado (storageKey própria — sessão isolada da do professor)
    api-tarefa.ts      cliente do ALUNO sem sessão (axios → Edge Functions)
    token.ts           gera token + hash (Web Crypto) — link de tarefa e de cadastro/reset
    arquivo.ts         redimensiona foto (canvas) e converte PDF/foto em base64, no navegador
    planos.ts          limites por plano (RF-110/111) — espelhado em supabase/functions/_shared/planos.ts
    avatar.ts          cor do avatar derivada do id (mesma pessoa, mesma cor em todas as telas)
    whatsapp.ts        monta o link wa.me, com ou sem telefone cadastrado
    erro-edge-function.ts  extrai a mensagem de erro de uma Edge Function
  types/            db.ts (espelha o schema), questao.ts (contrato + Zod)
supabase/
  migrations/
  functions/
    tarefa-obter/         lê a tarefa (token OU sessão do aluno, ver _shared/atribuicao.ts), projeta campo a campo
    tarefa-responder/     corrige a resposta e grava
    tarefa-concluir/      fecha a tentativa e devolve o placar
    convite-obter/        valida o link de cadastro/reset, devolve nome do aluno/professor
    convite-concluir/     cria contas_aluno após o signUp, marca o convite usado, grava auditoria
    painel-aluno-obter/   aluno logado (JWT) — trilhas, pendentes e concluídas, sem RLS (service_role)
    gerar-atividade/      professor autenticado (JWT) — chama a IA, valida, registra custo em geracoes_ia
    _shared/              cors, hash do token, resolução dual de atribuição, correção, cliente service_role, validação Zod, ia/ (prompt, schema, provedor Gemini)
docs/
```

Em `types/db.ts`, os tipos de linha são `type`, **nunca `interface`** — o postgrest-js exige que cada Row satisfaça `Record<string, unknown>`, e interfaces não ganham index signature implícita. Com `interface`, o cliente inteiro degrada silenciosamente para `never`.

A lógica de correção (`normalizar`/`corrigir`) existe **duplicada** em `app/src/types/questao.ts` e `supabase/functions/_shared/correcao.ts` — Deno não compartilha módulo com o Vite sem um workspace, e a regra é pequena o bastante para não valer essa complexidade. Mudou de um lado, muda do outro.

---

## Roteiro (PRD §11)

| Etapa | Entrega | Estado |
|---|---|---|
| 1 | Conta do professor, alunos, atividade escrita à mão, envio por link | **pronto e testado ponta a ponta** |
| 2 | Geração por IA a partir de texto colado | **pronto e testado ponta a ponta** |
| 3 | Upload de PDF e foto com OCR | **pronto e testado ponta a ponta** |
| 4 | Resultados, notificação, ficha do aluno | resultado detalhado e ficha do aluno **prontos**; notificação por e-mail adiada a pedido (sem provedor escolhido ainda) |
| 5 | Contas de aluno, reset de acesso, painel do aluno | **pronto e testado ponta a ponta** |
| 6 | Aulas, anotações, agenda, financeiro | **pronto e testado ponta a ponta** |
| 7 | Planos, cotas e cobrança | cotas e limites **prontos**; cobrança via Stripe adiada a pedido |
| 8 | Trilhas (RF-130 a RF-142) | **pronto e testado ponta a ponta** — professor monta/atribui, aluno vê a sequência e emenda as etapas |

O PRD §11 pede que cada etapa vá ao ar para 3–5 professores reais antes da seguinte. **Isso ainda não aconteceu em nenhuma delas** — o app só roda em `localhost`, não há deploy nem CI. As 7 etapas foram construídas sem feedback de professor real; é a maior lacuna do projeto hoje, e não é de código.

### O que a etapa 8 já faz (Trilhas)

Trilha é uma sequência ordenada de atividades que já existem na biblioteca, entregue **inteiramente liberada** — a ordem é roteiro, não trava.

- **Trilhas é uma aba da biblioteca**, não um item de menu (mockup P11): uma trilha é uma sequência de atividades que já existem, não um tipo de conteúdo à parte. `/trilhas` renderiza a mesma página de Atividades com a aba escolhida pela rota, então o endereço continua compartilhável e o botão do topo vira "Nova trilha".
- **Montar a sequência** (RF-130/131, `/trilhas/:id`): adicionar atividades da biblioteca, reordenar e remover. A reordenação grava **todas as etapas numa requisição só**, de propósito: a `unique(trilha_id, ordem)` é `DEFERRABLE INITIALLY DEFERRED` e uma requisição PostgREST é uma transação, então a unicidade só é checada no commit. Update etapa por etapa violaria a restrição no meio do caminho.
- **Atribuir a alunos** (RF-134): cria de uma vez as atribuições de **todas** as etapas, cada uma com seu token. Nada de "liberar a próxima" — é o que impede o aluno de ficar travado esperando (RF-132). São 2 idas ao banco, não uma por etapa por aluno.
- **Progresso por aluno** (RF-136/137), pausar e remover mantendo o histórico (RF-140), e duplicar trilha (RF-141).
- **A trilha de UM aluno** (`/alunos/:id/trilhas/:trilhaId`, mockup P13): linha do tempo com data e tempo de cada etapa concluída, etapa atual em destaque com "Cobrar no WhatsApp", desempenho médio e ajustes. Três blocos aparecem **só quando há sinal real**, em vez de ocupar espaço com placeholder: o alerta de atraso (a etapa atual está parada há mais tempo do que o aluno costuma levar — comparado com a média dele nas etapas já fechadas), a habilidade com mais erros, e "Reenviar etapa N" (só para etapas concluídas abaixo de 70%, RF-122 — refazer uma etapa que o aluno nem abriu seria duplicata, não reforço).
- **Painel do aluno** (RF-138): a trilha aparece como linha de etapas — concluídas com nota, a atual em destaque e as seguintes já disponíveis para quem quiser emendar. As etapas somem das listas soltas de "para fazer"/"concluídas" para não aparecerem duas vezes.
- **"Continuar agora"** ao fim de cada etapa (RF-139): `tarefa-concluir` devolve a próxima etapa pendente e a tela final oferece o atalho, sem passar pelo painel.

Duas limitações que valem saber:

- **"Continuar agora" só existe para aluno logado.** A continuação abre por `atribuicao_id`, e o token do link anônimo não é recuperável — só o hash fica no banco. Quem recebeu a trilha por link recebe um link por etapa e faz uma de cada vez.
- **Reordenar não é arrastar, é setas.** O drag-and-drop nativo do HTML5 não funciona em toque, e o app é usado no celular (RNF-06); sem uma biblioteca de DnD, setas dão o mesmo resultado em qualquer dispositivo.

### Materiais e biblioteca (fechados depois da etapa 7)

- **Materiais avulsos por aluno** (RF-50/51/52): aba "Materiais" na ficha — enviar PDF/DOCX/imagem/áudio (até 25 MB) ou colar texto, ver o texto guardado, baixar e excluir. Antes disso, `materiais` só nascia como subproduto da geração por IA; agora o professor guarda material direto, vinculado ao aluno (`materiais.aluno_id`).
- **Download por URL assinada** (RNF-10): o bucket é privado; a URL de 1h é gerada **no clique**, não ao renderizar a lista — assinar tudo de antemão gastaria requisição em link que ninguém abre, e deixaria mais links válidos circulando.
- **Abas "Minhas atividades" / "Rascunhos" / "Trilhas"** na biblioteca. Rascunho aqui é a atividade **que ainda não foi enviada a ninguém**, não `atividades.status`: o campo existe no banco mas é cosmético (nenhuma policy, constraint ou índice depende dele).

### O que a etapa 7 já faz

- **Limites por plano** (RF-110/111): gratuito trava em 3 alunos ativos e 10 gerações por IA por mês; pago (`professores.plano = 'pro'`) libera alunos ilimitados e uma cota alta (300/mês). Sem UI de troca de plano ainda — por enquanto o campo é mudado direto no banco.
- **Aviso claro ao se aproximar e ao atingir o limite** (RF-112): barra de uso na home ("Hoje"), badge "X/3 alunos" em `/alunos` (botão desabilita no limite), e aviso na tela de gerar atividade a partir de 80% de uso.
- **A cota de geração é aplicada de verdade no servidor** — `gerar-atividade` conta as gerações do mês (sucesso=true) e rejeita com 429 antes de gastar um centavo com o Gemini, mesmo chamando a função direto (testei via `fetch` puro, sem passar pela UI). **A cota de alunos só é checada no cliente** — inserir um aluno via REST direto contra o Postgrest passa por baixo (testei e confirmei); aceito por ora porque é um limite de negócio, não de segurança, e o RLS já protege isolamento de dados entre professores. Se isso virar um problema de verdade (professores burlando o plano gratuito de propósito), a solução é um trigger no Postgres, não mais lógica no cliente.
- **RF-113 (assinatura via Stripe) ficou de fora desta etapa** — decisão do usuário, por exigir conta/chaves reais de um gateway de pagamento antes de integrar.

### O que a etapa 6 já faz

- **Aulas** (RF-40/41): registra aluno, data/hora, duração e status (agendada/realizada/cancelada/falta), com anotação livre por aula — tudo pela aba "Aulas" na ficha do aluno.
- **Aula recorrente** (RF-42): ao criar, "repetir semanalmente" cria N aulas extras no mesmo dia/horário, uma por semana — sem tabela de recorrência à parte, só linhas independentes em `aulas`.
- **Agenda da semana** (RF-43, `/agenda`): todas as aulas de todos os alunos numa grade de 7 dias, com navegação semana anterior/próxima; painel "Aulas de hoje" na home do professor usa a mesma consulta (`useAulasEntre`).
- **Financeiro** (RF-100/101/102, `/financeiro`): mensalidade por aluno (editável na ficha), marcar mês como pago/pendente manualmente, tela com o total pendente do mês. Uma linha em `pagamentos` só é criada de fato na primeira vez que o mês é mexido — até lá, "sem linha" já significa pendente.
- **RF-11 finalmente completo**: editar aluno (lápis na ficha) agora cobre telefone, nível, valor da mensalidade, dia/horário fixo e observações — campos que existiam no schema desde a etapa 1 mas não tinham UI.
- Fora do escopo desta etapa, por serem P2: lembrete automático de aula (RF-44), sincronização com Google Calendar (RF-45), cobrança via Pix/cartão dentro da plataforma (RF-103).

### O que a etapa 4 já faz

- **Resultado detalhado por tentativa** (RF-93): `/resultados/:atribuicaoId` mostra questão a questão o que o aluno respondeu vs. a resposta certa, com o mesmo tratamento por tipo do fluxo do aluno (inclui o desmonte de `ligar_colunas` par a par), tempo total e placar. Sem Edge Function nova — o professor já lê essas tabelas direto pelo RLS existente (`prof_owns_via_atribuicao`/`via_atividade`).
- **Ficha do aluno com dados reais** (RF-94): média de acertos, tarefas concluídas e histórico de tentativas (cada uma linkando pro resultado detalhado) substituíram o mock estático.
- **Erros recorrentes por habilidade**: conta respostas erradas agrupadas pela habilidade da atividade que a questão pertence — o schema não tem "tema" por questão, então a habilidade é o proxy usado.
- **Notificação por e-mail ao professor (RF-92) ficou de fora desta etapa** — decisão do usuário, por não ter escolhido/configurado um provedor de e-mail transacional ainda (Supabase não manda e-mail arbitrário, só os de autenticação). Fica como próximo passo quando houver provedor definido.

### O que a etapa 5 já faz

- **Conta do aluno** (RF-22/23/24): na ficha, "Gerar link de cadastro" cria um token (mesmo padrão Web Crypto do link de tarefa) e abre `/cadastro/:token` — o aluno define e-mail/senha, o histórico inteiro (atribuições, respostas, resultados) continua preso ao `aluno_id` de sempre.
- **Reset de acesso** (RF-25/26): no menu "..." da ficha, com confirmação explícita antes de executar. Desvincula o e-mail atual (`contas_aluno`), registra a auditoria em `eventos_acesso_aluno` (data/hora, e-mail antigo/novo) e gera um novo link na mesma ação.
- **"Invalida sessões ativas" é aplicado na camada do produto, não no Supabase Auth**: `auth.admin.signOut` do GoTrue exige o JWT da própria sessão a derrubar, não um `user_id` — não existe "deslogar de fora" por id nessa API. Como todo acesso do aluno (painel, tarefa via `atribuicao_id`) resolve a identidade fazendo lookup em `contas_aluno` por `user_id`, apagar essa linha corta o acesso ao produto mesmo que o JWT antigo continue tecnicamente válido até expirar sozinho.
- **Painel do aluno logado** (RF-28, `/painel`): pendentes e concluídas de verdade, com média de acertos. Sessão em cliente Supabase separado (`lib/supabase-aluno.ts`, `storageKey` próprio — não colide com a sessão do professor no mesmo navegador).
- **Aluno logado consegue mesmo abrir e responder uma tarefa pendente pelo painel** (`/painel/tarefa/:atribuicaoId`) — não é só leitura. `tarefa-obter`/`tarefa-responder`/`tarefa-concluir` agora aceitam dois jeitos de provar quem é o dono da tentativa: o token do link anônimo (RF-20, inalterado) ou `{atribuicao_id, access_token}` da sessão do aluno (`_shared/atribuicao.ts`) — a mesma `TarefaPage` atende as duas rotas.

### O que a etapa 3 já faz

- Além de colar texto, o professor pode enviar uma **foto ou um PDF** do material da aula. Não tem OCR separado: o Gemini lê imagem/PDF nativamente (`inline_data` na chamada), então o "OCR" do roteiro é o próprio modelo multimodal.
- Foto é redimensionada e reencodada em JPEG **no navegador** antes de sair do professor (`lib/arquivo.ts`, ~1500px no lado maior) — reduz o tamanho da requisição e o custo, sem perda perceptível de leitura.
- Quando a atividade é salva, o material original (a mesma foto/PDF que gerou o conteúdo) sobe para um bucket privado (`materiais`, `0004_storage_materiais.sql`) e fica linkado em `atividades.material_id` — cada atividade gerada guarda de onde veio.
- Texto colado também vira uma linha em `materiais` (sem upload, só o texto) — mesma rastreabilidade para os três tipos de origem.

### O que a etapa 2 já faz

- Professor cola o material da aula, escolhe nível/quantidade/habilidades/foco e gera a atividade com Gemini (`gerar-atividade`, com JWT — diferente das funções do aluno). Schema de saída estruturada e instrução do sistema em [docs/CONTRATO-QUESTOES.md](docs/CONTRATO-QUESTOES.md) e [docs/PROMPT-GERACAO.md](docs/PROMPT-GERACAO.md).
- Questão que falha na validação (Zod, espelhado em `_shared/questao-validacao.ts`) é descartada, não corrigida na marra; se sobrar menos que o pedido, uma segunda chamada complementa sem repetir o que já foi aceito.
- Todo uso fica registrado em `geracoes_ia` (tokens e custo real) desde a primeira chamada, sucesso ou falha (RF-73: falha não consome cota).
- **Nada é salvo automaticamente**: o resultado cai direto na tela de revisão (o mesmo `AtividadeForm` da criação manual) — o professor edita ou remove questões antes de "Salvar atividade" (RF-67/70).

### O que a etapa 1 já faz

- Professor monta atividade com os 6 tipos de questão do contrato (múltipla escolha, lacuna, ordenar palavras, ligar colunas, verdadeiro/falso, resposta curta).
- **Edita a atividade depois de criada** — título, nível, habilidades e as próprias questões, enquanto nenhum aluno tiver respondido nada. Depois da primeira resposta registrada, as questões travam (só metadados continuam editáveis) — evita reescrever o histórico de quem já fez, e evita o `on delete cascade` de `respostas → questoes` apagar resultado de aluno sem querer.
- Envia para um ou mais alunos — um link por aluno, token gerado no navegador do professor, só o hash vai para o banco.
- O aluno abre o link sem cadastro, responde uma questão por vez com **feedback instantâneo** (corrigido no próprio navegador, sem espera de rede) e explicação em português, e vê o placar final.
- O professor vê quem já respondeu e a nota, na própria página da atividade.
- Reabrir o link no meio da tarefa retoma de onde parou (RF-85).

### Redesign das telas do aluno (mockups A1–A7)

As sete telas que o aluno vê foram reconstruídas a partir de `mockups.html`: abertura do link, questão (acerto e erro), tela final, convite de cadastro, painel, trilha e fim de etapa. O desenho aposta em pastel e formas soltas no fundo em vez de bordas — as peças repetidas ficam em `features/tarefa/visual.tsx`.

O que mudou de comportamento junto:

- **RF-86, refazer só os erros**, que estava na dívida como não implementado. É **treino**: nada é reenviado e o placar já registrado não muda — a tela avisa isso. Refazer valendo nota exigiria reabrir uma tentativa concluída (`tarefa-responder` recusa com 409) e reescreveria o resultado que o professor já viu.
- **Trilha do aluno virou tela própria** (`/painel/trilha/:id`, A6), com linha do tempo vertical: etapa concluída com nota, etapa atual em card preto "SUA VEZ", troféu na última e o convite "dá pra melhorar — refazer?" quando a nota ficou abaixo de 70%. No painel ficou só o resumo, para a trilha não empurrar as tarefas soltas para fora da primeira tela.
- **Fim de etapa dentro da trilha** (A7) é a mesma tela final com outra ênfase: progresso segmentado da trilha e "Continuar agora" como ação principal.
- O botão de sair da tarefa e o "Concluir" só aparecem para **aluno logado** — por link anônimo a tarefa é a única tela do app, não há para onde voltar.

### Redesign das telas do professor (aproximação aos mockups)

Depois da etapa 7, seis telas foram reaproximadas de `mockups.html`. O que mudou de comportamento, não só de cor:

- **Home (P1)**: contadores no topo, próxima aula do dia como card lilás com atalho para anotar (reusa o `ModalAula` da ficha), "Aguardando resposta" com botão de cobrar no WhatsApp e "Concluídas" com placar colorido. As duas últimas colunas eram placeholders vazios — não existia consulta de atribuições pendentes/concluídas para o professor (`features/hoje/api.ts` é novo). As três colunas têm altura fixa no desktop para terminarem alinhadas; a de aulas ganha um card "Horário vago" preenchendo a sobra.
- **Ficha do aluno (P3)**: tiles pastel, mensalidade do mês lida de `pagamentos`, painéis de "última anotação" e "últimas atividades", abas em pílula e menu "..." com editar/arquivar/resetar mais o rastro "Último reset: —" (lido de `eventos_acesso_aluno`, que era gravado mas nunca exibido).
- **Gerar atividade (P4)**: dois cartões numerados, chips arredondados, quantidade de questões por chips.
- **Criar/revisar atividade (P6)**: cada questão passou a ter **modo leitura e modo edição**. Antes tudo ficava permanentemente em formulário — revisar 10 questões da IA era encarar uma parede de inputs. "Cancelar" restaura de um snapshot tirado ao entrar em edição, porque o editor escreve no estado do pai a cada tecla.
- **Ficha da atividade (P6, leitura)**: passou a usar o mesmo `QuestaoLeitura` da revisão, que antes existia duplicado com estilo pior — verdadeiro/falso chegava a exibir `false` cru. "Quem já recebeu" virou coluna lateral fixa em vez de ficar depois de todas as questões.
- **Resultado da tarefa (P8)**: tiles (tempo, tentativa, melhor sequência), card "Padrão de erro", lista compacta expansível e "Anotar para a próxima aula" gravando nas observações da ficha (RF-94).
- **Biblioteca (P9)**: cards com ícone por habilidade, nº de envios e média da turma, botão "Enviar" direto e busca por título/tema.

Três decisões de produto tomadas nesse redesign, por não haver dado que sustentasse o mockup:

- **O "padrão de erro" usa tipo de questão, não tema gramatical.** O mockup afirma "as 2 erradas envolvem past simple de verbos irregulares"; o schema não guarda tema por questão, só `habilidades` da atividade inteira. Em vez de inventar um texto plausível sobre o aluno, o card diz o que dá para provar — o tipo de questão que concentrou os erros — e compara com a tarefa anterior **quando as duas treinam a mesma habilidade**. Ter tema por questão exigiria mudar o schema e o prompt da IA.
- **A lista de questões do resultado, colapsada, mostra só os erros** — não uma amostra como no mockup. Numa tarefa de 10 questões os erros podem cair todos fora de um preview arbitrário, e o professor abriria a tela sem ver o que importa.
- **A média da biblioteca só conta tentativas concluídas.** Quem recebeu e não respondeu não tem placar; contar como zero faria uma atividade recém-enviada parecer péssima sem ninguém ter errado nada.

### Dívida conhecida (não bloqueia o uso)

- **Nunca foi ao ar**: sem deploy, sem CI, sem nenhum professor real tendo usado. O PRD pede validação a cada etapa; as 7 foram feitas sem ela.
- **Nenhum teste automatizado**: não há vitest/playwright nem script `test`. Tudo foi verificado à mão no navegador — o que funciona durante a sessão em que se mexe, e não protege quem voltar ao código semanas depois.
- **"Publicar atividade" não existe como requisito.** O RF-71 literal é *"salvar como rascunho e retomar depois"*; o verbo "publicar" só aparece como valor do enum `atividade_status`, e nada no schema depende dele. A aba "Rascunhos" da biblioteca filtra por **atividade ainda não enviada**, que é o critério com significado real. Se um dia o status precisar valer alguma coisa, é decisão nova de produto, não dívida.
- **"Refazer os erros" (RF-86) é treino, não nova tentativa** — o aluno revisa o que errou, mas a nota registrada não muda.
- **Sem revogar link (RF-30)** e sem duplicar atividade (RF-72) — quando as questões travam por já ter resposta, a única saída hoje é criar uma atividade nova do zero.
- Bundle de produção passou de 500KB (aviso do Vite, não erro) — candidato a `dynamic import()` quando o app crescer mais.
- **Sem notificação por e-mail (RF-92)** — o professor só vê o resultado se voltar à plataforma; adiado a pedido, sem provedor de e-mail escolhido.
- **Aluno não troca o próprio e-mail (RF-29, P2)** — só o professor reseta o acesso; o aluno logado não tem uma tela de "trocar e-mail" própria.
- **Cadastro exige "Confirm email" desligado no projeto Supabase** — `CadastroAlunoPage` assume que `signUp` já devolve uma sessão ativa na hora. Com confirmação de e-mail ligada, o fluxo pararia no meio (o token do convite não sobrevive até o clique no e-mail); ajustar isso é trabalho futuro caso o projeto vá para produção com confirmação obrigatória.
- **A pronúncia custa por RESPOSTA, não por geração** — a cota mensal cobre `gerar-atividade`; cada gravação enviada a `tarefa-pronuncia` é uma chamada paga à parte, hoje contida só pelo teto de 4 tentativas por questão e pelo limite de ~30s de áudio. Se o tipo pegar, isso precisa de cota própria antes de virar conta.
- **A nota de pronúncia é julgamento de um LLM ouvindo, não análise fonética.** Serve para lição de casa ("dá para entender?"), não como nota de prova. Nota de fonema exigiria um serviço dedicado (Azure Speech e afins).
- **`ordenar_audio` depende de haver voz em inglês no aparelho** — usamos o `speechSynthesis` do navegador em vez de TTS armazenado. Em aparelho sem voz em inglês a tela degrada para "ler a frase em vez de ouvir", virando um `ordenar_palavras`. Já vi acontecer em teste: nem todo navegador traz voz en-US.
- **`ordenar_palavras` não valida solvabilidade** — diferente de `ordenar_audio`, ele não checa se as fichas cobrem a frase. Bug pré-existente, não tocado ao adicionar os tipos novos.
- **Sem cobrança (RF-113)** — sem gateway integrado, o professor não assina nem cancela o plano pago pela própria plataforma; troca de plano é manual, direto no banco.
- **Cota de alunos é só do lado do cliente** — dá pra burlar chamando o Postgrest direto (confirmado em teste). A cota de gerações por IA, essa sim, é aplicada no servidor de verdade (é a que custa dinheiro de verdade a cada chamada).
