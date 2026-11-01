-- ============================================================================
-- 0028 — Tutor sem limite de alunos
-- ============================================================================
--
-- O professor com o tutor liberado (`tutor_acesso`) liga o tutor para quantos
-- alunos quiser. A única trava que fica é a de uso: as sessões por aluno por
-- mês que o PRÓPRIO professor escolhe (`professores.tutor_sessoes_mes`, 1–200),
-- conferida pela função `tutor-aluno` ao abrir cada sessão.
--
-- `tutor_acesso.max_alunos` e `max_sessoes_mes` continuam na tabela, mas nada
-- mais os lê: o trigger abaixo só confere se o tutor foi liberado.
-- ============================================================================

create or replace function public.conferir_tutor_do_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só interessa quando o aluno PASSA a ter o tutor ligado.
  if not (new.tutor_ativo and new.status = 'ativo') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.tutor_ativo and old.status = 'ativo' then
    return new;
  end if;

  if not exists (select 1 from tutor_acesso where professor_id = new.professor_id) then
    -- Reativar um aluno do arquivo não pode falhar por causa do tutor: ele
    -- volta, com o tutor desligado.
    if tg_op = 'UPDATE' and old.tutor_ativo and old.status <> 'ativo' then
      new.tutor_ativo := false;
      return new;
    end if;
    raise exception 'tutor_nao_liberado' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
