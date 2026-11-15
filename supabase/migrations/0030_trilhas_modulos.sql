-- ============================================================================
-- 0030 — Trilhas com módulos, três tipos de passo e liberação (15/11/2026)
-- ============================================================================
--
-- Escopo: docs/TUTOR-TRILHAS.md §4. A trilha deixa de ser uma lista de
-- atividades e vira:
--
--   trilha  (navegação + liberação, escolhidas pelo professor)
--     └─ módulo  (a unidade que libera)
--          └─ passo  = trilha_etapas: atividade, material OU lição do tutor
--
-- ── Compatível com o que já existe ──────────────────────────────────────────
--
-- `trilha_etapas` continua sendo a tabela dos passos (o nome no banco fica):
-- atribuições, turmas e o painel já apontam para ela. Toda trilha existente
-- ganha um "Módulo 1" com todas as etapas, e os padrões das colunas novas
-- (`sugerida` + `tudo`) reproduzem o comportamento de hoje: tudo aberto, a
-- primeira pendente em destaque. Os triggers abaixo deixam o código antigo
-- funcionando enquanto o novo não chega: trilha nova já nasce com um módulo,
-- e etapa inserida sem módulo cai no último.
--
-- ── O cadeado não é gravado ─────────────────────────────────────────────────
--
-- A regra-chave 3 da 0001 continua no espírito: não existe "etapa liberada"
-- nem "etapa atual" no banco. Se um passo está travado é CALCULADO na leitura
-- (painel-aluno-obter), a partir das conclusões, da regra da trilha e da data
-- em que o aluno entrou nela. Nada que alguém precise destravar à mão.
--
-- ── Acesso ao material e à lição ────────────────────────────────────────────
--
-- Atividade continua indo por atribuição (com token, gerado no navegador do
-- professor). Material e lição do tutor não têm token: quem está na trilha
-- recebe o vínculo (`materiais_alunos`, `tutor_licoes_alunos`) por trigger,
-- ao entrar na trilha e quando um passo novo entra nela. É o mesmo caminho
-- da 0029 para a lição liberada à turma.
-- ============================================================================

-- ── Configuração da trilha ──────────────────────────────────────────────────

alter table trilhas
  add column navegacao       text     not null default 'sugerida'
    check (navegacao in ('sequencia', 'sugerida', 'abas')),
  add column permite_abas    boolean  not null default true,
  add column liberacao       text     not null default 'tudo'
    check (liberacao in ('tudo', 'progresso', 'periodo', 'progresso_e_periodo')),
  add column liberacao_dias  smallint not null default 7
    check (liberacao_dias between 1 and 365),
  -- Nota mínima (0–100) para a atividade contar como concluída. Nula = basta
  -- terminar.
  add column nota_minima     smallint
    check (nota_minima between 0 and 100);

-- ── Módulos ─────────────────────────────────────────────────────────────────

create table trilha_modulos (
  id         uuid        primary key default gen_random_uuid(),
  trilha_id  uuid        not null references trilhas (id) on delete cascade,
  ordem      smallint    not null,
  titulo     text        not null check (length(trim(titulo)) between 1 and 120),
  criado_em  timestamptz not null default now(),
  unique (trilha_id, ordem) deferrable initially deferred   -- reordenar numa transação
);

create index trilha_modulos_trilha_idx on trilha_modulos (trilha_id, ordem);

alter table trilha_modulos enable row level security;

create policy prof_owns_via_trilha on trilha_modulos
  for all using (
    exists (select 1 from trilhas t where t.id = trilha_id and t.professor_id = auth.uid())
  ) with check (
    exists (select 1 from trilhas t where t.id = trilha_id and t.professor_id = auth.uid())
  );

insert into trilha_modulos (trilha_id, ordem, titulo)
select id, 1, 'Módulo 1' from trilhas;

-- ── Passos de três tipos ────────────────────────────────────────────────────

alter table trilha_etapas
  add column modulo_id       uuid    references trilha_modulos (id) on delete cascade,
  add column material_id     uuid    references materiais (id) on delete restrict,
  add column licao_tutor_id  text    references tutor_licoes (id) on delete restrict,
  add column opcional        boolean not null default false;

update trilha_etapas e
   set modulo_id = m.id
  from trilha_modulos m
 where m.trilha_id = e.trilha_id;

alter table trilha_etapas alter column modulo_id set not null;
alter table trilha_etapas alter column atividade_id drop not null;

alter table trilha_etapas
  add constraint etapa_de_um_tipo
  check (num_nonnulls(atividade_id, material_id, licao_tutor_id) = 1);

create index trilha_etapas_modulo_idx on trilha_etapas (modulo_id);

-- ── Trilha nova nasce com um módulo; etapa sem módulo cai no último ─────────

create or replace function public.trilha_primeiro_modulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into trilha_modulos (trilha_id, ordem, titulo) values (new.id, 1, 'Módulo 1');
  return new;
end;
$$;

create trigger trilha_primeiro_modulo
  after insert on trilhas
  for each row execute function public.trilha_primeiro_modulo();

create or replace function public.etapa_no_ultimo_modulo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.modulo_id is null then
    select id into new.modulo_id
      from trilha_modulos
     where trilha_id = new.trilha_id
     order by ordem desc
     limit 1;
  end if;
  return new;
end;
$$;

