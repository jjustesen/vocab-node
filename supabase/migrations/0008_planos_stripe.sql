-- ============================================================================
-- Planos pagos via Stripe.
--
-- Três planos (espelhados em app/src/lib/planos.ts e
-- supabase/functions/_shared/planos.ts — mude de um lado, mude do outro):
--
--   gratuito   → 3 alunos ativos,  5 gerações IA/mês, R$ 0
--   pro        → 20 alunos ativos, 30 gerações IA/mês, R$ 100/mês
--   ilimitado  → alunos sem teto, 100 gerações IA/mês, R$ 300/mês
--
-- QUEM ESCREVE ONDE (leia antes de mexer):
--   `professores.plano` continua sendo A verdade sobre limites — todo o
--   código de cota lê só ela. A tabela `assinaturas` é o espelho do estado
--   no Stripe (customer, subscription, status, período) e SÓ o webhook
--   escreve nela (service_role). O professor apenas lê a própria linha; a
--   ausência de policy de escrita é proposital.
-- ============================================================================

-- PG12+: ADD VALUE pode rodar em transação desde que o novo valor não seja
-- usado nesta mesma migration — e não é.
alter type plano_tipo add value if not exists 'ilimitado';

create table assinaturas (
  professor_id            uuid        primary key references professores (id) on delete cascade,
  stripe_customer_id      text        unique,
  stripe_subscription_id  text        unique,
  plano                   plano_tipo  not null default 'gratuito',
  -- Status cru do Stripe ('active', 'past_due', 'canceled', ...) — guardado
  -- como texto de propósito: o Stripe cria status novos sem avisar e um
  -- enum aqui quebraria o webhook.
  status                  text        not null default 'inativa',
  periodo_fim             timestamptz,            -- fim do período já pago
  cancela_no_fim          boolean     not null default false,
  atualizado_em           timestamptz not null default now()
);

alter table assinaturas enable row level security;

-- Leitura: o professor vê a própria assinatura (tela "Plano e cobrança").
-- Escrita: nenhuma policy — só o webhook, com service_role, que ignora RLS.
create policy prof_le_propria on assinaturas
  for select using (professor_id = auth.uid());
