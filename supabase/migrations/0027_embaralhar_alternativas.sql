-- Embaralha as alternativas das questões geradas por IA que já estão no banco.
--
-- A IA punha a resposta certa quase sempre como PRIMEIRA opção (98 de 101
-- múltiplas escolhas e 104 de 105 lacunas em 21/10/2026), e o aluno acerta
-- pelo padrão sem ler. Questões novas já saem embaralhadas de gerar-atividade
-- (`embaralharAlternativas` em _shared/questao-validacao.ts); esta migration
-- acerta o acervo.
--
-- Por que é seguro para o histórico: `resposta_correta` guarda o TEXTO da
-- opção, não o índice, e `respostas.valor` também guarda o texto escolhido
-- (CONTRATO-QUESTOES.md §3). Reordenar `opcoes` não muda gabarito, acerto já
-- registrado nem nota de atribuição nenhuma.
--
-- Escopo:
--  - só `multipla_escolha` e `lacuna`; `verdadeiro_falso` é ["true","false"]
--    em ordem fixa de propósito;
--  - só atividades com `origem_ia`: nas criadas à mão a ordem é do professor;
--  - só quando a correta está entre as opções (lacuna antiga de campo livre
--    fica como está).
--
-- Idempotente: a nova ordem é determinística — md5 do id da questão com o
-- texto da opção —, então rodar de novo devolve a mesma ordem e não altera
-- nada. Não há opções repetidas no acervo, e o desempate por texto garante a
-- ordem mesmo se houvesse.

update questoes q
   set opcoes = novo.opcoes
  from (
    select q2.id,
           jsonb_agg(e.valor order by md5(q2.id::text || e.valor), e.valor) as opcoes
      from questoes q2
      join atividades a on a.id = q2.atividade_id
      cross join lateral jsonb_array_elements_text(q2.opcoes) as e(valor)
     where a.origem_ia
       and q2.tipo in ('multipla_escolha', 'lacuna')
       and jsonb_typeof(q2.opcoes) = 'array'
       and q2.opcoes ? q2.resposta_correta
     group by q2.id
  ) novo
 where q.id = novo.id
   and q.opcoes is distinct from novo.opcoes;