create trigger etapa_no_ultimo_modulo
  before insert on trilha_etapas
  for each row execute function public.etapa_no_ultimo_modulo();

-- ── Vínculo de material e lição para quem está na trilha ────────────────────
--
-- `security definer`: o vínculo de lição passa pelo trigger da 0028, que
-- confere o acesso do professor ao tutor — e quem insere é o professor dono,
-- validado pelas policies de trilha_alunos/trilha_etapas antes de chegar aqui.

create or replace function public.vincular_passos_da_trilha(p_trilha uuid, p_aluno uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into materiais_alunos (material_id, aluno_id)
  select e.material_id, p_aluno
    from trilha_etapas e
   where e.trilha_id = p_trilha and e.material_id is not null
  on conflict do nothing;

  insert into tutor_licoes_alunos (aluno_id, licao_id)
  select p_aluno, e.licao_tutor_id
    from trilha_etapas e
   where e.trilha_id = p_trilha and e.licao_tutor_id is not null
  on conflict do nothing;
$$;

revoke all on function public.vincular_passos_da_trilha(uuid, uuid) from public, anon, authenticated;

create or replace function public.ao_entrar_na_trilha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform vincular_passos_da_trilha(new.trilha_id, new.aluno_id);
  return new;
end;
$$;

create trigger vincular_ao_entrar_na_trilha
  after insert on trilha_alunos
  for each row execute function public.ao_entrar_na_trilha();

create or replace function public.ao_criar_passo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.material_id is not null then
    insert into materiais_alunos (material_id, aluno_id)
    select new.material_id, ta.aluno_id from trilha_alunos ta where ta.trilha_id = new.trilha_id
    on conflict do nothing;
  end if;
  if new.licao_tutor_id is not null then
    insert into tutor_licoes_alunos (aluno_id, licao_id)
    select ta.aluno_id, new.licao_tutor_id from trilha_alunos ta where ta.trilha_id = new.trilha_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger vincular_passo_novo
  after insert on trilha_etapas
  for each row execute function public.ao_criar_passo();

-- Quem já está nas trilhas de hoje não tem passo de material nem de lição,
-- então não há nada a vincular agora.

-- ── Material lido ───────────────────────────────────────────────────────────
--
-- Atividade conclui pela atribuição e lição pela sessão do tutor. Material
-- não deixa rastro sozinho: o aluno toca em "Li este material" no leitor, e
-- a função `trilha-passo-concluir` grava aqui. O aluno não escreve no banco
-- (princípio da 0001); o professor só lê.

create table passo_conclusoes (
  aluno_id      uuid        not null references alunos (id) on delete cascade,
  etapa_id      uuid        not null references trilha_etapas (id) on delete cascade,
  concluido_em  timestamptz not null default now(),
  primary key (aluno_id, etapa_id)
);

alter table passo_conclusoes enable row level security;

create policy prof_le_via_aluno on passo_conclusoes
  for select using (
    exists (select 1 from alunos a where a.id = aluno_id and a.professor_id = auth.uid())
  );

-- ── Quando cada passo foi concluído, por aluno ──────────────────────────────
--
-- Uma resposta só para "este aluno concluiu este passo?", qualquer que seja o
-- tipo. `security_invoker`: o professor enxerga só o que as policies das
-- tabelas de baixo já deixam; as funções do aluno leem com service_role.
--
--   atividade  a tentativa MAIS RECENTE concluída, e com nota ≥ nota_minima
--              quando a trilha pede (reenviar reabre o passo, RF-127)
--   material   a linha de passo_conclusoes
--   lição      a primeira sessão do tutor terminada, que não seja teste

create view trilha_passos_concluidos
with (security_invoker = true)
as
with ultima as (
  select distinct on (a.trilha_etapa_id, a.aluno_id)
         a.id, a.trilha_etapa_id, a.aluno_id, a.concluida_em
    from atribuicoes a
   where a.trilha_etapa_id is not null
   order by a.trilha_etapa_id, a.aluno_id, a.enviada_em desc
),
nota as (
  select r.atribuicao_id,
         round(100.0 * count(*) filter (where r.correta) / nullif(count(*), 0)) as percentual
    from respostas r
   where r.atribuicao_id in (select id from ultima where concluida_em is not null)
   group by r.atribuicao_id
)
select u.aluno_id, e.id as etapa_id, e.trilha_id, u.concluida_em, n.percentual
  from ultima u
  join trilha_etapas e on e.id = u.trilha_etapa_id
  join trilhas t on t.id = e.trilha_id
  left join nota n on n.atribuicao_id = u.id
 where u.concluida_em is not null
   and (t.nota_minima is null or coalesce(n.percentual, 0) >= t.nota_minima)
union all
select p.aluno_id, p.etapa_id, e.trilha_id, p.concluido_em, null
  from passo_conclusoes p
  join trilha_etapas e on e.id = p.etapa_id
union all
select s.aluno_id, e.id, e.trilha_id, min(s.concluida_em), null
  from trilha_etapas e
  join trilha_alunos ta on ta.trilha_id = e.trilha_id
  join tutor_sessoes s on s.licao_id = e.licao_tutor_id
                      and s.aluno_id = ta.aluno_id
                      and s.concluida_em is not null
                      and not s.teste
 where e.licao_tutor_id is not null
 group by s.aluno_id, e.id, e.trilha_id;
