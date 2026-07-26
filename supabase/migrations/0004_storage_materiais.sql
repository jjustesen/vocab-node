-- ============================================================================
-- Bucket de storage para o material original (PDF/foto) que deu origem a uma
-- atividade gerada por IA (etapa 3). Privado — RNF-10: só sai por URL
-- assinada e temporária, nunca público.
--
-- Path de cada objeto: `${professor_id}/${arquivo}` — a policy usa o primeiro
-- segmento do path como dono, o mesmo padrão de `prof_owns` nas tabelas.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('materiais', 'materiais', false)
on conflict (id) do nothing;

create policy prof_owns_pasta on storage.objects
  for all
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);
