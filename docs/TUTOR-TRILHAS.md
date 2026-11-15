# Tutor como produto: trilhas vendidas pelo professor

**Status:** escopo para validação · 15/11/2026
**Protótipo das telas:** artifact "Trilhas do Tutor" (link na conversa que gerou este documento)

---

## 1. Em uma frase

O professor monta **trilhas** (sequências configuráveis de material, atividade e lição do tutor), empacota uma ou mais trilhas num **plano** com preço mensal e limite de interações, e vende por um **link de venda** que qualquer pessoa compra sem ter conta. O pagamento cria a conta do aluno.

## 2. Vocabulário

Os nomes abaixo são os que aparecem na tela. Um nome por coisa.

| Nome | O que é | Hoje existe? |
|---|---|---|
| **Trilha** | O conteúdo organizado: módulos em ordem, cada módulo com passos. | Existe uma versão simples (lista de atividades, tudo liberado). Ver §10. |
| **Módulo** | Um bloco da trilha ("Módulo 1 — Present Simple"). Unidade de liberação. | Não |
| **Passo** | Um item do módulo: **Material** (PDF), **Atividade** ou **Lição do tutor**. Reaproveita o que já está no acervo. | Os três objetos existem soltos |
| **Plano** | O que se vende: nome, preço mensal, interações por mês, trilhas incluídas, regra de liberação. | Não (os planos de hoje são do professor com a plataforma) |
| **Assinatura do aluno** | O vínculo aluno ↔ plano, com status de pagamento e período. | Não |
| **Interação** | Uma sessão de prática com o tutor (uma lição praticada do início ao fim ou abandonada). | Já é a unidade medida (`tutor_sessoes`, `max_sessoes_mes`) |

> Material e atividade **não consomem** interação. Só o tutor tem custo de IA por uso, então só ele é limitado.

## 3. Quem faz o quê

**Professor**
1. Cria a trilha, os módulos e os passos, puxando do acervo (ou criando na hora).
2. Escolhe como o aluno navega e quando o conteúdo libera.
3. Cria um plano: preço, interações/mês, trilhas incluídas.
4. Conecta a conta de recebimento (uma vez) e copia o link de venda.
5. Acompanha assinantes: quem pagou, quem está atrasado, quanto do limite usou, onde parou na trilha.
6. Pode contratar o plano para um aluno pela própria plataforma, sem o aluno cadastrar cartão (§5.4).

**Aluno (comprador novo)**
1. Abre o link de venda → vê o professor, o plano e o que tem dentro.
2. Informa nome e e-mail → paga no Stripe.
3. Volta já logado na trilha. Recebe por e-mail um link para entrar de novo (sem senha obrigatória).

**Aluno (já é aluno do professor)**
- Mesmo fluxo; se o e-mail já tem conta, a assinatura é anexada à conta existente e ao cadastro de aluno que o professor já tinha.

## 4. Configuração da trilha (tudo escolhido pelo professor)

### 4.1 Navegação — como o aluno percorre

| Modo | O aluno vê | Bom para |
|---|---|---|
| **Em sequência** | Uma linha de passos. O próximo abre quando o anterior é concluído. | Assinatura com ritmo guiado |
| **Livre, com ordem sugerida** | A mesma linha, tudo aberto, com o "próximo recomendado" destacado. | Padrão para turma particular |
| **Livre, por tipo** | Abas **Materiais · Atividades · Tutor**, cada uma com tudo do módulo. | Aluno que quer fazer na própria ordem |

O modo é da trilha, mas o professor pode marcar **"permitir que o aluno troque para a visão por abas"** — assim a sequência continua sendo a recomendação, e as abas aparecem como alternativa (respeitando os cadeados, se houver).

### 4.2 Liberação — quando o conteúdo aparece

| Regra | Comportamento |
|---|---|
| **Tudo de uma vez** | Todos os módulos abertos desde o início. |
| **Conforme avança** | O módulo N+1 abre quando o módulo N é concluído. |
| **Um módulo por período** | Abre um módulo a cada X dias (ou a cada mês de assinatura), mesmo que o aluno não tenha terminado o anterior. |
| **Conforme avança + mínimo de tempo** | Abre ao concluir o anterior, mas não antes de X dias. Impede maratonar e cancelar. |

A liberação vale para **módulos**; a navegação vale para **passos dentro do módulo**. São independentes: dá para ter "um módulo por mês" e, dentro do módulo, "livre por tipo".

### 4.3 Conclusão de cada passo

| Passo | Conta como concluído quando | Opção do professor |
|---|---|---|
| Material | O aluno abre e toca em "Li este material" | Exigir tempo mínimo aberto (não recomendado no início) |
| Atividade | A atribuição tem `concluida_em` | Nota mínima para avançar (ex.: 70%) |
| Lição do tutor | A sessão termina | Nota mínima da avaliação |

Passo pode ser marcado como **opcional**: aparece, mas não segura o avanço.

## 5. Plano e cobrança

**Campos do plano:** nome, descrição curta, preço mensal (R$), interações por mês, trilhas incluídas, imagem/capa opcional, "aceitando novas assinaturas" (liga/desliga).

