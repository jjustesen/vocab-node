# Stripe — assinaturas dos planos

Como o pagamento funciona e o passo a passo para colocar no ar.

## Arquitetura em uma olhada

```
Professor clica "Assinar" (/plano)
  → Edge Function stripe-checkout cria a sessão e devolve a URL
  → professor paga no Checkout do Stripe
  → Stripe chama a Edge Function stripe-webhook
  → webhook grava assinaturas + professores.plano   ← única escrita de plano
  → /plano?checkout=sucesso refaz as queries até o plano refletir
```

- `professores.plano` é **a verdade** sobre limites (alunos, gerações IA). Todo
  o código de cota lê só ela.
- `assinaturas` (migration 0008) é o espelho do Stripe: customer, subscription,
  status, fim do período. **Só o webhook escreve** (service_role); o professor
  tem apenas SELECT da própria linha.
- Trocar de plano, trocar cartão, baixar fatura e cancelar acontecem no
  **Billing Portal** (Edge Function `stripe-portal`) — não são telas nossas.
- Planos e limites: `gratuito` (3 alunos, 5 IA/mês), `pro` (20 alunos,
  30 IA/mês, R$ 100), `ilimitado` (sem teto de alunos, 100 IA/mês, R$ 300).
  Definidos em `app/src/lib/planos.ts` + `supabase/functions/_shared/planos.ts`
  (espelhados — mude de um lado, mude do outro).

## Setup (uma vez por ambiente — test e live)

### 1. Produtos e preços no Stripe

No [Dashboard](https://dashboard.stripe.com) → Product catalog → Add product:

| Produto | Preço | Recorrência |
|---|---|---|
| Vocab Node Pro | R$ 100,00 BRL | Mensal |
| Vocab Node Ilimitado | R$ 300,00 BRL | Mensal |

Guarde os dois `price_...` gerados.

### 2. Billing Portal

Settings → Billing → Customer portal:

- Ative **cancelamento** (no fim do período, não imediato — o webhook trata os
  dois, mas fim do período é a experiência prometida na tela /plano).
- Ative **troca de plano** e adicione os dois preços à lista de produtos que o
  cliente pode escolher.
- Salve a configuração (sem isso o portal responde erro).

### 3. Secrets das Edge Functions

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_PRO=price_... STRIPE_PRICE_ILIMITADO=price_... APP_URL=https://SEU-APP.com
```

(`APP_URL` é a origem do front — em dev local, `http://localhost:5173`.)

### 4. Deploy das functions

```bash
supabase functions deploy stripe-checkout
```

```bash
supabase functions deploy stripe-portal
```

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

O `--no-verify-jwt` do webhook é obrigatório: o Stripe não manda JWT do
Supabase — a autenticação é a assinatura do evento, verificada dentro da
função. As outras duas ficam com verify-jwt ligado (padrão).

### 5. Webhook no Stripe

Developers → Webhooks → Add endpoint:

- URL: `https://<PROJECT-REF>.supabase.co/functions/v1/stripe-webhook`
- Eventos: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`
- Copie o `whsec_...` e registre:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

### 6. Migration

```bash
supabase db push
```

Aplica a 0008 (`plano_tipo` ganha `ilimitado`; tabela `assinaturas`).

## Testar (modo test)

1. `/plano` → Assinar Pro → pagar com o cartão de teste `4242 4242 4242 4242`
   (qualquer validade futura e CVC).
2. Voltando ao app, em segundos o plano vira Pro (o webhook chegou) e a tela
   mostra "Pagamento confirmado".
3. "Gerenciar assinatura" → trocar para Ilimitado → o webhook atualiza o plano.
4. Cancelar no portal → a tela /plano avisa a data em que volta ao Gratuito;
   quando o Stripe encerra a subscription, o webhook rebaixa o plano.
5. Cartão que falha renovação: `4000 0000 0000 0341` — o status vira
   `past_due` (o professor mantém o acesso enquanto o Stripe retenta) e a tela
   mostra o aviso de pagamento pendente.

Dica: `stripe listen --forward-to https://<PROJECT-REF>.supabase.co/functions/v1/stripe-webhook`
reencaminha eventos para testar sem esperar o Stripe.

## Decisões que valem saber

- **past_due mantém o acesso.** O Stripe retenta a cobrança por dias; cortar o
  professor no primeiro cartão recusado seria brutal. Se todas as tentativas
  falharem, a subscription vira `canceled`/`unpaid` e aí o webhook rebaixa.
- **Downgrade nunca apaga nada.** Voltar ao gratuito com 20 alunos ativos só
  impede *adicionar* novos além do limite — os existentes continuam.
- **Checkout duplo é bloqueado.** Quem já assina e quer outro plano é mandado
  ao portal (um segundo checkout criaria duas cobranças em paralelo).
- **Webhook idempotente.** Cada evento sincroniza o estado *atual* da
  subscription via upsert; evento repetido ou fora de ordem converge.
