-- ============================================================================
-- MegaInglês — schema inicial
-- Postgres / Supabase
--
-- PRINCÍPIO DE ACESSO (leia antes de mexer em qualquer policy):
--
--   O RLS deste banco serve EXCLUSIVAMENTE ao professor autenticado.
--   O aluno — com ou sem conta — NUNCA fala com o Postgres direto.
--   Todo acesso do aluno passa por Edge Function, que valida o token por
--   hash antes de devolver qualquer linha.
--
--   Motivo: RLS não sabe validar posse de um link por token — só sabe
--   comparar com auth.uid(), que o aluno não tem. A Edge Function resolve
--   essa autenticação (é o dono do link?), não filtragem de campo por
--   campo — desde 26/07/2026 o gabarito completo (resposta_correta,
--   respostas_aceitas, explicacao) é devolvido já na primeira chamada, de
--   propósito, para corrigir no navegador sem viagem ao servidor por
--   questão. Ver docs/CONTRATO-QUESTOES.md §7 para o porquê dessa troca.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. PROFESSOR
-- ============================================================================

create type plano_tipo as enum ('gratuito', 'pro');

create table professores (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text        not null,
  foto_url      text,
  plano         plano_tipo  not null default 'gratuito',
  criado_em     timestamptz not null default now()
);

-- ============================================================================
-- 2. ALUNO E IDENTIDADE
--
-- REGRA-CHAVE 1 (PRD §8): todo o histórico pende de `alunos`, nunca de
-- `contas_aluno`. Criar, trocar ou resetar o e-mail (RF-24/RF-25) troca
-- apenas a linha de `contas_aluno` — nada de histórico se move.
-- ============================================================================

create type aluno_status as enum ('ativo', 'arquivado');
create type nivel_cefr   as enum ('A1', 'A2', 'B1', 'B2', 'C1');

create table alunos (
  id            uuid primary key default gen_random_uuid(),
  professor_id  uuid         not null references professores (id) on delete cascade,
  nome          text         not null,                    -- único campo obrigatório (RF-10)
  email         text,                                     -- informativo; o login vive em contas_aluno
  telefone      text,
  nivel_cefr    nivel_cefr,
  valor_mensal  numeric(10,2),
  dia_semana    smallint check (dia_semana between 0 and 6),
  horario       time,
  observacoes   text,
  status        aluno_status not null default 'ativo',
  criado_em     timestamptz  not null default now()
);

create index on alunos (professor_id, status);

-- 0..1 conta por aluno. O UNIQUE em (professor_id, email) implementa RF-27:
-- um e-mail só pertence a um aluno por professor; a mesma pessoa pode ter
-- conta com professores diferentes.
create table contas_aluno (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid        not null unique references alunos (id) on delete cascade,
  professor_id  uuid        not null references professores (id) on delete cascade,
  user_id       uuid        not null references auth.users (id) on delete cascade,
  email         text        not null,
  criado_em     timestamptz not null default now(),
  ultimo_login  timestamptz,
  unique (professor_id, email)
);

-- Link de cadastro (RF-22/23) e link de reset (RF-25) usam esta mesma tabela.
-- Guardamos só o hash: o token cru existe apenas dentro do link enviado.
create table convites_aluno (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid        not null references alunos (id) on delete cascade,
  token_hash    text        not null unique,
  expira_em     timestamptz not null,       -- 7 dias (RF-23)
  usado_em      timestamptz,                -- uso único
  criado_em     timestamptz not null default now()
);

create index on convites_aluno (aluno_id) where usado_em is null;

-- Auditoria do reset de acesso (RF-26 / RNF-12).
create table eventos_acesso_aluno (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid        not null references alunos (id) on delete cascade,
  tipo          text        not null check (tipo in ('conta_criada', 'acesso_resetado', 'email_alterado')),
  email_antigo  text,
  email_novo    text,
  criado_em     timestamptz not null default now()
);

-- ============================================================================
-- 3. AULAS E MATERIAIS
-- ============================================================================

create type aula_status as enum ('agendada', 'realizada', 'cancelada', 'falta');

create table aulas (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid        not null references alunos (id) on delete cascade,
  data_hora     timestamptz not null,
  duracao_min   smallint    not null default 60,
  status        aula_status not null default 'agendada',
  anotacao      text,
  criada_em     timestamptz not null default now()
);

create index on aulas (aluno_id, data_hora desc);

create type material_tipo as enum ('pdf', 'docx', 'imagem', 'audio', 'texto');

create table materiais (
  id            uuid          primary key default gen_random_uuid(),
  professor_id  uuid          not null references professores (id) on delete cascade,
  aluno_id      uuid          references alunos (id) on delete set null,
  aula_id       uuid          references aulas (id) on delete set null,
  tipo          material_tipo not null,
  nome          text          not null,
  storage_path  text,                        -- bucket privado; URL assinada e temporária (RNF-10)
  texto         text,                        -- texto colado ou extraído
  criado_em     timestamptz   not null default now()
);