**Limite de interações**
- Renova no aniversário do período pago, não no dia 1º (o aluno que assina dia 20 tem o ciclo 20→20).
- Quando acaba: o tutor mostra "Você usou as 20 práticas deste mês. Renova em 12/12." Material e atividade continuam abertos.
- O professor pode somar práticas avulsas a um aluno no mês. Não há cobrança do aluno; o custo de IA entra no repasse como o das outras práticas.
- **Sem teto fixo da plataforma:** como o professor paga a IA que os alunos dele usam (§5.2), ele escolhe o limite que quiser. O editor mostra quanto esse limite pode custar antes de publicar.

### 5.1 Repasse um mês após cada cobrança

A taxa da plataforma e o custo de IA são do **professor**. O aluno paga só o preço do plano.

O dinheiro do aluno entra na conta da plataforma e volta ao professor **um mês depois de cada cobrança**, quando termina o período que ela pagou. O aluno pode assinar em qualquer dia, e a assinatura vale um mês inteiro a partir dali. Por isso o repasse é **por cobrança**, não por mês do calendário.

Exemplo: Ana assina em 12/11. A cobrança de 12/11 paga o período de 12/11 a 12/12, e o repasse dela sai em **12/12**. Se ela renovar, a cobrança de 12/12 vira repasse em 12/01.

Cada repasse tem os seus descontos:

```
  valor da cobrança (paga pelo aluno ou pelo professor, §5.4)
− tarifa do cartão (Stripe), se foi paga com cartão
− taxa da plataforma (10%, mínimo de R$ 6)
− custo de IA real das práticas desse aluno NESSE período (12/11 a 12/12)
− estorno ou contestação dessa cobrança, se houver
= repasse, transferido no último dia do período (12/12)
```

- **Taxa da plataforma:** 10% do valor de cada assinatura, **com mínimo de R$ 6** por assinatura por mês. A conta é por assinatura: `max(10% × preço, R$ 6)`. Na prática, o mínimo só pesa em planos abaixo de R$ 60. Ele existe para que um plano de preço simbólico não vire acesso ao tutor quase sem taxa. A tela do plano avisa quando o preço escolhido cai no mínimo.
- **Como no Stripe:** Connect Express com **cobranças e transferências separadas** (*separate charges and transfers*). A cobrança é feita na conta da plataforma; no fim do período de cada cobrança, uma `Transfer` leva o valor líquido para a conta conectada do professor, com `source_transaction` apontando para a cobrança e o id da assinatura em `metadata`. A taxa não usa `application_fee_percent`, porque o custo de IA do período só é conhecido quando ele termina. Um job diário encontra os períodos que terminaram no dia e faz as transferências.
- O professor ainda faz o cadastro de recebimento no Stripe (dados bancários e documento) uma vez, dentro do app.
- Cada plano vira um `Product` + `Price` recorrente **na conta da plataforma**, com `metadata.professor_id`. Mudar o preço cria um `Price` novo; quem já assina continua no antigo até o professor escolher migrar.
- **Por que um mês:** o período pago termina, então o custo de IA dele já está fechado. Além disso, o cartão no Brasil libera o dinheiro em cerca de 30 dias, e é nesse prazo que aparecem as contestações. Reter até o fim do período evita transferir dinheiro que depois volta.
- **Extrato:** o professor vê os **próximos repasses**, um por cobrança, com data, aluno e a prévia de cada linha acima (a IA ainda pode subir até o fim do período). Também vê os **repasses feitos**. Em cima, o total a receber nos próximos 30 dias e o custo de IA por lição.
- **Repasse negativo:** se a IA de um aluno no período passar do que sobra da cobrança dele (só acontece em plano com preço no mínimo e pago com cartão, §5.2), a diferença é debitada dos créditos do professor (§5.3). Se os créditos não cobrirem, fica como saldo devedor e é descontada do próximo repasse ou da próxima compra de créditos (D10).
- **Validar antes da F3:** reter e repassar dinheiro de terceiros pode enquadrar a plataforma como intermediadora de pagamento. Confirmar o modelo com o Stripe e com o contador. A nota fiscal da plataforma ao professor cobre a taxa e o custo de IA.

### 5.2 Custo de IA

**O que entra no custo do professor**

| Gasto | Quando acontece | Já é medido em | Quem paga |
|---|---|---|---|
| Prática de aluno que assina uma trilha | A cada sessão | `tutor_sessoes.custo_usd` | Repasse |
| Prática de aluno particular (sem plano) | A cada sessão | `tutor_sessoes.custo_usd` | Créditos |
| Prática de aluno com plano contratado pelo professor | A cada sessão | `tutor_sessoes.custo_usd` | Repasse, como os outros assinantes (§5.4) |
| Teste do professor ("Experimentar como aluno") | A cada teste | `tutor_sessoes`, marcado como teste | Créditos |
| Gravação das falas fixas da lição | Ao criar ou editar a lição | `tutor_licoes.custo_audios_usd` | Créditos |
| Gerar lição do tutor com IA | A cada geração | **Ainda não é medido** (`tutor-gerar-licao`) | Créditos |
| Áudio das questões de atividade | A cada geração | **Ainda não é medido** (`atividade-gerar-audio`) | Créditos |
| Gerar atividade com IA | A cada geração | `custo_usd` em `gerar-atividade` | Cota do plano; acima dela, créditos (D12) |

O professor paga o custo **real**, nunca a estimativa. A estimativa serve para ele montar preço e limite.

