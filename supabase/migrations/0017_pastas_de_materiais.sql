-- ============================================================================
-- Pastas do acervo — "Livro 1", "Provas", "Áudios da unidade 3"
--
-- 0016 transformou o material numa peça do PROFESSOR, reaproveitável entre
-- alunos e turmas. O efeito colateral previsível chegou junto: o acervo cresce
-- e não para mais de crescer, porque nada mais o esvazia — tirar o material de
-- um aluno já não apaga o arquivo. Busca e filtro por tipo dão conta de vinte
-- itens; não dão de duzentos, e a pergunta do professor quase nunca é "onde
-- está o PDF chamado X" e sim "o que eu tenho do Livro 1".
--
-- ── A pasta organiza o ACERVO, não a distribuição ───────────────────────────
--
-- É a distinção que faz este schema ser pequeno. `materiais_alunos` continua
-- sendo a única resposta para "quem tem acesso"; a pasta não dá nem tira
-- acesso a ninguém. Botar um material em "Livro 1" não o entrega a quem quer
-- que tenha o Livro 1 — são eixos diferentes, e cruzá-los criaria uma segunda
-- fonte de verdade sobre permissão, que foi exatamente o erro que 0016 desfez.
--
-- A pasta aparece nas telas do aluno como RÓTULO e agrupamento: ele vê os
-- materiais dele reunidos sob "Livro 1" porque é assim que o professor fala
-- deles em aula. Nada além disso.
--
-- ── Planas, e não em árvore ─────────────────────────────────────────────────
--
-- Um nível só. O que o professor descreve é uma prateleira ("Livro 1", "Livro
-- 2"), não uma hierarquia — e árvore cobra caro em tela: navegação com
-- migalha, mover entre níveis, decidir o que acontece com a subpasta quando a
-- pai é apagada. Nenhuma dessas perguntas se paga antes de alguém precisar de
-- verdade do segundo nível. Se precisar, `pasta_pai_id` entra depois sem
-- quebrar nada do que está aqui.
-- ============================================================================

create table pastas_materiais (
  id            uuid        primary key default gen_random_uuid(),
  professor_id  uuid        not null references professores (id) on delete cascade,
  nome          text        not null,
  criada_em     timestamptz not null default now()
);

-- Duas pastas "Livro 1" no mesmo acervo não são organização, são confusão: o
-- professor guardaria metade em cada uma sem perceber. `lower()` porque
-- "Livro 1" e "livro 1" são a mesma prateleira na cabeça de quem digitou.
create unique index pastas_materiais_nome_unico
  on pastas_materiais (professor_id, lower(nome));

-- ── O material aponta para a pasta ─────────────────────────────────────────
--
-- Nulo é a RAIZ, e é o padrão de propósito: material que sobe sem escolha de
-- pasta continua visível e utilizável como sempre foi. Exigir uma pasta para
-- guardar um arquivo transformaria um gesto de dois segundos numa decisão.
alter table materiais add column pasta_id uuid references pastas_materiais (id) on delete set null;

create index materiais_pasta_idx on materiais (pasta_id) where pasta_id is not null;

-- `set null`, nunca `cascade`: apagar a prateleira não pode queimar os livros.
-- O professor que remove "Livro 1" está desfazendo uma ORGANIZAÇÃO — os PDFs
-- voltam para a raiz do acervo, e quem já os tinha continua com eles. Apagar
-- arquivo de verdade tem botão próprio, com o aviso de quantos alunos perdem
-- o acesso (ver `useExcluirMaterial`).
comment on column materiais.pasta_id is
  'Pasta do acervo (0017). Nulo = raiz. Não tem relação com acesso, que mora em materiais_alunos.';

alter table pastas_materiais enable row level security;

create policy prof_owns on pastas_materiais
  for all using (professor_id = auth.uid())
  with check (professor_id = auth.uid());

comment on table pastas_materiais is
  'Prateleiras do acervo do professor. Organizam materiais; não concedem acesso a ninguém.';
