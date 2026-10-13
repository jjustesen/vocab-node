-- ============================================================================
-- 0023 — Refazer os erros passa a valer nota
-- ============================================================================
--
-- Até aqui o "Refazer os erros" da tela final era só treino (RF-86): nada era
-- gravado, e o aluno que tirou 8/15 e refez acertando tudo continuava com 8/15
-- — a tela convidava a melhorar ("dá pra melhorar — refazer?") e o resultado
-- nunca mudava.
--
-- Agora a resposta refeita substitui a errada, e a nota (contada sempre a
-- partir de `respostas.correta`) sobe sozinha em todo lugar. O que o aluno
-- fez da PRIMEIRA vez não se perde: a primeira vez que uma resposta é
-- regravada depois de concluída, `correta_na_primeira` guarda o resultado
-- original. Nulo = a resposta nunca foi refeita (a primeira é a atual).
--
--   nota atual         = count(*) filter (where correta)
--   nota da 1ª vez     = count(*) filter (where coalesce(correta_na_primeira, correta))

alter table respostas add column if not exists correta_na_primeira boolean;