**Estimativa por lição** (aparece na lista de lições, no editor da lição e em cada passo do tutor na trilha)
- Com histórico: média das sessões reais dos alunos daquela lição nos últimos 30 dias, a partir de 5 sessões. Mostra a faixa típica (mediana e o valor que 9 em cada 10 sessões não passam).
- Sem histórico: estimativa pelo tamanho da lição (nº de itens) × o custo médio por item medido em todas as lições do tutor. A tela diz "estimativa inicial".
- **Teto:** uma sessão nunca passa de US$ 0,50 (`TETO_POR_SESSAO_USD` no `tutor-aluno`). Esse é o pior caso por prática.
- Em reais, com a cotação do dólar do dia, usada também no extrato. Hoje o app usa R$ 5,50 fixo (`REAIS_POR_DOLAR`); isso passa a ser uma cotação atualizada.
- **Mudança de preço:** a tabela de `precos.ts` dobra os preços do Gemini em 01/01/2027. Enquanto a data não chegar, a estimativa mostra também o valor a partir dela.

**Estimativa por aluno na trilha** (painel de custo no editor da trilha e na tela do plano)
- **Custo médio por prática da trilha:** a média das lições do tutor da trilha, ponderada pelo tempo que o aluno passa em cada uma.
- **Por aluno, por mês — esperado:** práticas por mês × uso típico (a fração do limite que os alunos realmente usam; sem histórico, 60%) × custo médio por prática.
- **Por aluno, por mês — máximo:** práticas por mês × custo médio por prática. É o que custa um aluno que usa tudo.
- **Para concluir a trilha uma vez:** soma de uma prática de cada lição do tutor.
- Ao lado, com o preço do plano: **quanto sobra por aluno** depois do cartão, da taxa e da IA máxima.

**Preço mínimo do plano**
- **Regra:** o preço nunca pode ser menor que **a IA máxima por mês somada à taxa da plataforma**. Ou seja, `preço − taxa(preço) ≥ IA máxima`, com `taxa(preço) = max(10% × preço, R$ 6)`.
  - Enquanto `IA máxima + R$ 6` não passa de R$ 60, o mínimo é `IA máxima + R$ 6`.
  - Acima disso, o mínimo é `IA máxima ÷ 0,9`.
  - O resultado é arredondado para cima, em reais inteiros.
- **IA máxima** = práticas por mês × custo médio por prática das lições do tutor de **todas as trilhas do plano** (§5.2).
- **Exemplos** com o custo médio de R$ 0,41 por prática:

  | Práticas por mês | IA máxima | Preço mínimo |
  |---|---|---|
  | 5 | R$ 2,07 | R$ 9 |
  | 20 | R$ 8,28 | R$ 15 |
  | 60 | R$ 24,83 | R$ 31 |
  | 150 | R$ 62,08 | R$ 69 |
- **Onde vale:** na tela do plano, o mínimo aparece ao lado do preço e muda quando o professor altera as práticas ou as trilhas. Abaixo dele, "Salvar plano" fica desligado. O servidor confere de novo ao salvar.
- A regra vale também para o plano contratado pelo professor (§5.4), que usa o preço do plano.
- **A tarifa do cartão não entra no mínimo.** No preço mínimo exato, um aluno que usa todas as práticas e paga com cartão deixa o professor alguns reais no negativo naquele mês. Se quiser evitar, somar a tarifa (3,99% + R$ 0,39) à regra (D16).
- **Quando o custo sobe depois de publicado** (média de uma lição sobe, lição nova entra numa trilha, preços de IA de 01/01/2027):
  - O sistema recalcula o mínimo todo dia.
  - Se um plano ficar abaixo, o professor recebe aviso e o plano **para de aceitar novas assinaturas** até ele ajustar o preço ou as práticas.
  - Quem já assina continua no preço antigo até o professor migrar (§5.1).
  - **Antes de 01/01/2027**, os planos que vão ficar abaixo com os preços novos recebem aviso com antecedência.

**Botão "Como calculamos"** abre uma explicação curta, com os números da própria trilha:
1. O que gasta IA (só o tutor; material e atividade não).
2. O custo de cada lição, de onde veio (sessões reais ou estimativa inicial) e quantas sessões entraram na média.
3. A conta do esperado e do máximo, com os números da trilha.
4. O teto por sessão, a cotação usada e a mudança de preço de 01/01/2027.
5. Que o desconto em cada repasse é o custo real de IA daquele aluno no período pago, visto no extrato.

**Ciclo de vida da assinatura**

| Estado | Na tela do aluno | Acesso |
|---|---|---|
| Ativa | — | Total |
| Cancelada, com período pago | "Sua assinatura termina em 12/12" | Total até o fim do período |
| Renovação recusada | "Sua assinatura terminou: o pagamento de 12/12 não foi aprovado." e "Assinar de novo" | **Termina na hora.** Progresso guardado |
| Encerrada | "Assinar de novo" | Bloqueado; progresso guardado |
| Assinou de novo | — | Volta de onde parou, com um período novo a partir do dia da nova cobrança |

**Cobrança recusada encerra a assinatura na hora.** Não há carência, não há "pagamento pendente" e o professor não recebe aviso:
- O aluno perde o acesso no momento em que a renovação é recusada. Como ele não está mais usando o tutor, não gera custo de IA.
- O período não pago não tem repasse, e o aluno sai da lista de assinantes do professor.
- Para voltar, o aluno assina de novo pela conta (§6.2). O progresso continua guardado, e o período novo começa no dia da nova cobrança.
- **No Stripe:** desligar as novas tentativas automáticas de cobrança (*Smart Retries*) e configurar a assinatura para ser **cancelada** na primeira falha. O webhook `invoice.payment_failed` marca a assinatura como encerrada. Assim o status `past_due` nunca é usado, e uma cobrança que passasse dias depois não renova um período que o aluno não teve.