create index on materiais (professor_id, criado_em desc);

-- ============================================================================
-- 4. ATIVIDADES E QUESTÕES
--
-- Toda atividade enviada fica na biblioteca e pode ser reenviada sem
-- consumir cota de IA (RF-120/121).
-- ============================================================================

create type atividade_status as enum ('rascunho', 'publicada', 'arquivada');
create type questao_tipo     as enum (
  'multipla_escolha', 'lacuna', 'ordenar_palavras',
  'ligar_colunas', 'verdadeiro_falso', 'resposta_curta'
);

create table atividades (
  id            uuid             primary key default gen_random_uuid(),
  professor_id  uuid             not null references professores (id) on delete cascade,
  material_id   uuid             references materiais (id) on delete set null,
  titulo        text             not null,
  nivel         nivel_cefr       not null,
  habilidades   text[]           not null default '{}',   -- leitura|escrita|listening|vocabulario|gramatica
  foco          text,                                     -- ex.: "past simple, vocabulário de viagem"
  status        atividade_status not null default 'rascunho',
  origem_ia     boolean          not null default true,
  criada_em     timestamptz      not null default now()
);

create index on atividades (professor_id, status, criada_em desc);

-- `opcoes`, `resposta_correta` e `pares` seguem o contrato em
-- docs/CONTRATO-QUESTOES.md. Formato flat (não union) para sobreviver ao
-- subset de JSON Schema que os provedores de IA aceitam em saída estruturada.
create table questoes (
  id                uuid         primary key default gen_random_uuid(),
  atividade_id      uuid         not null references atividades (id) on delete cascade,
  ordem             smallint     not null,
  tipo              questao_tipo not null,
  enunciado         text         not null,
  opcoes            jsonb,                    -- string[]
  resposta_correta  text         not null,
  respostas_aceitas text[]       not null default '{}',
  pares             jsonb,                    -- [{esquerda, direita}]
  explicacao        text         not null,    -- sempre em pt-BR (RF-66)
  unique (atividade_id, ordem)
);

-- ============================================================================
-- 5. TRILHAS
--
-- REGRA-CHAVE 3 (PRD §8): não existe "etapa liberada" nem `etapa_atual`.
-- Atribuir a trilha cria de uma vez as atribuições de TODAS as etapas.
-- A etapa atual é derivada na leitura — a primeira sem `concluida_em`.
-- É isso que torna impossível o aluno ficar travado esperando (RF-132).
-- ============================================================================

create table trilhas (
  id            uuid        primary key default gen_random_uuid(),
  professor_id  uuid        not null references professores (id) on delete cascade,
  nome          text        not null,
  nivel         nivel_cefr  not null,
  descricao     text,
  criada_em     timestamptz not null default now()
);

create table trilha_etapas (
  id            uuid     primary key default gen_random_uuid(),
  trilha_id     uuid     not null references trilhas (id) on delete cascade,
  atividade_id  uuid     not null references atividades (id) on delete restrict,
  ordem         smallint not null,
  unique (trilha_id, ordem) deferrable initially deferred   -- permite reordenar em transação
);

create type trilha_aluno_status as enum ('ativa', 'pausada', 'concluida');

create table trilha_alunos (
  id            uuid                primary key default gen_random_uuid(),
  trilha_id     uuid                not null references trilhas (id) on delete cascade,
  aluno_id      uuid                not null references alunos (id) on delete cascade,
  status        trilha_aluno_status not null default 'ativa',
  iniciada_em   timestamptz         not null default now(),
  concluida_em  timestamptz,
  unique (trilha_id, aluno_id)
);

-- ============================================================================
-- 6. ATRIBUIÇÕES E RESPOSTAS
--
-- REGRA-CHAVE 2 (PRD §8): uma etapa de trilha não é objeto novo.
-- `trilha_etapa_id` só marca que aquele envio pertence a uma trilha.
-- Atividade solta e etapa de trilha compartilham link, correção e resultado.
-- ============================================================================

create table atribuicoes (
  id               uuid        primary key default gen_random_uuid(),
  atividade_id     uuid        not null references atividades (id) on delete cascade,
  aluno_id         uuid        not null references alunos (id) on delete cascade,
  trilha_etapa_id  uuid        references trilha_etapas (id) on delete set null,
  token_hash       text        not null unique,   -- sha256 do token; o cru só existe no link (RNF-09)
  tentativa        smallint    not null default 1,
  prazo            date,
  enviada_em       timestamptz not null default now(),
  iniciada_em      timestamptz,
  concluida_em     timestamptz,
  revogada_em      timestamptz,                   -- RF-30
  unique (atividade_id, aluno_id, tentativa)      -- reenvio cria nova tentativa (RF-127)
);

