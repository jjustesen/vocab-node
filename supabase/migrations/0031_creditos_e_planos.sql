-- ============================================================================
-- 0031 — Créditos do professor, custo das lições e plano do aluno
--        (docs/TUTOR-TRILHAS.md §5.2, §5.3; fase F2)
-- ============================================================================
--
-- ── Créditos ────────────────────────────────────────────────────────────────
--
-- O professor coloca créditos ANTES de usar a IA do tutor (gravar falas,
-- testar, gerar lição, alunos particulares praticando). Em reais, sem moeda
-- própria, e não expiram.
--
--   creditos             o saldo, uma linha por professor. Só as funções abaixo
--                        escrevem; o professor só lê.
--   creditos_movimentos  o extrato. Cada linha diz quanto entrou (+) ou saiu (−)
--                        e o saldo logo depois.
--
-- ── Reservar e acertar ──────────────────────────────────────────────────────
--
-- Quem vai gastar IA reserva antes (`creditos_reservar`): o valor sai do saldo
-- na hora, numa trava da linha do saldo, então duas ações ao mesmo tempo nunca
-- deixam o saldo negativo. Ao terminar, `creditos_acertar` troca a reserva pelo
-- custo real e devolve a diferença. A linha da reserva VIRA a linha do consumo
-- no extrato: o professor vê uma linha por ação, não duas.
--
-- Uma sessão do tutor não avisa quando acaba (o aluno fecha a aba). Por isso a
-- reserva de sessão é acertada depois, pelo custo gravado em tutor_sessoes,
-- quando a sessão já terminou ou passou de 2 h (`creditos_acertar_vencidas`).
-- Isso roda antes de cada reserva nova e sempre que o professor abre a tela.
--
-- ── Dinheiro ────────────────────────────────────────────────────────────────
--
-- numeric(12,4) em reais: o custo de um turno do tutor é fração de centavo.
-- A cotação do dólar é fixa por enquanto (`cotacao_dolar`), a mesma do app
-- (REAIS_POR_DOLAR). Trocar por uma cotação diária é mudar só esta função.
-- ============================================================================

create or replace function public.cotacao_dolar()
returns numeric
language sql
immutable
as $$ select 5.5::numeric $$;

create table creditos (
  professor_id   uuid          primary key references professores (id) on delete cascade,
  saldo          numeric(12,4) not null default 0,
  atualizado_em  timestamptz   not null default now()
);

alter table creditos enable row level security;

create policy prof_le_proprio on creditos
  for select using (professor_id = auth.uid());

create table creditos_movimentos (
  id            uuid          primary key default gen_random_uuid(),
  professor_id  uuid          not null references professores (id) on delete cascade,
  tipo          text          not null check (tipo in ('compra', 'bonus', 'reserva', 'consumo', 'estorno', 'ajuste')),
  origem        text          not null check (origem in ('stripe', 'sessao', 'teste', 'falas', 'licao', 'manual')),
  -- + entrou, − saiu. Numa reserva aberta é − o valor reservado.
  valor         numeric(12,4) not null,
  saldo_depois  numeric(12,4) not null,
  -- Só em reserva: quanto foi separado (para devolver a diferença no acerto).
  reservado     numeric(12,4),
  -- O que gerou o movimento: id da sessão, da lição, do checkout do Stripe.
  ref           text,
  descricao     text          not null,
  criado_em     timestamptz   not null default now(),
  acertado_em   timestamptz
);

create index creditos_movimentos_professor_idx on creditos_movimentos (professor_id, criado_em desc);
create index creditos_reservas_abertas_idx on creditos_movimentos (professor_id) where tipo = 'reserva';
-- O webhook do Stripe pode chegar duas vezes: a mesma compra não entra de novo.
create unique index creditos_compra_unica on creditos_movimentos (origem, ref) where tipo in ('compra', 'estorno');

alter table creditos_movimentos enable row level security;

create policy prof_le_proprios on creditos_movimentos
  for select using (professor_id = auth.uid());

-- ── Reservar ────────────────────────────────────────────────────────────────
--
-- Sem saldo: erro 'saldo_insuficiente' (a função traduz para 402). O saldo
-- atual vai no DETAIL, para a mensagem dizer quanto falta.

