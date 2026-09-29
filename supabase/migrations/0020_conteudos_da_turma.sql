-- ============================================================================
-- O que é DA TURMA (29/09/2026)
--
-- Até aqui a turma era só um atalho de seleção: o botão "Adults 1" marcava os
-- cinco alunos na lista, e o envio (trilha, atividade ou material) gravava
-- cinco linhas por aluno — sem nenhum registro de que aquilo foi para a
-- TURMA. Era uma foto de quem estava lá naquele dia.
--
-- O caso que expôs isso: professor com trilha e turma criadas, adiciona uma
-- pessoa à turma, e a trilha não vai para ela. Nada estava quebrado — só não
-- havia no banco onde perguntar "o que esta turma já recebeu?".
--
-- ── A regra: o que é da turma, TODOS têm ─────────────────────────────────────
--
-- Um item vira da turma quando é enviado PARA A TURMA — pela tela da turma ou
-- escolhendo a turma como destino nos modais de envio. Não existe "mandar
-- para a turma menos um": os membros vão juntos. A partir daí:
--
--   - quem já é membro e não tem o item, recebe na hora;
--   - quem entra na turma recebe tudo o que está aqui, automaticamente, no
--     mesmo gesto de adicionar;
--   - quem sai continua com o que já tinha (a resposta e a nota são dele).
--
-- O envio automático acontece no FRONT, e não num trigger: o link de quem não
-- tem conta nasce de um token que só existe no navegador do professor (RNF-09
-- — o banco guarda só o hash). Um trigger criaria atribuições cujo link
-- ninguém tem.
--
-- ── Por que três colunas, e não um `item_id` genérico ───────────────────────
--
-- Para o cascade funcionar: apagar a trilha, a atividade ou o material leva o
-- vínculo junto, sem trigger e sem vínculo órfão apontando para o nada.
-- ============================================================================

create table turmas_conteudos (
  id            uuid        primary key default gen_random_uuid(),
  turma_id      uuid        not null references turmas (id)     on delete cascade,
  trilha_id     uuid        references trilhas (id)             on delete cascade,
  atividade_id  uuid        references atividades (id)          on delete cascade,
  material_id   uuid        references materiais (id)           on delete cascade,
  criado_em     timestamptz not null default now(),
  constraint conteudo_de_um_tipo check (num_nonnulls(trilha_id, atividade_id, material_id) = 1)
);

-- Unique comum, não parcial: NULL nunca colide com NULL, então cada par só
-- vale para a coluna preenchida — e o front consegue usar `upsert` com
-- `onConflict`, que não enxerga índice parcial.
alter table turmas_conteudos add constraint turmas_conteudos_trilha_unica    unique (turma_id, trilha_id);
alter table turmas_conteudos add constraint turmas_conteudos_atividade_unica unique (turma_id, atividade_id);
alter table turmas_conteudos add constraint turmas_conteudos_material_unico  unique (turma_id, material_id);

alter table turmas_conteudos enable row level security;

-- Mesma regra de `turmas_alunos` (0015): o vínculo é do professor dono da turma.
create policy prof_owns on turmas_conteudos
  for all using (
    exists (select 1 from turmas t where t.id = turma_id and t.professor_id = auth.uid())
  ) with check (
    exists (select 1 from turmas t where t.id = turma_id and t.professor_id = auth.uid())
  );

-- ── Sem backfill, de propósito ──────────────────────────────────────────────
--
-- A turma é uma entidade própria que ALIMENTA os alunos — nunca o contrário.
-- Deduzir o conteúdo da turma a partir do que os alunos têm (por exemplo,
-- "o que todos os membros receberam") faria o histórico individual de quem
-- entra virar conteúdo da turma. A turma começa vazia; o professor envia para
-- ela o que for dela, e quem já tem o item não recebe de novo.

comment on table turmas_conteudos is
  'O que é da turma. Quem entra na turma recebe automaticamente tudo o que está aqui (o envio é feito pelo front, que gera os links).';
