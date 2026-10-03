-- ============================================================================
-- Copiar os dados de um aluno para outro (03/10/2026)
--
-- Para o professor contornar sozinho uma conta de aluno que deu problema: ele
-- cria (ou cadastra de novo) o aluno, copia tudo do antigo para o novo, confere
-- e só então exclui o antigo. COPIA, não move — a origem fica intacta até o
-- professor decidir apagá-la, então um engano aqui não perde nada.
--
-- Numa função, e não em vários inserts do front, para ser UMA transação: ou o
-- aluno de destino recebe tudo, ou nada — nunca metade das tarefas sem as
-- respostas.
--
-- O que vem junto:
--   - atribuições + respostas (tarefas, notas, áudios de pronúncia — o áudio é
--     o MESMO arquivo, a resposta copiada aponta para o mesmo `audio_path`);
--   - trilhas, turmas e materiais (vínculos; o que o destino já tinha fica);
--   - aulas + documento da aula (séries ganham id novo, para editar a série de
--     um não mexer na do outro);
--   - pagamentos (o mês que o destino já tinha não é sobrescrito);
--   - campos da ficha que no destino estão vazios (nível, telefone, valor,
--     dia/horário, observações). Nome e e-mail não: são a identidade do destino.
--
-- O que NÃO vem: login (`contas_aluno` — é de quem se cadastrou), convites,
-- eventos de acesso e a sala 1:1 (o destino tem a dele).
--
-- Links das tarefas copiadas: o banco só guarda o hash do token (RNF-09), então
-- a cópia nasce com um hash aleatório que não corresponde a link nenhum. Aluno
-- com conta abre pelo painel; para mandar link, "Gerar novo link" na ficha.
--
-- `security invoker`: roda com o RLS do professor, então cada insert continua
-- passando pelas mesmas policies do resto do app. A checagem de dono no começo
-- é para devolver um erro claro em vez de "0 linhas copiadas".
-- ============================================================================

