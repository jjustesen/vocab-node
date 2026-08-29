-- ============================================================================
-- Sala de videochamada (LiveKit)
--
-- UMA sala por aluno, não por aula — e isso é a decisão central deste arquivo.
--
-- Aula neste produto é quase sempre recorrente (`serie_id`, 0007). Se a sala
-- pendesse de `aulas.id`, o link mudaria toda semana e o professor teria que
-- reenviar por WhatsApp antes de cada aula: exatamente a fricção que o produto
-- existe para tirar. Com uma sala por aluno o link é combinado uma vez e vale
-- para sempre — "o link da sua aula é este", como uma sala física.
--
-- O preço dessa escolha é que a sala não sabe quando a aula é. Quem controla o
-- acesso é a posse do token, não o horário: professor e aluno entram quando
-- quiserem. Para 1:1 isso é aceitável (a sala é de uma dupla só); para turmas,
-- não seria — mas turma está fora do escopo (PRD 4.2).
--
-- Mesmo princípio de acesso do resto do banco (ver 0001_init.sql): o RLS aqui
-- serve só ao professor. Quem entra pelo link fala com a Edge Function
-- `sala-entrar`, que valida o token por hash e assina o JWT do LiveKit.
-- ============================================================================

create table salas (
  id            uuid        primary key default gen_random_uuid(),
  aluno_id      uuid        not null unique references alunos (id) on delete cascade,
  professor_id  uuid        not null references professores (id) on delete cascade,
  token_hash    text        not null unique,   -- sha256; o cru só existe no link (RNF-09)
  criada_em     timestamptz not null default now()
);

-- O nome da sala no LiveKit é derivado de `id` (ver _shared/livekit.ts), e não
-- de `aluno_id`: regenerar o link troca a linha inteira, e com ela a sala —
-- quem estava com o link velho não cai numa conversa em andamento.

alter table salas enable row level security;

create policy prof_owns on salas
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
