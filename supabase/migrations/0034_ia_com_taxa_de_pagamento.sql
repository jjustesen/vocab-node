-- ============================================================================
-- 0034 — A IA é cobrada 10% acima do preço do modelo
-- ============================================================================
--
-- O pagamento leva cerca de 10% do que entra: o professor paga R$ 20 de
-- créditos e chegam uns R$ 18. Para que esses R$ 20 cubram o que ele gasta,
-- todo custo de IA é cobrado como se o modelo custasse 10% a mais
-- (US$ 1,00 vira US$ 1,10).
--
-- Tudo o que converte dólar em reais passa por `cotacao_dolar()`: o acerto
-- das sessões (creditos_acertar_vencidas) e o preço mínimo dos planos
-- (salvar_plano_aluno). Então basta mudar esta função: R$ 5,50 × 1,10.
-- Do lado das funções e do app, o mesmo valor é REAIS_POR_DOLAR
-- (_shared/creditos.ts e app/src/lib/custo-ia.ts).
--
-- Vale para o que acontecer daqui em diante. Movimentos já acertados ficam
-- como estão; planos já salvos não mudam de preço (o novo mínimo só é
-- conferido quando o professor salvar o plano de novo).
-- ============================================================================

create or replace function public.cotacao_dolar()
returns numeric
language sql
immutable
as $$ select 5.5::numeric * 1.10 $$;

comment on function public.cotacao_dolar() is
  'Reais cobrados por dólar de IA: cotação fixa de R$ 5,50 mais 10% da taxa do pagamento.';