create or replace function copiar_dados_do_aluno(
  p_origem  uuid,
  p_destino uuid
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_professor   uuid := auth.uid();
  v_atribuicao  record;
  v_aula        record;
  v_nova_id     uuid;
  v_tentativa   smallint;
  v_tarefas     integer := 0;
  v_respostas   integer := 0;
  v_aulas       integer := 0;
  v_n           integer;
  v_trilhas     integer := 0;
  v_turmas      integer := 0;
  v_materiais   integer := 0;
  v_pagamentos  integer := 0;
  v_series      jsonb;
begin
  if p_origem = p_destino then
    raise exception 'Escolha um aluno de destino diferente do de origem.';
  end if;

  if (select count(*) from alunos where id in (p_origem, p_destino) and professor_id = v_professor) <> 2 then
    raise exception 'Aluno não encontrado.';
  end if;

  -- ── Ficha: só preenche o que está vazio no destino ─────────────────────────
  update alunos d
     set nivel_cefr   = coalesce(d.nivel_cefr, o.nivel_cefr),
         telefone     = coalesce(d.telefone, o.telefone),
         valor_mensal = coalesce(d.valor_mensal, o.valor_mensal),
         dia_semana   = coalesce(d.dia_semana, o.dia_semana),
         horario      = coalesce(d.horario, o.horario),
         observacoes  = coalesce(d.observacoes, o.observacoes)
    from alunos o
   where d.id = p_destino and o.id = p_origem;

  -- ── Tarefas + respostas ────────────────────────────────────────────────────
  -- A tentativa é renumerada a partir da última que o destino já tem para a
  -- mesma atividade: `unique (atividade_id, aluno_id, tentativa)` não deixa
  -- reaproveitar o número, e a ordem relativa das tentativas se mantém.
  for v_atribuicao in
    select * from atribuicoes where aluno_id = p_origem order by atividade_id, tentativa
  loop
    select coalesce(max(tentativa), 0) + 1 into v_tentativa
      from atribuicoes
     where aluno_id = p_destino and atividade_id = v_atribuicao.atividade_id;

    insert into atribuicoes (
      atividade_id, aluno_id, trilha_etapa_id, token_hash, tentativa, prazo,
      enviada_em, iniciada_em, concluida_em, revogada_em, link_aberto_id
    ) values (
      v_atribuicao.atividade_id, p_destino, v_atribuicao.trilha_etapa_id,
      encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'),
      v_tentativa, v_atribuicao.prazo, v_atribuicao.enviada_em, v_atribuicao.iniciada_em,
      v_atribuicao.concluida_em, v_atribuicao.revogada_em, v_atribuicao.link_aberto_id
    ) returning id into v_nova_id;

    insert into respostas (atribuicao_id, questao_id, valor, correta, tempo_ms, respondida_em, pontuacao, audio_path)
    select v_nova_id, questao_id, valor, correta, tempo_ms, respondida_em, pontuacao, audio_path
      from respostas where atribuicao_id = v_atribuicao.id;
    get diagnostics v_n = row_count;

    v_tarefas := v_tarefas + 1;
    v_respostas := v_respostas + v_n;
  end loop;

  -- ── Vínculos: o que o destino já tinha prevalece ───────────────────────────
  insert into trilha_alunos (trilha_id, aluno_id, status, iniciada_em, concluida_em)
  select trilha_id, p_destino, status, iniciada_em, concluida_em
    from trilha_alunos where aluno_id = p_origem
  on conflict (trilha_id, aluno_id) do nothing;
  get diagnostics v_trilhas = row_count;

  insert into turmas_alunos (turma_id, aluno_id)
  select turma_id, p_destino from turmas_alunos where aluno_id = p_origem
  on conflict do nothing;
  get diagnostics v_turmas = row_count;

  insert into materiais_alunos (material_id, aluno_id, criado_em)
  select material_id, p_destino, criado_em from materiais_alunos where aluno_id = p_origem
  on conflict do nothing;
  get diagnostics v_materiais = row_count;

  -- ── Aulas + documento da aula ──────────────────────────────────────────────
  -- Cada série da origem vira UMA série nova no destino (mesmo id novo para
  -- todas as aulas dela), senão "editar as futuras" num aluno moveria as do
  -- outro junto.
  select coalesce(jsonb_object_agg(serie_id, gen_random_uuid()), '{}'::jsonb) into v_series
    from (select distinct serie_id from aulas where aluno_id = p_origem and serie_id is not null) s;

  for v_aula in select * from aulas where aluno_id = p_origem loop
    insert into aulas (aluno_id, data_hora, duracao_min, status, anotacao, criada_em, serie_id)
    values (
      p_destino, v_aula.data_hora, v_aula.duracao_min, v_aula.status, v_aula.anotacao, v_aula.criada_em,
      (v_series ->> v_aula.serie_id::text)::uuid
    ) returning id into v_nova_id;

    insert into documentos_aula (aula_id, aluno_id, professor_id, blocos, criado_em, atualizado_em)
    select v_nova_id, p_destino, professor_id, blocos, criado_em, atualizado_em
      from documentos_aula where aula_id = v_aula.id;

    v_aulas := v_aulas + 1;
  end loop;

  -- ── Pagamentos ─────────────────────────────────────────────────────────────
  insert into pagamentos (aluno_id, referencia_mes, valor, status, pago_em)
  select p_destino, referencia_mes, valor, status, pago_em
    from pagamentos where aluno_id = p_origem
  on conflict (aluno_id, referencia_mes) do nothing;
  get diagnostics v_pagamentos = row_count;

  return jsonb_build_object(
    'tarefas', v_tarefas,
    'respostas', v_respostas,
    'trilhas', v_trilhas,
    'turmas', v_turmas,
    'materiais', v_materiais,
    'aulas', v_aulas,
    'pagamentos', v_pagamentos
  );
end;
$$;

revoke execute on function copiar_dados_do_aluno(uuid, uuid) from public;
grant  execute on function copiar_dados_do_aluno(uuid, uuid) to authenticated;
