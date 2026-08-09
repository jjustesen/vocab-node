-- ============================================================================
-- Conserta: todo aluno cadastrado também virava professor.
--
-- CAUSA: o trigger `on_auth_user_created` (migration 0002) só pula a criação
-- da linha em `professores` quando o metadado `perfil` existe e é diferente
-- de 'professor' — `coalesce(..., 'professor')` trata METADADO AUSENTE como
-- professor. E o cadastro do aluno (CadastroAlunoPage) chamava `signUp` sem
-- metadado nenhum. Resultado: as 3 contas de aluno do projeto tinham também
-- uma conta de professor funcional, acessível pelo /entrar com a mesma senha.
--
-- Não houve vazamento entre contas: o RLS escopa tudo por `auth.uid()`, então
-- cada conta fantasma via um app de professor VAZIO, nunca o de outra pessoa.
-- O estrago real era o aluno ganhar um plano grátis de professor (cota de IA,
-- que custa dinheiro por chamada) e a confusão de ter duas portas abertas.
--
-- O lado do código foi corrigido junto (signUp agora manda perfil='aluno') e
-- as duas áreas ganharam guarda de rota. Esta migration cuida do que já está
-- gravado.
-- ============================================================================

-- 1. Marca as contas de aluno existentes, para que nada as recrie e para que
--    o metadado passe a refletir a verdade.
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                         || jsonb_build_object('perfil', 'aluno')
where u.id in (select user_id from public.contas_aluno)
  and coalesce(u.raw_user_meta_data ->> 'perfil', '') <> 'aluno';

-- 2. Apaga as linhas fantasma em `professores`.
--
--    O `not exists` de cada tabela filha não é paranoia decorativa: as FKs
--    para `professores` são `on delete cascade`, então apagar uma linha que
--    (ao contrário do que verifiquei) tenha ganhado dado levaria junto aluno,
--    atividade e histórico. Com as condições abaixo, uma conta que virou
--    professor de verdade no meio do caminho simplesmente não é tocada — a
--    migration prefere deixar lixo a destruir dado.
--    O `not exists` de contas_aluno cobre o caso menos óbvio: alguém que seja
--    aluno de um professor E professor de outra pessoa (um professor que
--    também estuda inglês). Essa conta tem linha em contas_aluno e É um
--    professor de verdade — apagá-la levaria os alunos dele junto.
delete from public.professores p
where p.id in (select user_id from public.contas_aluno)
  and not exists (select 1 from public.alunos       a where a.professor_id = p.id)
  and not exists (select 1 from public.atividades   t where t.professor_id = p.id)
  and not exists (select 1 from public.trilhas     tr where tr.professor_id = p.id)
  and not exists (select 1 from public.materiais    m where m.professor_id = p.id)
  and not exists (select 1 from public.geracoes_ia  g where g.professor_id = p.id)
  and not exists (select 1 from public.assinaturas  s where s.professor_id = p.id)
  and not exists (select 1 from public.contas_aluno c where c.professor_id = p.id);
