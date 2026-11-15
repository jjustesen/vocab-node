-- ============================================================================
-- 0033 — Venda do plano ao aluno e repasse ao professor
--        (docs/TUTOR-TRILHAS.md §5.1, §5.4, §6; fase F3)
-- ============================================================================
--
--   contas_recebimento   a conta Stripe Connect (Express) do professor
--   planos_aluno         + slug do link de venda, + Price do Stripe em uso
--   clientes_stripe      um customer do Stripe por LOGIN (o aluno com dois
--                        professores tem um cartão só)
--   assinaturas_aluno    quem assina qual plano, de que período a que período
--   cobrancas_aluno      uma linha por cobrança, com o repasse dela: sai um
--                        mês depois, no fim do período que ela pagou
--
-- Tudo é escrito pelas funções (service_role). O professor só lê o que é dele.
--
-- ── Acesso ──────────────────────────────────────────────────────────────────
--
-- Assinar matricula o aluno nas trilhas do plano (trilha_alunos com
-- `assinatura_id`); a 0030 já dá material e lição a quem entra. Encerrar a
-- assinatura PAUSA essas matrículas e tira o material e as lições que vieram
-- delas: o progresso fica guardado, e assinar de novo reativa tudo.
-- ============================================================================

-- ── Conta de recebimento ────────────────────────────────────────────────────

create table contas_recebimento (
  professor_id       uuid        primary key references professores (id) on delete cascade,
  stripe_account_id  text        not null unique,
  -- Cadastro completo no Stripe: dá para transferir.
  pronta             boolean     not null default false,
  atualizado_em      timestamptz not null default now()
);

alter table contas_recebimento enable row level security;
create policy prof_le_propria on contas_recebimento for select using (professor_id = auth.uid());

-- ── Plano: link de venda e preço no Stripe ──────────────────────────────────

alter table planos_aluno
  add column slug                  text unique,
  -- Aparece em "Do seu professor" no painel de quem já é aluno dele (§6.1).
  add column mostrar_no_painel     boolean not null default true,
  -- O Price do Stripe vale para este preço; mudou o preço, a função cria outro.
  add column stripe_price_centavos int;

