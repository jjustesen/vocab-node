-- ============================================================================
-- Volta o áudio de `ordenar_audio` a ser gerado uma vez e guardado — decisão
-- de 26/07/2026 revertendo o `speechSynthesis` do navegador (migration 0005):
-- em teste real, boa parte dos aparelhos não tinha voz em inglês instalada, o
-- que tornava o exercício impossível de fazer. TTS do Gemini (mesma chave que
-- já paga `gerar-atividade`) troca "às vezes funciona" por "sempre soa igual".
--
-- Este bucket é gerado no momento em que o PROFESSOR salva a atividade — nunca
-- pelo aluno, então usa a policy de dono normal (RLS do professor via JWT), o
-- mesmo padrão de `materiais` em 0004. Diferente de `audio-respostas` (0005),
-- que é escrito pelo ALUNO via service_role — são dois buckets com dono e
-- caminho de escrita opostos, não duplicata um do outro.
-- ============================================================================

alter table questoes add column if not exists audio_path text;

insert into storage.buckets (id, name, public)
values ('audio-questoes', 'audio-questoes', false)
on conflict (id) do nothing;

create policy prof_owns_audio_questoes on storage.objects
  for all
  using (bucket_id = 'audio-questoes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audio-questoes' and (storage.foldername(name))[1] = auth.uid()::text);
