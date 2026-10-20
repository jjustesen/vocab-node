-- ============================================================================
-- 0024 — Tutor: do laboratório para dentro do produto
-- ============================================================================
--
-- Até aqui o tutor oral era uma POC (poc-tutor/) numa página escondida, com
-- senha compartilhada, uma lição fixa e nada gravado. Agora:
--
--   professor liberado (tutor_acesso)
--     └─ liga o tutor por aluno (alunos.tutor_ativo)
--          └─ escolhe as lições que o aluno pratica (tutor_licoes_alunos)
--               └─ cada prática vira uma sessão (tutor_sessoes): resultado e custo
--
-- ── Beta fechado: quem libera é você, não o professor ───────────────────────
--
-- `tutor_acesso` não tem policy de escrita, como `assinaturas`: o professor só
-- LÊ a própria linha. Liberar é um insert no SQL Editor (ver docs/TUTOR.md).
-- Sem linha, nada do tutor aparece para o professor nem para os alunos dele.
--
-- ── O limite de alunos mora no banco ────────────────────────────────────────
--
-- `tutor_ativo` é escrito direto pelo professor (policy prof_owns de alunos),
-- então a tela não basta para segurar o `max_alunos`: o trigger abaixo recusa
-- ligar o tutor sem acesso ou além do limite, venha o update de onde vier.
--
-- ── Princípio de acesso (0001) continua valendo ─────────────────────────────
--
-- O aluno nunca lê estas tabelas: tudo passa pela função `tutor-aluno`, com a
-- chave de serviço. O RLS daqui serve só ao professor.
-- ============================================================================

-- ── Acesso (liberado à mão) ─────────────────────────────────────────────────

create table tutor_acesso (
  professor_id     uuid        primary key references professores (id) on delete cascade,
  max_alunos       smallint    not null default 5  check (max_alunos >= 0),
  max_sessoes_mes  smallint    not null default 30 check (max_sessoes_mes >= 0),
  observacao       text,
  liberado_em      timestamptz not null default now()
);

alter table tutor_acesso enable row level security;

-- Escrita: nenhuma policy — só o SQL Editor / service_role.
create policy prof_le_proprio on tutor_acesso
  for select using (professor_id = auth.uid());

-- ── Preferências do professor ───────────────────────────────────────────────
--
-- Valem para todos os alunos dele. `tutor_sessoes_mes` é o limite que o
-- professor escolhe por aluno; a função usa o menor entre ele e o
-- `max_sessoes_mes` do acesso.

alter table professores
  add column tutor_voz_natural       boolean  not null default true,
  add column tutor_escuta_automatica boolean  not null default true,
  add column tutor_sessoes_mes       smallint not null default 20 check (tutor_sessoes_mes between 1 and 200);

-- ── A chave por aluno ───────────────────────────────────────────────────────

alter table alunos add column tutor_ativo boolean not null default false;

create or replace function public.conferir_tutor_do_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max        smallint;
  v_usados     int;
  v_reativando boolean;
begin
  -- Só interessa quando o aluno PASSA a contar: ligou agora, ou voltou do
  -- arquivo já com o tutor ligado.
  if not (new.tutor_ativo and new.status = 'ativo') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.tutor_ativo and old.status = 'ativo' then
    return new;
  end if;
  v_reativando := tg_op = 'UPDATE' and old.tutor_ativo and old.status <> 'ativo';

  -- Dois cliques ao mesmo tempo não passam juntos pelo limite.
  perform pg_advisory_xact_lock(hashtext('tutor:' || new.professor_id::text));

  select max_alunos into v_max from tutor_acesso where professor_id = new.professor_id;
  select count(*) into v_usados
    from alunos
   where professor_id = new.professor_id
     and tutor_ativo
     and status = 'ativo'
     and id <> new.id;

  if v_max is null or v_usados >= v_max then
    -- Reativar um aluno do arquivo não pode falhar por causa do tutor: ele
    -- volta, e o tutor dele fica desligado até o professor abrir espaço.
    if v_reativando then
      new.tutor_ativo := false;
      return new;
    end if;
    if v_max is null then
      raise exception 'tutor_nao_liberado' using errcode = 'P0001';
    end if;
    raise exception 'limite_tutor' using errcode = 'P0001', detail = v_max::text;
  end if;

  return new;
end;
$$;

create trigger conferir_tutor_do_aluno
  before insert or update of tutor_ativo, status on alunos
  for each row execute function public.conferir_tutor_do_aluno();