create index on atribuicoes (aluno_id, concluida_em);
create index on atribuicoes (trilha_etapa_id) where trilha_etapa_id is not null;

create table respostas (
  id             uuid        primary key default gen_random_uuid(),
  atribuicao_id  uuid        not null references atribuicoes (id) on delete cascade,
  questao_id     uuid        not null references questoes (id) on delete cascade,
  valor          text        not null,
  correta        boolean     not null,
  tempo_ms       integer,
  respondida_em  timestamptz not null default now(),
  unique (atribuicao_id, questao_id)
);

-- ============================================================================
-- 7. FINANCEIRO
-- ============================================================================

create type pagamento_status as enum ('pendente', 'pago');

create table pagamentos (
  id              uuid             primary key default gen_random_uuid(),
  aluno_id        uuid             not null references alunos (id) on delete cascade,
  referencia_mes  date             not null,      -- sempre dia 1 do mês
  valor           numeric(10,2)    not null,
  status          pagamento_status not null default 'pendente',
  pago_em         timestamptz,
  unique (aluno_id, referencia_mes)
);

-- ============================================================================
-- 8. COTA DE IA (RF-110/111/112 e RNF-11)
-- ============================================================================

create table geracoes_ia (
  id             uuid        primary key default gen_random_uuid(),
  professor_id   uuid        not null references professores (id) on delete cascade,
  atividade_id   uuid        references atividades (id) on delete set null,
  provedor       text        not null,          -- 'gemini' | 'anthropic' | ...
  modelo         text        not null,
  tokens_entrada integer,
  tokens_saida   integer,
  custo_usd      numeric(10,6),
  sucesso        boolean     not null,          -- falha não consome cota (RF-73)
  criada_em      timestamptz not null default now()
);

create index on geracoes_ia (professor_id, criada_em desc);

-- ============================================================================
-- 9. RLS — apenas para o professor autenticado
--
-- Nenhuma policy concede acesso ao aluno. Ver o cabeçalho deste arquivo.
-- ============================================================================

alter table professores          enable row level security;
alter table alunos               enable row level security;
alter table contas_aluno         enable row level security;
alter table convites_aluno       enable row level security;
alter table eventos_acesso_aluno enable row level security;
alter table aulas                enable row level security;
alter table materiais            enable row level security;
alter table atividades           enable row level security;
alter table questoes             enable row level security;
alter table trilhas              enable row level security;
alter table trilha_etapas        enable row level security;
alter table trilha_alunos        enable row level security;
alter table atribuicoes          enable row level security;
alter table respostas            enable row level security;
alter table pagamentos           enable row level security;
alter table geracoes_ia          enable row level security;

create policy prof_self on professores
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Dono direto: a linha tem professor_id.
create policy prof_owns on alunos
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
create policy prof_owns on materiais
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
create policy prof_owns on atividades
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
create policy prof_owns on trilhas
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
create policy prof_owns on contas_aluno
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
create policy prof_owns on geracoes_ia
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());

-- Dono via aluno.
create policy prof_owns_via_aluno on aulas
  for all using (exists (select 1 from alunos a where a.id = aulas.aluno_id and a.professor_id = auth.uid()));
create policy prof_owns_via_aluno on convites_aluno
  for all using (exists (select 1 from alunos a where a.id = convites_aluno.aluno_id and a.professor_id = auth.uid()));
create policy prof_owns_via_aluno on eventos_acesso_aluno
  for all using (exists (select 1 from alunos a where a.id = eventos_acesso_aluno.aluno_id and a.professor_id = auth.uid()));
create policy prof_owns_via_aluno on trilha_alunos
  for all using (exists (select 1 from alunos a where a.id = trilha_alunos.aluno_id and a.professor_id = auth.uid()));
create policy prof_owns_via_aluno on atribuicoes
  for all using (exists (select 1 from alunos a where a.id = atribuicoes.aluno_id and a.professor_id = auth.uid()));
create policy prof_owns_via_aluno on pagamentos
  for all using (exists (select 1 from alunos a where a.id = pagamentos.aluno_id and a.professor_id = auth.uid()));

-- Dono via atividade / trilha.
create policy prof_owns_via_atividade on questoes
  for all using (exists (select 1 from atividades at where at.id = questoes.atividade_id and at.professor_id = auth.uid()));
create policy prof_owns_via_trilha on trilha_etapas
  for all using (exists (select 1 from trilhas t where t.id = trilha_etapas.trilha_id and t.professor_id = auth.uid()));

-- Dono via atribuição → aluno.
create policy prof_owns_via_atribuicao on respostas
  for all using (exists (
    select 1 from atribuicoes atr
      join alunos a on a.id = atr.aluno_id
    where atr.id = respostas.atribuicao_id and a.professor_id = auth.uid()
  ));
