-- ============================================================================
-- Dois tipos novos de questão: `pronuncia` (o aluno lê uma frase em voz alta e
-- recebe nota) e `ordenar_audio` (o aluno ouve a frase e monta com as palavras,
-- que incluem distratoras).
--
-- Por que isto não é só mais um valor no enum:
--
-- 1. `pronuncia` é o PRIMEIRO tipo cuja correção não roda no navegador do aluno
--    (CONTRATO-QUESTOES.md §7). Nota de fala exige chave de API e uma volta ao
--    servidor — daí `respostas.pontuacao`, que `correta boolean` não comporta.
--
-- 2. Áudio entra no produto pelos dois lados: o que o aluno OUVE (TTS da frase,
--    gerado uma vez e guardado) e o que o aluno FALA (a gravação, guardada para
--    o professor ouvir depois). São buckets separados porque têm ciclos de vida
--    diferentes: o primeiro morre com a atividade, o segundo com a atribuição.
--
-- `add value` fora de qualquer uso na mesma transação: no Postgres um valor de
-- enum recém-criado não pode ser referenciado na transação que o criou.
-- ============================================================================

alter type questao_tipo add value if not exists 'pronuncia';
alter type questao_tipo add value if not exists 'ordenar_audio';

-- ── Áudio da questão (TTS de `ordenar_audio`) ───────────────────────────────
-- Nulo enquanto o TTS não rodou: a atividade é salva antes, e a geração do
-- áudio é um passo à parte que pode falhar sem derrubar a atividade inteira.
alter table questoes add column if not exists audio_path text;

-- ── Resultado da fala ───────────────────────────────────────────────────────
-- `pontuacao` só é preenchida em `pronuncia`; nos demais tipos continua nula e
-- `correta` segue sendo a única verdade. Em `pronuncia`, `correta` passa a ser
-- derivada (nota >= corte), para o placar do aluno continuar somando igual.
alter table respostas add column if not exists pontuacao smallint
  check (pontuacao is null or (pontuacao between 0 and 100));

-- Gravação do aluno. Sem `on delete` próprio: o path é limpo junto da resposta,
-- que já cai em cascata com a atribuição.
alter table respostas add column if not exists audio_path text;

-- ── Buckets ─────────────────────────────────────────────────────────────────
-- Privados, como `materiais` (RNF-10): saem só por URL assinada e temporária.
-- Path `${professor_id}/...` nos dois — a policy usa o primeiro segmento como
-- dono, mesmo padrão de `prof_owns` nas tabelas e de `prof_owns_pasta` em 0004.
--
-- O ALUNO NÃO APARECE EM NENHUMA POLICY, de propósito: ele não tem sessão de
-- Postgres. Escreve a gravação e lê o TTS sempre via Edge Function, que usa
-- service_role depois de validar o token por hash — a mesma regra de acesso do
-- resto do fluxo do aluno (ver cabeçalho de 0001_init.sql).

insert into storage.buckets (id, name, public)
values
  ('audio-questoes', 'audio-questoes', false),
  ('audio-respostas', 'audio-respostas', false)
on conflict (id) do nothing;

create policy prof_owns_audio_questoes on storage.objects
  for all
  using (bucket_id = 'audio-questoes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audio-questoes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy prof_owns_audio_respostas on storage.objects
  for all
  using (bucket_id = 'audio-respostas' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audio-respostas' and (storage.foldername(name))[1] = auth.uid()::text);