-- ── Biblioteca de lições ────────────────────────────────────────────────────
--
-- Global nesta fase: as lições são escritas e revisadas por nós, e entram pelo
-- script poc-tutor/scripts/publicar-licao.ts (chave de serviço). `roteiro` é o
-- tipo `Roteiro` de poc-tutor/src/tipos.ts; `falas_gravadas` são as chaves
-- (chaveDaFala) dos MP3 que já estão no bucket `tutor-falas`.

create table tutor_licoes (
  id              text        primary key,             -- o `id` do roteiro, ex.: 'clima-was-were'
  titulo          text        not null,
  descricao       text,
  nivel_cefr      nivel_cefr,
  roteiro         jsonb       not null,
  falas_gravadas  text[]      not null default '{}',
  ordem           smallint    not null default 0,
  publicada       boolean     not null default false,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

alter table tutor_licoes enable row level security;

create policy le_publicadas on tutor_licoes
  for select to authenticated using (publicada);

-- ── Quais lições cada aluno pratica ─────────────────────────────────────────
--
-- Uma linha = liberada, como `materiais_alunos` (0016).

create table tutor_licoes_alunos (
  aluno_id   uuid        not null references alunos (id) on delete cascade,
  licao_id   text        not null references tutor_licoes (id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (aluno_id, licao_id)
);

alter table tutor_licoes_alunos enable row level security;

create policy prof_owns_via_aluno on tutor_licoes_alunos
  for all using (
    exists (select 1 from alunos a where a.id = aluno_id and a.professor_id = auth.uid())
  ) with check (
    exists (select 1 from alunos a where a.id = aluno_id and a.professor_id = auth.uid())
  );

-- ── Sessões ─────────────────────────────────────────────────────────────────
--
-- Criada por `tutor-aluno` quando o aluno toca em "Começar"; `concluida_em`
-- nulo = o aluno saiu antes do fim (a sessão conta no limite do mês igual).
-- `resumo` é o `Resumo` do controlador. `gasto` guarda os tokens por serviço
-- ({ "<servico>": { entrada, saida } }) e `custo_usd` o total já precificado
-- pela função (supabase/functions/_shared/tutor/precos.ts).

create table tutor_sessoes (
  id            uuid          primary key default gen_random_uuid(),
  aluno_id      uuid          not null references alunos (id) on delete cascade,
  professor_id  uuid          not null references professores (id) on delete cascade,
  licao_id      text          not null references tutor_licoes (id) on delete cascade,
  iniciada_em   timestamptz   not null default now(),
  concluida_em  timestamptz,
  resumo        jsonb,
  gasto         jsonb         not null default '{}',
  custo_usd     numeric(10,5) not null default 0,
  chamadas      int           not null default 0
);

create index tutor_sessoes_aluno_idx     on tutor_sessoes (aluno_id, iniciada_em desc);
create index tutor_sessoes_professor_idx on tutor_sessoes (professor_id, iniciada_em desc);

alter table tutor_sessoes enable row level security;

-- Leitura: o professor vê as sessões dos alunos dele. Escrita: só a função.
create policy prof_le_proprias on tutor_sessoes
  for select using (professor_id = auth.uid());

-- Soma atômica do gasto de uma chamada: `avaliar` e `falar_stream` de um mesmo
-- turno chegam juntos, e ler-somar-gravar no cliente da função perderia um.
create or replace function public.tutor_somar_gasto(p_sessao uuid, p_custo_usd numeric, p_gasto jsonb)
returns numeric
language sql
set search_path = public
as $$
  update tutor_sessoes s
     set custo_usd = s.custo_usd + p_custo_usd,
         chamadas  = s.chamadas + 1,
         gasto     = (
           select coalesce(jsonb_object_agg(k, jsonb_build_object(
                    'entrada', coalesce((s.gasto -> k ->> 'entrada')::bigint, 0) + coalesce((p_gasto -> k ->> 'entrada')::bigint, 0),
                    'saida',   coalesce((s.gasto -> k ->> 'saida')::bigint, 0)   + coalesce((p_gasto -> k ->> 'saida')::bigint, 0)
                  )), '{}'::jsonb)
             from (select jsonb_object_keys(s.gasto) as k
                   union
                   select jsonb_object_keys(p_gasto)) as chaves
         )
   where s.id = p_sessao
  returning s.custo_usd;
$$;

revoke all on function public.tutor_somar_gasto(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.tutor_somar_gasto(uuid, numeric, jsonb) to service_role;

-- ── Falas pré-gravadas das lições ───────────────────────────────────────────
--
-- Público de propósito: é a voz do tutor dizendo frases da lição, nada do
-- aluno. Escrita só pelo script de publicação (service_role).

insert into storage.buckets (id, name, public)
values ('tutor-falas', 'tutor-falas', true)
on conflict (id) do nothing;