### 5.3 Créditos do professor

Para usar a IA no dia a dia (gravar falas, testar lições, gerar lições e áudios, alunos particulares praticarem), o professor **coloca créditos antes**. Os créditos **não expiram**.

**A unidade é o real.** O saldo aparece como "R$ 42,30 em créditos", sem moeda própria. Assim a estimativa de cada ação (já em reais, §5.2) se compara direto com o saldo.

**Adicionar créditos** (tela "Créditos"):
- Valores prontos: R$ 20, R$ 50, R$ 100, R$ 200, ou outro valor a partir de R$ 20.
- Pix ou cartão, em pagamento único (Stripe Checkout `mode=payment`, na conta da plataforma). O Pix já funciona no Stripe para pagamento único no Brasil.
- O crédito entra quando o webhook confirma o pagamento (`checkout.session.completed` ou `payment_intent.succeeded` no Pix), nunca pela página de volta.
- **Recarga automática** (opcional): com cartão salvo, quando o saldo ficar abaixo de um valor, compra outro valor sozinho (`PaymentIntent` *off-session*). Desligada por padrão.
- **Usar o repasse como crédito** (opcional): o professor pode marcar que parte de cada repasse vire créditos em vez de ir para a conta. Sem tarifa de cartão de novo.

**Antes de cada ação, o custo aparece.** Exemplos: "Gravar 24 falas · ~R$ 1,30 · saldo depois: R$ 41,00"; "Testar a lição · até R$ 2,75". Sem saldo, o botão vira "Adicionar créditos" e a ação não começa.

**Reservar e acertar.** Uma sessão de teste ou de aluno particular **reserva** o teto da sessão (US$ 0,50, ~R$ 2,75) ao começar e **acerta** pelo custo real ao terminar, devolvendo a diferença. Gravação e geração reservam a estimativa e acertam ao fim. A reserva impede saldo negativo quando várias coisas rodam ao mesmo tempo.

**Saldo acabando**
- Aviso no painel e por e-mail quando o saldo fica abaixo de R$ 10 e quando zera.
- Com saldo zero, o professor não grava, não testa e não gera.
- Alunos particulares: o tutor deles fica pausado e mostra "O tutor do seu professor está pausado. As outras tarefas continuam." O professor recebe o aviso na hora.
- Assinantes de trilha **não** param: a prática deles sai do repasse.

**Extrato de créditos:** cada movimento com data, descrição, valor e saldo depois. Os tipos são compra, bônus, consumo, reserva (em andamento), acerto, estorno e ajuste. Consumos de alunos particulares aparecem agrupados por aluno e por dia, para a lista não ficar enorme.

**Créditos que não expiram**
- Ficam guardados enquanto a conta existir, mesmo sem plano pago.
- Ao excluir a conta, o saldo não usado é devolvido a pedido (D13). Validar com o contador: crédito pré-pago é receita só quando é consumido.
- A nota fiscal da plataforma sai na compra dos créditos.

**O que isso muda no código atual**
- `tutor_acesso` (beta liberado à mão) pode dar lugar ao saldo: quem tem créditos usa o tutor. O `max_sessoes_mes` continua só como limite de segurança.
- `tutor-gerar-licao` e `atividade-gerar-audio` passam a medir o custo, como `tutor-gravar-falas` já faz.
- Toda função que gasta IA do professor chama a mesma RPC de reservar e acertar, com trava na linha do saldo.

### 5.4 Plano contratado pelo professor

O professor pode colocar um aluno num plano **por dentro da plataforma**, sem o aluno cadastrar cartão nem passar pelo link de venda. Serve para o aluno que paga o professor por fora (Pix direto, pacote de aulas) ou que ganha o plano.

Fora quem paga, **é uma assinatura igual às outras**:
- **O professor paga o preço cheio do plano**, todo mês, no dia em que contratou. O padrão é debitar dos **créditos** (sem tarifa de cartão); o cartão salvo é a alternativa.
- O valor **volta no repasse um mês depois**, no fim do período, como qualquer assinatura, com os mesmos descontos: taxa da plataforma e custo real de IA das práticas desse aluno no período.
- Na prática, o custo para o professor é a taxa mais a IA do aluno. A tela mostra isso antes de confirmar.
- A taxa mínima de R$ 6 (§5.1) vale aqui também. Sem ela, um plano de R$ 5 contratado para os próprios alunos daria acesso ao tutor quase sem taxa.
- O aluno tem o mesmo limite de práticas, a mesma trilha e a mesma liberação de quem assinou pelo link.

**Fluxo** (tela Assinantes → "Contratar para um aluno"):
1. Escolhe o aluno: um aluno que já é dele, ou um novo (nome e, se quiser, e-mail).
2. Escolhe o plano e como pagar (créditos ou cartão).
3. Vê o resumo: valor debitado agora, quando renova, quanto volta no repasse e o custo estimado para ele por mês.
4. Confirma. O aluno aparece na lista como "Contratada por você".
5. Se o aluno ainda não tem conta, o professor recebe o link de cadastro (o mesmo de hoje, `link-cadastro`) para mandar no WhatsApp. Se já tem, a trilha aparece no painel dele na hora.

