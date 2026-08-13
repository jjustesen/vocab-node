-- ============================================================================
-- Link aberto de atividade (feedback de usuário, 13/08/2026)
--
-- Um único link por atividade, compartilhável com quem ainda NÃO é aluno:
--
--   - Nas primeiras 12h após a geração ("janela de cadastro"), quem abre pode
--     criar conta na hora — vira aluno do professor — e já recebe a atribuição.
--   - Depois das 12h o MESMO link continua vivo, mas só como porta de acesso:
--     quem já tem conta entra (ou já está logado) e recebe/retoma a atribuição.
--
-- "Gerar novamente" troca token_hash e reabre a janela na MESMA linha (por
-- isso o unique em atividade_id): o link anterior morre — deixa de casar com
-- hash nenhum — e as atribuições já criadas ficam de pé, pois pendem do aluno,
-- não do link.
--
-- Mesmo princípio de acesso do resto do banco (ver 0001_init.sql): o RLS aqui
-- serve só ao professor; quem abre o link fala com Edge Functions
-- (link-aberto-obter / link-aberto-entrar), que validam o token por hash.
-- ============================================================================

create table links_abertos (
  id                  uuid        primary key default gen_random_uuid(),
  atividade_id        uuid        not null unique references atividades (id) on delete cascade,
  professor_id        uuid        not null references professores (id) on delete cascade,
  token_hash          text        not null unique,   -- sha256; o cru só existe no link (RNF-09)
  cadastro_expira_em  timestamptz not null,          -- geração + 12h
  criado_em           timestamptz not null default now()
);

-- De onde veio a atribuição — analítica/depuração; nada de fluxo pende disso.
alter table atribuicoes
  add column link_aberto_id uuid references links_abertos (id) on delete set null;

alter table links_abertos enable row level security;

create policy prof_owns on links_abertos
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
