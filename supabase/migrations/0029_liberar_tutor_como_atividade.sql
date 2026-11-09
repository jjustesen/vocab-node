-- ============================================================================
-- 0029 — Liberar uma lição do tutor como se envia uma atividade (09/11/2026)
-- ============================================================================
--
-- Antes, liberar o tutor tomava três telas: publicar a lição no editor, ligar
-- a chave do tutor do aluno (`alunos.tutor_ativo`) e marcar a lição na ficha
-- dele, aluno por aluno. Agora é um botão "Liberar" na lição, com o mesmo
-- seletor do envio de atividade: turmas e alunos.
--
-- ── A chave deixa de ser do professor ───────────────────────────────────────
--
-- `tutor_ativo` continua existindo (a função `tutor-aluno` e o painel do aluno
-- leem a coluna), mas passa a ser consequência: o aluno tem o tutor quando tem
-- pelo menos uma lição liberada. O trigger abaixo mantém a coluna em dia a
-- cada liberação. O trigger `conferir_tutor_do_aluno` (0028) continua barrando
-- quem não tem o tutor liberado na conta.
--
-- ── A lição pode ser da turma ───────────────────────────────────────────────
--
-- Como trilha, atividade e material (0020), a lição liberada PARA A TURMA vira
-- dela: os membros recebem e quem entrar depois também. Aqui o envio pode ser
-- no banco, por trigger: a lição do tutor não tem link nem token, nada que só
-- exista no navegador do professor. Quem sai da turma continua com a lição.
-- ============================================================================

-- ── A lição como conteúdo da turma ──────────────────────────────────────────

alter table turmas_conteudos
  add column licao_tutor_id text references tutor_licoes (id) on delete cascade;

alter table turmas_conteudos drop constraint conteudo_de_um_tipo;
alter table turmas_conteudos
  add constraint conteudo_de_um_tipo
  check (num_nonnulls(trilha_id, atividade_id, material_id, licao_tutor_id) = 1);

alter table turmas_conteudos
  add constraint turmas_conteudos_licao_tutor_unica unique (turma_id, licao_tutor_id);

-- A lição particular de outro professor não pode virar da turma (mesma regra
-- de tutor_licoes_alunos, 0025).
drop policy prof_owns on turmas_conteudos;

create policy prof_owns on turmas_conteudos
  for all using (
    exists (select 1 from turmas t where t.id = turma_id and t.professor_id = auth.uid())
  ) with check (
    exists (select 1 from turmas t where t.id = turma_id and t.professor_id = auth.uid())
    and (
      licao_tutor_id is null
      or exists (
        select 1 from tutor_licoes l
         where l.id = licao_tutor_id and (l.professor_id is null or l.professor_id = auth.uid())
      )
    )
  );

-- Liberar para a turma: todos os membros de agora recebem.
create or replace function public.liberar_licao_da_turma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.licao_tutor_id is null then
    return new;
  end if;
  insert into tutor_licoes_alunos (aluno_id, licao_id)
  select ta.aluno_id, new.licao_tutor_id
    from turmas_alunos ta
    join alunos a on a.id = ta.aluno_id
   where ta.turma_id = new.turma_id
     and a.status = 'ativo'
  on conflict do nothing;
  return new;
end;
$$;

create trigger liberar_licao_da_turma
  after insert on turmas_conteudos
  for each row execute function public.liberar_licao_da_turma();

-- Entrar na turma: recebe as lições dela.
create or replace function public.liberar_licoes_ao_entrar_na_turma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tutor_licoes_alunos (aluno_id, licao_id)
  select new.aluno_id, tc.licao_tutor_id
    from turmas_conteudos tc
   where tc.turma_id = new.turma_id
     and tc.licao_tutor_id is not null
  on conflict do nothing;
  return new;
end;
$$;

create trigger liberar_licoes_ao_entrar_na_turma
  after insert on turmas_alunos
  for each row execute function public.liberar_licoes_ao_entrar_na_turma();

-- ── tutor_ativo acompanha as liberações ─────────────────────────────────────

create or replace function public.tutor_ativo_pelas_licoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := coalesce(new.aluno_id, old.aluno_id);
  v_tem   boolean;
begin
  select exists (select 1 from tutor_licoes_alunos where aluno_id = v_aluno) into v_tem;
  update alunos set tutor_ativo = v_tem where id = v_aluno and tutor_ativo is distinct from v_tem;
  return null;
end;
$$;

create trigger tutor_ativo_pelas_licoes
  after insert or delete on tutor_licoes_alunos
  for each row execute function public.tutor_ativo_pelas_licoes();

-- Quem já estava no tutor fica como as liberações dizem: com lição, ligado;
-- sem lição, desligado (antes ele via o Tutor vazio). Só para professores com
-- o tutor liberado — o trigger 0028 recusaria ligar os outros.
update alunos a
   set tutor_ativo = exists (select 1 from tutor_licoes_alunos l where l.aluno_id = a.id)
 where a.tutor_ativo is distinct from exists (select 1 from tutor_licoes_alunos l where l.aluno_id = a.id)
   and a.status = 'ativo'
   and exists (select 1 from tutor_acesso t where t.professor_id = a.professor_id);