**Renovação:** todo mês, no mesmo dia, debita dos créditos. Sem saldo, tenta o cartão salvo (se houver) e avisa o professor. Se nenhum dos dois cobrir, a assinatura termina na hora, como uma cobrança recusada (§5). Aqui o professor é quem paga, então ele vê na tela de créditos que o plano daquele aluno terminou por falta de saldo. O professor pode cancelar quando quiser; vale até o fim do período pago.

**No Stripe:** não há cobrança de assinatura para o aluno. Com créditos, é um débito no extrato de créditos e uma linha de receita no repasse, sem passar pelo Stripe. Com cartão, é um `PaymentIntent` *off-session* no cartão do professor. A renovação é um job diário da plataforma, não uma `Subscription` do Stripe.

## 6. Compra sem conta (o fluxo crítico)

```
Link de venda (/p/:slug-do-plano)
  → aluno informa nome + e-mail (+ telefone opcional)
  → função plano-checkout cria Checkout Session na conta da plataforma (metadata.professor_id)
      customer_email = e-mail informado, metadata = { plano_id, nome }
  → Stripe Checkout (cartão / Pix quando disponível no Connect)
  → volta para /p/:slug/pronto?session_id=…
  → webhook checkout.session.completed (fonte da verdade):
       1. procura auth.user pelo e-mail
            não existe → auth.admin.createUser (sem senha, e-mail confirmado)
       2. procura aluno do MESMO professor com esse e-mail
            não existe → cria aluno (origem = 'loja')
            existe sem conta → liga à conta
       3. cria assinatura do aluno (status, período, stripe ids)
       4. matricula nas trilhas do plano
       5. envia e-mail "Sua trilha está pronta" com link mágico
  → a página /pronto troca o session_id (uma vez, válido por 30 min)
    por uma sessão logada e leva direto à trilha
```

Cuidados:
- **O webhook cria a conta, a página de retorno não.** A página só espera o webhook (polling curto) e então troca o `session_id` por login. Se o aluno fechar a aba, o e-mail resolve.
- Troca do `session_id` por login: só uma vez, só nos primeiros 30 minutos, só se o e-mail da sessão do Stripe bater com o do usuário criado.
- E-mail digitado errado: o aluno pagou e não recebe nada. Mitigação: confirmar o e-mail na tela ("Confira: ana@gmial.com") e o professor pode corrigir o e-mail do assinante na lista.
- Mesmo e-mail que já é **professor** na plataforma: anexar como aluno do outro professor (o modelo de perfis da 0022 já permite os dois papéis).
- Idempotência: o webhook pode chegar duas vezes; tudo indexado por `stripe_subscription_id`.

### 6.1 Quem já tem conta

| Caso | O que a pessoa vê | Por quê |
|---|---|---|
| **Já é aluno, está no painel** | Se o professor ligar "Mostrar no painel dos seus alunos", aparece a seção "Do seu professor" com a trilha. "Ver trilha" → página do plano dentro do app → "Assinar por R$ 89/mês" → Stripe com o e-mail da conta travado → volta ao painel com a trilha no topo. | Sem formulário: a pessoa já está identificada e nunca sai da sessão, então a volta não precisa trocar nada por login. |
| **Abriu o link de venda já logado** | A página pula o formulário e mostra "Assinando como Ana Souza · Não é você?". Um toque leva ao Stripe. | Em celular compartilhado é fácil assinar na conta errada. "Não é você?" sai da sessão e cai no fluxo de compra sem conta. |
| **Abriu o link sem entrar** | No topo, "Já tem conta? Entrar" (volta logado para o mesmo plano). Quem paga direto com um e-mail que já tem conta vê "Pagamento confirmado. A trilha já está na sua conta" e entra com a senha ou pelo link do e-mail. | **Não há login automático quando a conta já existe**: qualquer pessoa pode digitar o e-mail de outra e pagar, e entraria na conta dela. A tela também não diz, antes do pagamento, se o e-mail tem conta. |
| **É aluno de outro professor** | A mesma conta passa a ter dois professores. O painel ganha "Trocar" no topo, com a lista de professores. | O modelo já permite isso (`contas_aluno` é única por professor e e-mail), mas o painel não. |

O que isso exige do código atual:
- `painel-aluno-obter` busca a conta com `.eq('user_id', …).maybeSingle()`. Com duas linhas em `contas_aluno`, a chamada falha e o aluno vê "Conta não encontrada". O painel precisa receber o professor escolhido e listar os professores da conta.
- Hoje um login de professor que entra pela porta do aluno é derrubado (`ContaNaoEDeAluno` no `PainelAlunoPage`). Um professor que assina a trilha de outro professor precisa ter um perfil de aluno nessa mesma conta.
- Como a cobrança é feita na conta da plataforma (§5.1), o aluno tem **um único** `customer` no Stripe, mesmo assinando com dois professores. Guardar o `stripe_customer_id` por login (tabela `clientes_stripe`, chave `user_id`), e o `stripe_subscription_id` em `assinaturas_aluno`.
- **Limite de práticas de quem já usa o tutor:** um contador só. O limite do mês é o do plano somado ao que o professor já dava ao aluno particular (`tutor_sessoes_mes`).

### 6.2 Minha conta (área do aluno)

Um lugar só para o aluno cuidar das assinaturas, do cartão e dos dados. Abre pelo avatar no topo do painel, sem ocupar uma aba a mais na barra de baixo.

