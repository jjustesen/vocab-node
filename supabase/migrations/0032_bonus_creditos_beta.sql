-- ============================================================================
-- 0032 — R$ 20 de créditos para quem já está no beta do tutor
-- ============================================================================
--
-- Com a 0031, o teste do professor, a prática dos alunos particulares, gravar
-- falas e gerar lição passam a sair dos créditos. Todo professor começa com
-- R$ 0: sem este bônus, o tutor dos alunos do beta pausaria no dia em que as
-- funções que cobram fossem publicadas.
--
-- Uma linha "bonus" no extrato para cada professor com tutor_acesso. Roda uma
-- vez, como toda migration; quem entrar no beta depois não ganha por aqui.
-- ============================================================================

select creditos_adicionar(professor_id, 20, 'bonus', 'manual', 'bonus-beta-0032', 'Bônus de boas-vindas do beta')
  from tutor_acesso;