-- O slug nasce do nome + 4 letras, para dois "Inglês para viagem" não baterem.
create or replace function public.slug_do_plano()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null then
    new.slug := trim(both '-' from regexp_replace(
                  lower(translate(new.nome, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')),
                  '[^a-z0-9]+', '-', 'g'))
                || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
  end if;
  return new;
end;
$$;

create trigger slug_do_plano before insert on planos_aluno
  for each row execute function public.slug_do_plano();

-- Os planos criados na F2, antes do trigger.
update planos_aluno
   set slug = trim(both '-' from regexp_replace(lower(nome), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(id::text), 1, 4)
 where slug is null;

-- ── Aluno que veio da loja ──────────────────────────────────────────────────
--
-- Fica fora do limite de alunos do plano do professor (§10.4): vender não pode
-- travar o professor.

alter table alunos add column origem text not null default 'professor' check (origem in ('professor', 'loja'));

-- ── Customer do Stripe por login ────────────────────────────────────────────

create table clientes_stripe (
  user_id             uuid        primary key references auth.users (id) on delete cascade,
  stripe_customer_id  text        not null unique,
  criado_em           timestamptz not null default now()
);

alter table clientes_stripe enable row level security; -- sem policy: só service_role

-- ── Assinaturas ─────────────────────────────────────────────────────────────

create table assinaturas_aluno (
  id                      uuid        primary key default gen_random_uuid(),
  plano_id                uuid        not null references planos_aluno (id) on delete restrict,
  professor_id            uuid        not null references professores (id) on delete cascade,
  aluno_id                uuid        not null references alunos (id) on delete cascade,
  -- Cancelada com período pago continua 'ativa', com cancela_no_fim.
  status                  text        not null default 'ativa' check (status in ('ativa', 'encerrada')),
  cancela_no_fim          boolean     not null default false,
  motivo_cancelamento     text,
  periodo_inicio          timestamptz not null,
  periodo_fim             timestamptz not null,
  preco_centavos          int         not null,
  praticas_mes            smallint    not null,
  -- Práticas avulsas que o professor somou neste período (§5).
  praticas_extra          smallint    not null default 0,
  pago_por                text        not null default 'aluno' check (pago_por in ('aluno', 'professor')),
  forma                   text        not null default 'stripe' check (forma in ('stripe', 'creditos')),
  stripe_subscription_id  text        unique,
  -- A compra criou a conta: a página de volta pode entrar por ela UMA vez (§6).
  conta_nova              boolean     not null default false,
  login_trocado_em        timestamptz,
  encerrada_em            timestamptz,
  motivo_encerramento     text        check (motivo_encerramento in ('cancelada', 'pagamento_recusado', 'sem_creditos', 'professor')),
  criado_em               timestamptz not null default now()
);

create index assinaturas_aluno_professor_idx on assinaturas_aluno (professor_id, status);
create index assinaturas_aluno_aluno_idx on assinaturas_aluno (aluno_id);
-- Uma assinatura ativa por aluno e plano: assinar de novo reativa, não duplica.
create unique index assinatura_ativa_unica on assinaturas_aluno (plano_id, aluno_id) where status = 'ativa';

alter table assinaturas_aluno enable row level security;
create policy prof_le_proprias on assinaturas_aluno for select using (professor_id = auth.uid());

-- ── Cobranças e repasses ────────────────────────────────────────────────────
--
-- Os valores do repasse ficam nulos até ele ser calculado, no fim do período:
-- só então o custo de IA está fechado e a contestação do cartão passou.

create table cobrancas_aluno (
  id                  uuid        primary key default gen_random_uuid(),
  assinatura_id       uuid        not null references assinaturas_aluno (id) on delete cascade,
  professor_id        uuid        not null references professores (id) on delete cascade,
  aluno_id            uuid        not null references alunos (id) on delete cascade,
  periodo_inicio      timestamptz not null,
  -- = a data do repasse.
  periodo_fim         timestamptz not null,
  valor_centavos      int         not null,
  tarifa_centavos     int,
  taxa_centavos       int,
  custo_ia_centavos   int,
  estorno_centavos    int         not null default 0,
  repasse_centavos    int,
  -- A parte do repasse negativo que saiu dos créditos do professor.
  debito_creditos     numeric(12,4),
  stripe_invoice_id   text        unique,
  stripe_charge_id    text,
  stripe_transfer_id  text,
  -- aguardando: o período não terminou. sem_conta: terminou, falta o cadastro
  -- de recebimento. negativo: a IA passou do que sobrou.
  status              text        not null default 'aguardando'
                      check (status in ('aguardando', 'transferido', 'sem_conta', 'negativo', 'estornado')),
  repassado_em        timestamptz,
  criado_em           timestamptz not null default now()
);

create index cobrancas_aluno_professor_idx on cobrancas_aluno (professor_id, periodo_fim);
create index cobrancas_aluno_vencidas_idx on cobrancas_aluno (periodo_fim) where status in ('aguardando', 'sem_conta');

alter table cobrancas_aluno enable row level security;
create policy prof_le_proprias on cobrancas_aluno for select using (professor_id = auth.uid());

-- Créditos: o plano contratado pelo professor sai deles (§5.4).
alter table creditos_movimentos drop constraint creditos_movimentos_origem_check;
alter table creditos_movimentos add constraint creditos_movimentos_origem_check
  check (origem in ('stripe', 'sessao', 'teste', 'falas', 'licao', 'manual', 'assinatura', 'repasse'));

-- ── Matrícula pela assinatura ───────────────────────────────────────────────

alter table trilha_alunos add column assinatura_id uuid references assinaturas_aluno (id) on delete set null;

-- Põe o aluno nas trilhas do plano (ou reativa, se já esteve) e dá o acesso aos
-- passos. Chamada ao criar e ao renovar uma assinatura que estava encerrada.
create or replace function public.ativar_assinatura_aluno(p_assinatura uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a assinaturas_aluno;
  t uuid;
begin
  select * into a from assinaturas_aluno where id = p_assinatura;
  for t in select trilha_id from planos_aluno_trilhas where plano_id = a.plano_id loop
    insert into trilha_alunos (trilha_id, aluno_id, assinatura_id)
    values (t, a.aluno_id, a.id)
    on conflict (trilha_id, aluno_id) do update
      set assinatura_id = excluded.assinatura_id,
          status = case when trilha_alunos.status = 'pausada' then 'ativa'::trilha_aluno_status else trilha_alunos.status end;
    -- O insert novo já vinculou pelo trigger; o reativado precisa de novo.
    perform vincular_passos_da_trilha(t, a.aluno_id);
  end loop;
end;
$$;

-- Encerra: pausa as matrículas que vieram desta assinatura e tira o material e
-- as lições das trilhas dela. O progresso (respostas, sessões, conclusões) fica.
create or replace function public.encerrar_assinatura_aluno(p_assinatura uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a assinaturas_aluno;
begin
  update assinaturas_aluno
     set status = 'encerrada', encerrada_em = now(), motivo_encerramento = p_motivo
   where id = p_assinatura and status = 'ativa'
  returning * into a;
  if not found then
    return;
  end if;

  update trilha_alunos set status = 'pausada'
   where assinatura_id = a.id and status = 'ativa';

  delete from materiais_alunos m
   using trilha_etapas e, trilha_alunos ta
   where ta.assinatura_id = a.id and e.trilha_id = ta.trilha_id
     and m.aluno_id = a.aluno_id and m.material_id = e.material_id;

  delete from tutor_licoes_alunos l
   using trilha_etapas e, trilha_alunos ta
   where ta.assinatura_id = a.id and e.trilha_id = ta.trilha_id
     and l.aluno_id = a.aluno_id and l.licao_id = e.licao_tutor_id;
end;
$$;

revoke all on function public.ativar_assinatura_aluno(uuid) from public, anon, authenticated;
revoke all on function public.encerrar_assinatura_aluno(uuid, text) from public, anon, authenticated;
grant execute on function public.ativar_assinatura_aluno(uuid) to service_role;
grant execute on function public.encerrar_assinatura_aluno(uuid, text) to service_role;

-- O login de um e-mail, para a compra sem conta (§6) ligar o pagamento a quem
-- já existe em vez de criar um segundo usuário. Só o servidor chama.
create or replace function public.usuario_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;

revoke all on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;