**Assinaturas**
- Lista de todas as assinaturas, de todos os professores. Cada uma mostra a trilha, o professor, o preço, o status (ativa, termina em, encerrada), a próxima cobrança, as práticas usadas no mês e o cartão usado.
- **Cancelar:**
  - Uma tela explica o que acontece: o acesso continua até o fim do período pago, o progresso fica guardado, e dá para assinar de novo e voltar de onde parou. O motivo é opcional (caro, sem tempo, terminei, não gostei, outro).
  - Ao confirmar, a assinatura fica marcada para não renovar (`cancel_at_period_end`), sem cancelar na hora.
  - Até o fim do período aparece **"Manter assinatura"**, que desfaz o cancelamento.
  - O professor vê o cancelamento e o motivo na lista de assinantes.
- **Assinar de novo:** quando a assinatura já terminou, o botão "Assinar de novo" leva ao checkout com o cartão salvo.
- **Plano contratado pelo professor (§5.4):** aparece como "Contratado pelo Prof. Marcos", sem botão de cancelar nem cartão: quem cancela é o professor. O aluno vê só "Fale com seu professor".
- **Assinatura encerrada por pagamento recusado:** aparece como "Encerrada · o pagamento de 13/11 não foi aprovado", com "Assinar de novo". Não há faixa de alerta nem prazo, porque o acesso já terminou.

**Pagamento**
- Os cartões salvos aparecem com bandeira, final e validade, e com as assinaturas que usam cada um.
- **Adicionar cartão:** Stripe Elements com `SetupIntent`, dentro do app. O número do cartão nunca passa pelo nosso servidor.
- **Trocar o cartão de uma assinatura:** escolher outro cartão salvo, ou adicionar um.
- **Remover cartão:** `PaymentMethod.detach`.
  - Se nenhuma assinatura ativa usa o cartão, ele é removido direto.
  - Se alguma usa, a tela pede para escolher outro cartão para ela antes. Ou, se for o único cartão, avisa: "Sua assinatura de Inglês para Viajar renova em 12/12 e vai precisar de um cartão. Remover mesmo assim?" Se o aluno confirmar, a assinatura termina na data da renovação, porque não haverá cartão para cobrar.
- **Recibos:** lista de pagamentos com data, valor e trilha, e o recibo do Stripe para abrir.
- **Por que tela própria e não o portal do Stripe:** o portal tira o aluno do app e não sabe de trilha, progresso nem plano contratado pelo professor. Ele fica só como reserva enquanto a tela não existir.

**Explorar trilhas**
- Mostra as trilhas à venda **dos professores do aluno**, com busca por nome e filtro por professor. As que ele já assina aparecem marcadas.
- Tocar numa trilha leva à página do plano já logado (§6.1): "Assinando como…" e um toque até o pagamento.
- **Trilhas de outros professores, que o aluno não conhece, ficam de fora.** Seria um marketplace, que o PRD marca como "não planejado" (D15).

**Dados e privacidade**
- Nome, e-mail e senha (ou o link de entrada por e-mail).
- Avisos: e-mail quando uma cobrança falha e antes de renovar (opcional).
- **Excluir conta (LGPD):** primeiro cancela todas as assinaturas, remove os cartões do Stripe e mostra até quando vai o acesso. A exclusão roda na hora, ou ao fim do último período pago, se o aluno preferir.

**Fora desta entrega:** trocar de plano (upgrade ou downgrade), pausar assinatura, nota fiscal do professor para o aluno.

## 7. Leitor de material

Hoje o aluno abre o material com `window.open` de uma URL assinada (`MateriaisAlunoPage`). Cada navegador decide o que fazer com isso:

| Navegador | O que acontece hoje com um PDF |
|---|---|
| Chrome no Android | Não mostra: baixa o arquivo. O aluno sai do app. |
| Safari no iPhone | Abre numa aba nova, fora do app. Dentro de `<iframe>` mostraria só a primeira página. |
| Navegador interno do WhatsApp e do Instagram | Varia: alguns bloqueiam a aba nova, outros baixam. É de onde vêm os links. |
| Word (`docx`) | Nenhum navegador mostra. Sempre baixa. |
| Computador | Funciona, mas numa aba fora do app. |

Na trilha o material é um passo que precisa ser concluído. Por isso o leitor tem de ficar **dentro do app**, com o botão "Li este material".

**A tela** (`/painel/materiais/:id` e o passo da trilha usam a mesma):
- Barra de cima: voltar, título, "página 2 de 6", diminuir e aumentar o zoom.
- Páginas em coluna, largura da tela, rolagem vertical. Pinça para zoom no celular.
- Abre na página onde o aluno parou (guardar a última página por aluno e material).
- No fim do material: **"Li este material"**, que conclui o passo e mostra o próximo.
- "Baixar original" só se o professor permitir (liga e desliga por material).

**Cada tipo de material**

| Tipo | Como mostrar |
|---|---|
| PDF | pdf.js desenhando cada página em `<canvas>`. Nunca `<iframe>`, `<embed>` ou o leitor do navegador. |
| Imagem | `<img>` com zoom. Várias fotos de um mesmo material viram páginas. |
| Áudio | Player próprio (`<audio>` com controles do app), velocidade 0,75× e 1×. |
| Texto | HTML formatado, fonte ajustável. |
| Word | Converter para PDF **no upload**, e o leitor mostra o PDF. Até lá, o `docx` vira HTML no navegador (mammoth.js), com "Baixar original". |

