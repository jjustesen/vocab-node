-- Perfis independentes sobre a mesma identidade autenticada.
create or replace function public.cadastrar_perfil_professor(p_nome text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  if nullif(trim(p_nome), '') is null or length(trim(p_nome)) > 120 then
    raise exception 'Informe seu nome (até 120 caracteres)';
  end if;
  insert into public.professores (id, nome) values (auth.uid(), trim(p_nome))
  on conflict (id) do nothing;
end;
$$;
revoke all on function public.cadastrar_perfil_professor(text) from public, anon;
grant execute on function public.cadastrar_perfil_professor(text) to authenticated;
