-- ============================================================================
-- O link da sala passa a ser recuperável (decisão do produto, 28/08/2026)
--
-- Até aqui `salas` seguia a RNF-09 como os links de tarefa e de cadastro: o
-- banco guardava só o sha256 e o token cru vivia no localStorage do navegador
-- que criou a sala. O efeito prático era ruim para ESTE link em específico —
-- ele é combinado uma vez e usado toda semana, então trocar de máquina, limpar
-- o navegador ou criar a sala pelo celular fazia o professor perder um link
-- que o aluno continuava usando. A única saída era gerar outro e avisar o
-- aluno, que é justamente a fricção que a sala existe para eliminar.
--
-- A troca é consciente: o token da sala agora existe em claro no banco. Quem
-- lê a linha entra na sala daquele aluno. Duas coisas contêm o risco:
--   - RLS (`prof_owns`) — só o professor dono enxerga a linha;
--   - o token continua trocável a qualquer momento ("gerar novo link").
-- Os outros tokens do sistema (atribuições, convites) NÃO mudam: aqueles dão
-- acesso a conteúdo corrigível e continuam só como hash.
--
-- `token_hash` fica: é por ele que `sala-entrar` procura a sala, e mexer no
-- caminho de leitura de uma função já publicada não faz parte desta mudança.
-- ============================================================================

alter table salas add column if not exists token text;

-- Nullable de propósito. As salas criadas antes desta migration não têm como
-- recuperar o token cru — ele nunca esteve no banco. Elas seguem funcionando
-- (a entrada é por hash); o que a tela faz é oferecer "gerar novo link" para
-- quem cair nesse caso, em vez de fingir que o link se perdeu para sempre.

comment on column salas.token is
  'Token em claro, para reexibir o link. Null nas salas criadas antes de 0013.';