create or replace function public.creditos_reservar(
  p_professor uuid, p_valor numeric, p_origem text, p_ref text, p_descricao text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_saldo numeric;
  v_id uuid;
begin
  perform creditos_acertar_vencidas(p_professor);

  insert into creditos (professor_id) values (p_professor) on conflict do nothing;
  select saldo into v_saldo from creditos where professor_id = p_professor for update;
  if v_saldo < p_valor then
    raise exception 'saldo_insuficiente' using detail = v_saldo::text;
  end if;

  update creditos set saldo = saldo - p_valor, atualizado_em = now()
   where professor_id = p_professor
  returning saldo into v_saldo;

  insert into creditos_movimentos (professor_id, tipo, origem, valor, saldo_depois, reservado, ref, descricao)
  values (p_professor, 'reserva', p_origem, -p_valor, v_saldo, p_valor, p_ref, p_descricao)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Acertar ─────────────────────────────────────────────────────────────────
--
-- Troca a reserva pelo custo real. Acertar duas vezes não faz nada. Custo zero
-- (as falas já estavam todas gravadas) apaga a linha: não vira ruído no extrato.

create or replace function public.creditos_acertar(p_reserva uuid, p_real numeric, p_descricao text default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  r creditos_movimentos;
  v_real numeric := greatest(coalesce(p_real, 0), 0);
  v_saldo numeric;
begin
  select * into r from creditos_movimentos where id = p_reserva and tipo = 'reserva' for update;
  if not found then
    return;
  end if;

  update creditos set saldo = saldo + r.reservado - v_real, atualizado_em = now()
   where professor_id = r.professor_id
  returning saldo into v_saldo;

  if v_real = 0 then
    delete from creditos_movimentos where id = p_reserva;
  else
    update creditos_movimentos
       set tipo = 'consumo', valor = -v_real, saldo_depois = v_saldo, acertado_em = now(),
           descricao = coalesce(p_descricao, descricao)
     where id = p_reserva;
  end if;
end;
$$;

-- Reservas de sessão cujo aluno já saiu, e reservas de outras ações que ficaram
-- presas (a função caiu no meio). A sessão concluída espera 1 min: o gasto do
-- último turno é gravado depois da resposta (waitUntil em tutor-aluno).
create or replace function public.creditos_acertar_vencidas(p_professor uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select m.id, s.custo_usd
      from creditos_movimentos m
      join tutor_sessoes s on s.id::text = m.ref
     where m.professor_id = p_professor
       and m.tipo = 'reserva'
       and m.origem in ('sessao', 'teste')
       and (s.concluida_em < now() - interval '1 minute' or s.iniciada_em < now() - interval '2 hours')
  loop
    perform creditos_acertar(r.id, r.custo_usd * cotacao_dolar());
  end loop;

  -- Sessão apagada (aluno excluído) ou ação que nunca acertou: devolve tudo.
  for r in
    select m.id
      from creditos_movimentos m
     where m.professor_id = p_professor
       and m.tipo = 'reserva'
       and m.criado_em < now() - interval '2 hours'
  loop
    perform creditos_acertar(r.id, 0);
  end loop;
end;
$$;

-- ── Entrada de créditos ─────────────────────────────────────────────────────
--
-- Compra (webhook do Stripe), bônus e ajuste. Devolve false se a compra já
-- tinha entrado (mesmo origem + ref): o webhook repetido não soma duas vezes.

create or replace function public.creditos_adicionar(
  p_professor uuid, p_valor numeric, p_tipo text, p_origem text, p_ref text, p_descricao text
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_saldo numeric;
begin
  insert into creditos (professor_id) values (p_professor) on conflict do nothing;
  begin
    update creditos set saldo = saldo + p_valor, atualizado_em = now()
     where professor_id = p_professor
    returning saldo into v_saldo;
    insert into creditos_movimentos (professor_id, tipo, origem, valor, saldo_depois, ref, descricao)
    values (p_professor, p_tipo, p_origem, p_valor, v_saldo, p_ref, p_descricao);
    return true;
  exception when unique_violation then
    return false;
  end;
end;
$$;

revoke all on function public.creditos_reservar(uuid, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.creditos_acertar(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.creditos_acertar_vencidas(uuid) from public, anon, authenticated;
revoke all on function public.creditos_adicionar(uuid, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.creditos_reservar(uuid, numeric, text, text, text) to service_role;
grant execute on function public.creditos_acertar(uuid, numeric, text) to service_role;
grant execute on function public.creditos_acertar_vencidas(uuid) to service_role;
grant execute on function public.creditos_adicionar(uuid, numeric, text, text, text, text) to service_role;

-- A tela de Créditos: acerta o que venceu e devolve o saldo do professor logado.
create or replace function public.meus_creditos()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric;
begin
  if auth.uid() is null then
    return 0;
  end if;
  perform creditos_acertar_vencidas(auth.uid());
  select saldo into v_saldo from creditos where professor_id = auth.uid();
  return coalesce(v_saldo, 0);
end;
$$;

revoke all on function public.meus_creditos() from public, anon;
grant execute on function public.meus_creditos() to authenticated;

-- ============================================================================
-- Custo estimado por lição (§5.2)
-- ============================================================================
--
-- Com 5 sessões reais ou mais nos últimos 30 dias: a média delas, com a
-- mediana e o valor que 9 em cada 10 não passam. Com menos: o tamanho da lição
-- (itens dos blocos + da conversa) × o custo médio por item de TODAS as lições.
-- Sem nenhum histórico no sistema, US$ 0,006 por item (~R$ 0,40 numa lição de
-- 12 itens, a média medida no beta).
--
-- security definer porque a média junta sessões de outros professores (lição da
-- biblioteca); devolve só números, e só de lições que o professor pode ver.

create or replace function public.tutor_custo_das_licoes(p_licoes text[])
returns table (
  licao_id        text,
  itens           int,
  sessoes         int,
  mediana_usd     numeric,
  p90_usd         numeric,
  estimativa_usd  numeric,
  fonte           text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select s.licao_id, s.custo_usd
      from tutor_sessoes s
     where not s.teste
       and s.concluida_em is not null
       and s.iniciada_em > now() - interval '30 days'
       and s.custo_usd > 0
  ),
  tamanho as (
    select l.id,
           (coalesce((select sum(coalesce(jsonb_array_length(b -> 'itens'), 0))
                        from jsonb_array_elements(case when jsonb_typeof(l.roteiro -> 'blocos') = 'array'
                                                       then l.roteiro -> 'blocos' else '[]'::jsonb end) b), 0)
            + case when jsonb_typeof(l.roteiro -> 'conversa') = 'array'
                   then jsonb_array_length(l.roteiro -> 'conversa') else 0 end)::int as n
      from tutor_licoes l
     where l.id = any (p_licoes)
       and (l.professor_id is null or l.professor_id = auth.uid())
  ),
  por_item as (
    select sum(b.custo_usd) / nullif(sum(t.n), 0) as v
      from base b
      join (select id,
                   (coalesce((select sum(coalesce(jsonb_array_length(x -> 'itens'), 0))
                                from jsonb_array_elements(case when jsonb_typeof(l.roteiro -> 'blocos') = 'array'
                                                               then l.roteiro -> 'blocos' else '[]'::jsonb end) x), 0)
                    + case when jsonb_typeof(l.roteiro -> 'conversa') = 'array'
                           then jsonb_array_length(l.roteiro -> 'conversa') else 0 end)::int as n
              from tutor_licoes l) t on t.id = b.licao_id
     where t.n > 0
  ),
  por_licao as (
    select b.licao_id,
           count(*)::int as n,
           avg(b.custo_usd) as media,
           percentile_cont(0.5) within group (order by b.custo_usd) as mediana,
           percentile_cont(0.9) within group (order by b.custo_usd) as p90
      from base b
     where b.licao_id = any (p_licoes)
     group by b.licao_id
  )
  select t.id,
         t.n,
         coalesce(p.n, 0),
         p.mediana::numeric,
         p.p90::numeric,
         round(case when coalesce(p.n, 0) >= 5 then p.media
                    else least(0.5, greatest(0.005, t.n * coalesce((select v from por_item), 0.006)))
               end, 5),
         case when coalesce(p.n, 0) >= 5 then 'sessoes' else 'inicial' end
    from tamanho t
    left join por_licao p on p.licao_id = t.id;
$$;

revoke all on function public.tutor_custo_das_licoes(text[]) from public, anon;
grant execute on function public.tutor_custo_das_licoes(text[]) to authenticated;

-- ============================================================================
-- Plano do aluno (§5): o que o professor vai vender na F3
-- ============================================================================
--
-- Nesta fase o professor monta o plano (preço, práticas por mês, trilhas) e vê
-- o preço mínimo. A venda (Stripe Connect, link, assinatura) é a F3.
--
-- Escrita só por `salvar_plano_aluno`: é ela que confere o preço mínimo no
-- servidor, com as trilhas e as práticas que estão sendo salvas JUNTAS.

create table planos_aluno (
  id                 uuid        primary key default gen_random_uuid(),
  professor_id       uuid        not null references professores (id) on delete cascade,
  nome               text        not null check (length(btrim(nome)) between 1 and 80),
  descricao          text        check (descricao is null or length(descricao) <= 500),
  preco_centavos     int         not null check (preco_centavos between 100 and 1000000),
  praticas_mes       smallint    not null check (praticas_mes between 0 and 500),
  aceitando          boolean     not null default true,
  stripe_product_id  text,
  stripe_price_id    text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index planos_aluno_professor_idx on planos_aluno (professor_id);

create table planos_aluno_trilhas (
  plano_id   uuid not null references planos_aluno (id) on delete cascade,
  trilha_id  uuid not null references trilhas (id) on delete cascade,
  primary key (plano_id, trilha_id)
);

alter table planos_aluno enable row level security;
alter table planos_aluno_trilhas enable row level security;

create policy prof_le_proprios on planos_aluno
  for select using (professor_id = auth.uid());
-- Apagar é livre enquanto não há venda; a F3 troca por "parar de vender".
create policy prof_apaga_proprios on planos_aluno
  for delete using (professor_id = auth.uid());
create policy prof_le_proprias on planos_aluno_trilhas
  for select using (exists (select 1 from planos_aluno p where p.id = plano_id and p.professor_id = auth.uid()));

-- Taxa da plataforma por assinatura por mês: 10%, mínimo de R$ 6 (§5.1).
create or replace function public.taxa_da_plataforma_centavos(p_preco_centavos int)
returns int
language sql
immutable
as $$ select greatest(ceil(p_preco_centavos * 0.10)::int, 600) $$;

-- O menor preço em que o que sobra depois da taxa cobre a IA máxima (§5.2).
-- Até R$ 60 a taxa é o mínimo de R$ 6; acima, 10%. Arredonda para reais inteiros.
create or replace function public.preco_minimo_centavos(p_ia_maxima_reais numeric)
returns int
language sql
immutable
as $$
  select (case when p_ia_maxima_reais + 6 <= 60 then ceil(p_ia_maxima_reais + 6)
               else ceil(p_ia_maxima_reais / 0.9) end)::int * 100
$$;

-- Custo médio por prática nas trilhas: a média das estimativas das lições do
-- tutor que estão nelas. Sem lição do tutor, zero (o plano não gasta IA).
create or replace function public.custo_medio_por_pratica_usd(p_trilhas uuid[])
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(avg(c.estimativa_usd), 0)
    from tutor_custo_das_licoes(array(
      select distinct e.licao_tutor_id
        from trilha_etapas e
        join trilhas t on t.id = e.trilha_id
       where e.trilha_id = any (p_trilhas)
         and e.licao_tutor_id is not null
         and t.professor_id = auth.uid()
    )) c
$$;

revoke all on function public.custo_medio_por_pratica_usd(uuid[]) from public, anon;
grant execute on function public.custo_medio_por_pratica_usd(uuid[]) to authenticated;

create or replace function public.salvar_plano_aluno(
  p_id uuid,
  p_nome text,
  p_descricao text,
  p_preco_centavos int,
  p_praticas_mes int,
  p_aceitando boolean,
  p_trilhas uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professor uuid := auth.uid();
  v_ia_maxima numeric;
  v_minimo int;
  v_id uuid;
begin
  if v_professor is null then
    raise exception 'nao_autenticado';
  end if;
  if exists (select 1 from unnest(coalesce(p_trilhas, '{}')) t(id)
              where not exists (select 1 from trilhas where id = t.id and professor_id = v_professor)) then
    raise exception 'trilha_alheia';
  end if;

  v_ia_maxima := p_praticas_mes * custo_medio_por_pratica_usd(coalesce(p_trilhas, '{}')) * cotacao_dolar();
  v_minimo := preco_minimo_centavos(v_ia_maxima);
  if p_preco_centavos < v_minimo then
    raise exception 'preco_abaixo_do_minimo' using detail = v_minimo::text;
  end if;

  if p_id is null then
    insert into planos_aluno (professor_id, nome, descricao, preco_centavos, praticas_mes, aceitando)
    values (v_professor, btrim(p_nome), nullif(btrim(p_descricao), ''), p_preco_centavos, p_praticas_mes, p_aceitando)
    returning id into v_id;
  else
    update planos_aluno
       set nome = btrim(p_nome), descricao = nullif(btrim(p_descricao), ''), preco_centavos = p_preco_centavos,
           praticas_mes = p_praticas_mes, aceitando = p_aceitando, atualizado_em = now()
     where id = p_id and professor_id = v_professor
    returning id into v_id;
    if v_id is null then
      raise exception 'plano_nao_encontrado';
    end if;
    delete from planos_aluno_trilhas where plano_id = v_id;
  end if;

  insert into planos_aluno_trilhas (plano_id, trilha_id)
  select v_id, t from unnest(coalesce(p_trilhas, '{}')) t
  on conflict do nothing;
  return v_id;
end;
$$;

revoke all on function public.salvar_plano_aluno(uuid, text, text, int, int, boolean, uuid[]) from public, anon;
grant execute on function public.salvar_plano_aluno(uuid, text, text, int, int, boolean, uuid[]) to authenticated;