**O que faz funcionar em todos os navegadores**
1. **Build legada do pdf.js.** O app usa `pdfjs-dist` 6, que exige navegador recente. Safari mais antigo (iOS 15 e 16) e WebViews antigos de Android quebram. Carregar `pdfjs-dist/legacy/build/pdf.mjs` quando faltar recurso moderno (ex.: `Promise.withResolvers`), e a build normal no resto. `carregarPdfjs()` em `lib/arquivo.ts` é o ponto único para isso.
2. **Desenhar só o que está perto da tela.** O Safari do iPhone tem teto de memória para canvas e fecha a aba sem aviso quando ele estoura. Desenhar a página visível e as vizinhas, liberar as distantes (`canvas.width = 0`) e limitar a densidade a `min(devicePixelRatio, 2)`.
3. **Baixar por partes.** Usar o pdf.js com requisições por faixa (o Storage aceita `Range`) e `disableAutoFetch`. A primeira página aparece antes do arquivo inteiro chegar, o que importa no 4G.
4. **URL assinada que vence.** Se a leitura passar da validade, pedir uma URL nova e continuar da mesma página, sem erro para o aluno.
5. **Sem recurso que o navegador do WhatsApp bloqueia:** nada de aba nova, download automático ou tela cheia obrigatória.
6. **Falha com saída.** Se o pdf.js não conseguir abrir o arquivo, mostrar "Não deu para abrir aqui" e o botão "Baixar o arquivo". O passo pode ser concluído do mesmo jeito.

**Navegadores para testar antes de liberar:** Chrome e Edge (Windows), Safari e Chrome (macOS), Firefox, Safari no iOS 15 e no iOS atual, Chrome no Android, Samsung Internet, navegador interno do WhatsApp (Android e iOS). O teste no Fold via adb segue a regra do projeto.

**Fora desta entrega:** busca no texto, marcação e anotação do aluno, leitura sem internet.

O leitor não depende das trilhas e pode ser entregue antes, na tela de materiais que já existe.

## 8. Telas

Professor (área **Tutor**, que vira item próprio no menu):
1. **Trilhas** — lista com status (rascunho / publicada), nº de módulos, assinantes.
2. **Editor da trilha** — módulos e passos arrastáveis + painel de configuração (§4) + pré-visualização do que o aluno vê.
3. **Planos** — criar/editar plano, link de venda, pré-visualização da página pública.
4. **Assinantes** — lista com pagamento, uso de interações, progresso; ações: dar práticas, contratar o plano para um aluno, cancelar.
5. **Extrato e repasse** — mês em andamento e meses fechados: receita, cartão, taxa, custo de IA por aluno e por lição, valor e data do repasse. Conectar a conta de recebimento fica aqui.

Aluno:
6. **Página de venda** (pública, sem login; reconhece quem já está logado).
7. **Pagamento + conta criada**.
8. **Trilha** em sequência ou em abas, com o contador de interações.
9. **Leitor de material** (§7).
10. **Seletor de professor** no painel, para quem é aluno de mais de um.
11. **Créditos** — saldo, adicionar (Pix ou cartão), recarga automática, extrato de créditos.
12. **Minha conta (aluno)** — assinaturas e cancelamento, cartões e recibos, explorar trilhas dos seus professores, dados e exclusão da conta (§6.2).

## 9. Fases

| Fase | Entrega | Por que nessa ordem |
|---|---|---|
| **F0 — Leitor de material** | Leitor dentro do app para PDF, imagem, áudio e texto, na tela de materiais que já existe. | Não depende de nada novo e corrige um problema de hoje. |
| **F1 — Trilha nova, sem venda** | Módulos, passos de 3 tipos, navegação e liberação, conclusão de passo, visão do aluno. Professor atribui a alunos que já tem. | Valida o formato com alunos reais antes de envolver dinheiro. |
| **F2 — Créditos, plano e custo** | Créditos pré-pagos (Pix e cartão), reservar e acertar, medir custo onde ainda não se mede; plano com interações/mês; estimativa de custo por lição e por aluno, com "Como calculamos". | O limite por plano substitui o `tutor_sessoes_mes` do professor. |
| **F3 — Venda e repasse** | Stripe Connect, link de venda, compra sem conta, webhook, assinantes, ciclo de vida, extrato e repasse por cobrança, um mês depois, com taxa e custo de IA descontados. | A parte com mais risco (dinheiro, conta criada pelo servidor). |
| **F4 — Ajustes** | Cupom, período de teste, Pix recorrente, troca de plano, relatório de receita. | Depois de ver como os primeiros professores vendem. |

## 10. Onde isso esbarra no que já existe

1. **A trilha atual proíbe cadeado.** A 0001 diz "não existe etapa liberada… é isso que torna impossível o aluno ficar travado" (regra-chave 3). A nova trilha precisa de cadeado. Proposta: o cadeado é **calculado na leitura** (a partir das conclusões e das datas), nunca gravado — a regra continua valendo no espírito: nenhum estado que alguém precise destravar à mão.
2. **Duas coisas chamadas trilha.** Proposta: a nova substitui a antiga. Cada trilha antiga migra como "1 módulo, livre com ordem sugerida, tudo de uma vez" — o comportamento de hoje.
3. **Etapa só aceita atividade** (`trilha_etapas.atividade_id not null`). O passo precisa ser um de três tipos — mesmo padrão de `turmas_conteudos` (`num_nonnulls(...) = 1`).
4. **Limite de alunos do plano do professor.** Comprador não deveria contar no teto de alunos do plano Pro, senão vender trava o professor. Proposta: alunos com `origem = 'loja'` ficam fora da contagem.
5. **"O aluno nunca é bloqueado por cadastro" (PRD §1).** Continua verdade: a compra cria a conta sozinha, sem senha.
6. **Tutor em beta fechado (`tutor_acesso`).** Vender exige que o professor tenha o tutor liberado; a liberação continua manual até a F3.
7. **Stripe hoje só cobra o professor** (`assinaturas` é do professor). A cobrança do aluno é outra tabela, outro webhook endpoint (eventos de contas conectadas) e outra chave de assinatura de webhook.

