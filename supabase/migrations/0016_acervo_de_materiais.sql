-- ============================================================================
-- O material deixa de pertencer a um aluno e passa a ser do PROFESSOR
--
-- Em 0001, `materiais.aluno_id` fazia as vezes de duas coisas ao mesmo tempo:
-- de quem é o arquivo, e quem pode vê-lo. Com um aluno por sala isso nunca
-- apertou. Com turma, aperta na primeira aula: compartilhar a mesma apostila
-- com cinco alunos exigiria subir o MESMO PDF cinco vezes — cinco objetos no
-- bucket, cinco linhas, e cinco versões para corrigir quando o arquivo mudar.
--
-- A separação é essa:
--
--   `materiais`         → O ARQUIVO. É do professor, existe uma vez só.
--   `materiais_alunos`  → QUEM TEM ACESSO. Uma linha por pessoa.
--
-- Repare que o acervo já existia sem ninguém ter nomeado: o material que dá
-- origem a uma atividade (ver `criarMaterial` em features/atividades/api.ts)
-- sempre nasceu com `aluno_id` nulo. Esta migration só dá nome e regra ao que
-- o schema já admitia pelo canto.
--
-- ── Por que a coluna sai, em vez de ficar de reserva ────────────────────────
--
-- Manter `aluno_id` ao lado da tabela de vínculo seria duas fontes para a
-- mesma pergunta ("quem tem este material?"), e as duas divergem no primeiro
-- caminho de código que esquecer de escrever nas duas. O backfill abaixo move
-- tudo o que existe hoje; a coluna some no mesmo passo, e quem lê passa a ter
-- um lugar só para olhar.
--
-- ── O que isso muda no significado de apagar ────────────────────────────────
--
-- Antes, apagar um material era um gesto só. Agora são dois, e a tela precisa
-- distinguir: TIRAR DE UM ALUNO (some a linha de vínculo, o arquivo continua
-- no acervo) e APAGAR DO ACERVO (some para todo mundo, e o arquivo sai do
-- bucket). O cascade abaixo garante a segunda: apagar o material leva os
-- vínculos junto.
-- ============================================================================

create table materiais_alunos (
  material_id  uuid        not null references materiais (id) on delete cascade,
  aluno_id     uuid        not null references alunos (id)    on delete cascade,
  -- Quando ESTE ALUNO recebeu — não confundir com `materiais.criado_em`, que é
  -- quando o arquivo entrou no acervo. A ficha do aluno ordena por este.
  criado_em    timestamptz not null default now(),
  primary key (material_id, aluno_id)
);

create index materiais_alunos_aluno_idx on materiais_alunos (aluno_id, criado_em desc);

-- Move o que já existe. `criado_em` do vínculo herda o do material: para os
-- materiais de hoje as duas datas são a mesma coisa, e é isso que mantém a
-- ordem das fichas exatamente como o professor já a conhece.
insert into materiais_alunos (material_id, aluno_id, criado_em)
  select id, aluno_id, criado_em from materiais where aluno_id is not null
  on conflict do nothing;

alter table materiais drop column aluno_id;

alter table materiais_alunos enable row level security;

-- O vínculo é do professor dono do MATERIAL. Amarrar no material e não no
-- aluno é o que continua certo quando um material for compartilhado entre
-- alunos de professores diferentes — coisa que o acervo torna concebível.
create policy prof_owns on materiais_alunos
  for all using (
    exists (select 1 from materiais m where m.id = material_id and m.professor_id = auth.uid())
  ) with check (
    exists (select 1 from materiais m where m.id = material_id and m.professor_id = auth.uid())
  );

comment on table materiais_alunos is
  'Quem tem acesso a cada material. O arquivo é do professor (materiais); esta tabela é a distribuição.';
