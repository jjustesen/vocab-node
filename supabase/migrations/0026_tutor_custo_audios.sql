-- Quanto já se gastou gravando as falas de cada lição (painel Áudios do editor).
--
-- Antes desta coluna o custo das gravações não ficava em lugar nenhum: as
-- gravadas até aqui ficam com 0 e o painel mostra uma estimativa para elas.

alter table public.tutor_licoes
  add column if not exists custo_audios_usd numeric(10, 5) not null default 0;

-- Anota as falas gravadas e soma o custo NUMA atualização só. Com o botão de
-- gerar fala por fala, duas gravações chegam ao mesmo tempo; ler a lista,
-- juntar e regravar perderia a fala de uma delas.
create or replace function public.tutor_registrar_falas(p_licao text, p_chaves text[], p_custo_usd numeric)
returns void
language sql
set search_path = public
as $$
  update tutor_licoes l
     set falas_gravadas = array(select distinct unnest(l.falas_gravadas || p_chaves)),
         custo_audios_usd = l.custo_audios_usd + p_custo_usd
   where l.id = p_licao;
$$;

revoke all on function public.tutor_registrar_falas(text, text[], numeric) from public, anon, authenticated;
grant execute on function public.tutor_registrar_falas(text, text[], numeric) to service_role;