### Esboço de tabelas

```
trilhas            + navegacao (sequencia|sugerida|abas), permite_abas bool,
                     liberacao (tudo|progresso|periodo|progresso_e_periodo), liberacao_dias int,
                     status (rascunho|publicada)
trilha_modulos     id, trilha_id, ordem, titulo
trilha_passos      id, modulo_id, ordem, opcional bool, nota_minima smallint null,
                     atividade_id | material_id | licao_tutor_id  (exatamente um)
passo_conclusoes   aluno_id, passo_id, concluido_em      (material marcado como lido;
                     atividade e tutor são derivados de atribuicoes / tutor_sessoes)
planos_aluno       id, professor_id, slug, nome, descricao, preco_centavos,
                     interacoes_mes, ativo, stripe_product_id, stripe_price_id
planos_aluno_trilhas   plano_id, trilha_id
assinaturas_aluno  id, plano_id, aluno_id, status, periodo_inicio, periodo_fim, motivo_cancelamento,
                     pago_por (aluno|professor), forma (stripe|creditos|cartao_professor),
                     cancela_no_fim, stripe_customer_id, stripe_subscription_id,
                     interacoes_extra int
professores        + stripe_connect_id, connect_pronto bool, creditos_centavos (saldo; só RPC escreve),
                     recarga_auto bool, recarga_abaixo_centavos, recarga_valor_centavos
creditos_movimentos id, professor_id, tipo (compra|bonus|consumo|reserva|acerto|estorno|ajuste),
                     valor_centavos (+/−), saldo_depois_centavos, origem (sessao|falas|licao|audio|atividade|repasse|stripe),
                     ref_id, descricao, criado_em
repasses           id, professor_id, assinatura_id, cobranca_id, periodo_inicio, periodo_fim (= data do repasse),
                     receita_centavos, tarifa_cartao_centavos, taxa_centavos,
                     custo_ia_centavos, estornos_centavos, debito_creditos_centavos, valor_centavos,
                     cotacao_usd, stripe_transfer_id, status (aguardando|transferido|negativo)
tutor_licoes       + custo_estimado_usd (cache da média; recalculado por job diário)
alunos             + origem (professor|loja)
```

## 11. Decisões em aberto

| # | Pergunta | Proposta |
|---|---|---|
| D1 | Quanto a plataforma fica de cada venda? | **Decidido:** 10% do valor de cada assinatura, com mínimo de R$ 6 por assinatura por mês, pago pelo professor e descontado no repasse (§5.1). Vale para assinaturas pagas pelo aluno e contratadas pelo professor. |
| D2 | Quem paga o custo de IA das interações vendidas? | **Decidido:** o professor, pelo custo real, descontado no repasse (§5.1 e §5.2). |
| D3 | O tutor vira um add-on pago **para o professor** também? | Não: com a IA cobrada pelo uso, não precisa de mensalidade à parte. |
| D9 | Cobrar os testes do professor e a gravação das falas? | **Decidido:** sim, dos créditos (§5.3). |
| D10 | Repasse negativo? | Debita dos créditos; o que faltar vira saldo devedor, descontado no próximo repasse ou na próxima compra. |
| D11 | Cotação do dólar | Cotação do dia na estimativa e em cada débito de crédito; em cada repasse, a do dia do repasse. |
| D12 | Gerar atividade acima da cota do plano usa créditos? | Sim: a cota mensal continua, e quem passar dela gasta créditos em vez de ficar travado. |
| D13 | Devolver créditos não usados? | Só ao excluir a conta, a pedido. Fora isso, não expiram e não são sacáveis. |
| D14 | Bônus em recargas maiores ou crédito de boas-vindas? | R$ 10 de boas-vindas para testar o tutor; bônus por pacote fica para depois. |
| D15 | O aluno pode descobrir trilhas de professores que não conhece? | Não agora: seria um marketplace (PRD: não planejado). Explorar mostra só as trilhas dos professores dele. |
| D16 | A tarifa do cartão entra no preço mínimo? | Hoje não: a regra é IA máxima + taxa. Somar a tarifa evita prejuízo no pior caso e sobe o mínimo em ~R$ 1. |
| D4 | A trilha nova substitui a antiga? | Sim, com migração automática (§10.2). |
| D5 | Pix recorrente? | Começar só com cartão; Pix entra na F4. |
| D6 | Período de teste grátis? | Fora da F3. O professor pode contratar o plano para um aluno (§5.4) nos primeiros casos. |
| D7 | Professor pode vender trilha avulsa (pagamento único)? | Fora do escopo; o modelo é assinatura. Fácil de somar depois (Checkout `mode=payment`). |
| D8 | Nota fiscal do professor ao aluno | Responsabilidade do professor; a plataforma emite só sobre a própria taxa. Validar com contador. |
