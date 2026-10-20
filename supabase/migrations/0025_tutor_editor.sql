-- ============================================================================
-- 0025 — Tutor: lições do professor e sessões de teste
-- ============================================================================
--
-- Até a 0024 a biblioteca do tutor era só nossa: as lições entravam por script
-- e o professor apenas escolhia quais cada aluno pratica. Agora o professor
-- liberado no beta tem lições PRÓPRIAS — geradas pela IA a partir do material
-- dele (tutor-gerar-licao) e revisadas no editor da página Tutor.
--
--   professor_id nulo        → biblioteca global: todos leem as publicadas,
--                              ninguém edita pelo app
--   professor_id preenchido  → lição do professor: só ele lê, edita e apaga
--
-- ── Testar antes de liberar ─────────────────────────────────────────────────
--
-- O professor experimenta a lição como aluno, inclusive em rascunho. Essa
-- prática também vira uma linha de tutor_sessoes (o custo é real e soma igual),
-- mas com `teste = true` e sem aluno: não conta no limite de ninguém e fica
-- fora dos resultados dos alunos.
-- ============================================================================

-- ── Lições do professor ─────────────────────────────────────────────────────

alter table tutor_licoes
  add column professor_id   uuid    references professores (id) on delete cascade,
  add column gerada_por_ia  boolean not null default false;

-- As lições do professor não têm um id legível como as da biblioteca
-- ('clima-was-were'): o banco sorteia.
alter table tutor_licoes alter column id set default gen_random_uuid()::text;

create index tutor_licoes_professor_idx on tutor_licoes (professor_id, criado_em desc);

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger tocar_atualizado_em
  before update on tutor_licoes
  for each row execute function public.tocar_atualizado_em();

drop policy le_publicadas on tutor_licoes;

create policy le_globais_e_proprias on tutor_licoes
  for select to authenticated
  using ((professor_id is null and publicada) or professor_id = auth.uid());

-- Criar exige estar no beta: sem tutor_acesso, nada do tutor existe para ele.
create policy prof_cria_propria on tutor_licoes
  for insert to authenticated
  with check (
    professor_id = auth.uid()
    and exists (select 1 from tutor_acesso t where t.professor_id = auth.uid())
  );

create policy prof_altera_propria on tutor_licoes
  for update to authenticated
  using (professor_id = auth.uid())
  with check (professor_id = auth.uid());

create policy prof_apaga_propria on tutor_licoes
  for delete to authenticated
  using (professor_id = auth.uid());

-- Liberar para um aluno: o aluno é do professor E a lição é da biblioteca ou
-- dele — a lição particular de outro professor não pode ser distribuída.
drop policy prof_owns_via_aluno on tutor_licoes_alunos;

create policy prof_owns_via_aluno on tutor_licoes_alunos
  for all using (
    exists (select 1 from alunos a where a.id = aluno_id and a.professor_id = auth.uid())
  ) with check (
    exists (select 1 from alunos a where a.id = aluno_id and a.professor_id = auth.uid())
    and exists (
      select 1 from tutor_licoes l
       where l.id = licao_id and (l.professor_id is null or l.professor_id = auth.uid())
    )
  );

-- ── Sessões de teste do professor ───────────────────────────────────────────

alter table tutor_sessoes add column teste boolean not null default false;
alter table tutor_sessoes alter column aluno_id drop not null;
alter table tutor_sessoes
  add constraint tutor_sessoes_aluno_ou_teste check (teste or aluno_id is not null);
