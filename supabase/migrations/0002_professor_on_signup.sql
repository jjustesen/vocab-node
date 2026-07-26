-- ============================================================================
-- Cria a linha em `professores` automaticamente quando um usuário se cadastra.
--
-- Por que trigger e não insert no cliente: entre o signUp e um insert do
-- front existe uma janela onde a sessão existe mas o perfil não — se o
-- usuário fechar a aba ali, a conta fica órfã. O trigger fecha a janela.
--
-- Só dispara para cadastro de PROFESSOR. A conta de aluno nasce por Edge
-- Function (fluxo do convite), que grava em `contas_aluno` e marca o
-- metadado `perfil = 'aluno'` — por isso o filtro abaixo.
-- ============================================================================

create or replace function public.criar_professor_no_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'perfil', 'professor') <> 'professor' then
    return new;
  end if;

  insert into public.professores (id, nome)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_professor_no_signup();
