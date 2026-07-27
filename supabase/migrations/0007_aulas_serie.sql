-- ============================================================================
-- Séries de aulas recorrentes.
--
-- `repetirSemanas` (RF-42) sempre criou N linhas soltas em `aulas`: nada dizia
-- que elas nasceram do mesmo agendamento. Na prática o professor que queria
-- realocar um aluno de horário tinha que reeditar aula por aula — e nada na
-- tela sugeria que as outras existiam.
--
-- `serie_id` é só um carimbo de origem comum. NÃO virou tabela `series` com
-- regra de recorrência (RRULE) de propósito: as ocorrências continuam
-- materializadas uma a uma, que é o que permite cancelar a aula do dia 12,
-- marcar falta na do dia 19 e anotar a do dia 26 sem que nada disso vire
-- exceção de uma regra. O carimbo dá o vínculo; a linha continua soberana.
-- ============================================================================

alter table aulas add column if not exists serie_id uuid;

-- Toda leitura por série é "as aulas desta série, em ordem" (ou "desta data em
-- diante"), então o índice já entra composto com a data.
create index if not exists aulas_serie_id_data_hora_idx
  on aulas (serie_id, data_hora) where serie_id is not null;

-- ── Backfill das séries já existentes ───────────────────────────────────────
-- As aulas criadas antes desta migration não têm carimbo, mas dá para
-- reconhecê-las: `useCriarAula` repetia somando 7 dias sobre o mesmo horário
-- local, então uma série é um conjunto de aulas do MESMO aluno, no MESMO dia
-- da semana, no MESMO horário, espaçadas de 7 em 7 dias.
--
-- A tolerância de 8 dias na quebra existe para o caso de alguém já ter
-- remarcado uma ocorrência isolada; um buraco maior que isso é tratado como
-- série nova (ex.: o aluno teve aula às quartas 19h no semestre passado e
-- voltou às quartas 19h agora — são dois blocos, não um).
--
-- Grupos de uma aula só não recebem carimbo: aula avulsa não é série, e dar
-- `serie_id` a ela faria a UI oferecer "esta e as próximas" sem ter próximas.
with base as (
  select
    id,
    aluno_id,
    data_hora,
    extract(dow from data_hora) as dia_semana,
    data_hora::time              as hora,
    lag(data_hora) over (
      partition by aluno_id, extract(dow from data_hora), data_hora::time
      order by data_hora
    ) as anterior
  from aulas
  where serie_id is null
),
quebras as (
  select
    id, aluno_id, data_hora, dia_semana, hora,
    case when anterior is null or data_hora - anterior > interval '8 days' then 1 else 0 end as inicia
  from base
),
grupos as (
  select
    id, aluno_id, data_hora, dia_semana, hora,
    sum(inicia) over (
      partition by aluno_id, dia_semana, hora
      order by data_hora
      rows between unbounded preceding and current row
    ) as grupo
  from quebras
),
series as (
  select
    aluno_id, dia_semana, hora, grupo,
    gen_random_uuid() as novo_serie_id
  from grupos
  group by aluno_id, dia_semana, hora, grupo
  having count(*) > 1
)
update aulas a
   set serie_id = s.novo_serie_id
  from grupos g
  join series s
    on  s.aluno_id   = g.aluno_id
    and s.dia_semana = g.dia_semana
    and s.hora       = g.hora
    and s.grupo      = g.grupo
 where a.id = g.id;

-- ── Deslocar uma série no tempo ─────────────────────────────────────────────
-- Realocar um aluno é mover a série INTEIRA por um delta, não gravar um
-- horário absoluto em cada linha: mover a aula de quarta 22:29 para segunda
-- 19:00 é somar -2 dias -3h29 em todas as ocorrências seguintes, preservando
-- a cadência semanal. Fazer isso no cliente exigiria um UPDATE por aula (uma
-- série de 26 semanas = 26 requisições, sem atomicidade); aqui é um só.
--
-- `security invoker` (padrão, explícito aqui por ser o ponto todo): a função
-- roda com o papel de quem chama, então a policy `prof_owns_via_aluno` de
-- `aulas` continua valendo — ninguém desloca série de aluno alheio.
create or replace function mover_aulas_da_serie(
  p_serie_id        uuid,
  p_a_partir_de     timestamptz,        -- null = a série toda
  p_delta_segundos  double precision,
  p_duracao_min     smallint            -- null = mantém a duração de cada aula
) returns integer
language plpgsql
security invoker
as $$
declare
  v_total integer;
begin
  update aulas
     set data_hora   = data_hora + make_interval(secs => p_delta_segundos),
         duracao_min = coalesce(p_duracao_min, duracao_min)
   where serie_id = p_serie_id
     and (p_a_partir_de is null or data_hora >= p_a_partir_de);

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function mover_aulas_da_serie(uuid, timestamptz, double precision, smallint) from public;
grant  execute on function mover_aulas_da_serie(uuid, timestamptz, double precision, smallint) to authenticated;
