-- ============================================================================
-- Separa a INSTRUÇÃO da FRASE que o aluno lê (feedback de 13/08/2026).
--
-- Antes, `enunciado` carregava as duas coisas no mesmo negrito:
--
--   "Choose the correct option to complete the sentence:
--    'Does Mexican food ____ too spicy to you?'"
--
-- O olho não achava onde começa o inglês que importa. Agora `instrucao` guarda
-- o comando (em pt-BR) e `enunciado` fica só com a frase-alvo, que a tela do
-- aluno destaca em bloco próprio.
--
-- Nullable de propósito: as questões já criadas continuam com tudo em
-- `enunciado`, e o app cai numa divisão heurística (dois-pontos + aspas) para
-- elas — ver `dividirEnunciado` em app/src/types/questao.ts. Nada de backfill
-- automático: adivinhar errado num texto já aprovado pelo professor é pior do
-- que mostrar como está hoje.
-- ============================================================================

alter table questoes add column instrucao text;

comment on column questoes.instrucao is
  'Comando em pt-BR ("Complete a frase"). Null nas questões anteriores a 13/08/2026 — nesse caso a tela divide o enunciado por heurística.';
