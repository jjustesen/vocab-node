-- ============================================================================
-- Backfill: cria o perfil de professor para usuários que se cadastraram antes
-- do trigger da 0002 existir.
--
-- Idempotente e inofensiva em banco novo: sem usuários órfãos, não insere nada.
-- ============================================================================

insert into public.professores (id, nome)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'nome'), ''),
    split_part(u.email, '@', 1)
  )
from auth.users u
where coalesce(u.raw_user_meta_data ->> 'perfil', 'professor') = 'professor'
on conflict (id) do nothing;
