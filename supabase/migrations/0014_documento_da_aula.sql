-- ============================================================================
-- Documento da aula — o texto que professor e aluno escrevem juntos, ao vivo
--
-- É a peça que faltava no palco da sala (ver 0012_salas_livekit.sql). A lousa
-- daquela sala é efêmera de propósito: traço não é conteúdo, é gesto. Texto é
-- o contrário — o que se escreve numa aula de idioma (a conjugação corrigida,
-- as cinco frases novas, a lista de erros da semana) é justamente o que o
-- aluno precisa reler depois. Um documento que morre junto com a chamada
-- perderia o único conteúdo da aula que valia guardar.
--
-- UM documento por AULA, e aqui a régua é o oposto da sala:
--
--   `salas` pende do ALUNO porque o link precisa valer para sempre;
--   `documentos_aula` pende da AULA porque o conteúdo é datado.
--
-- "O que a gente escreveu na terça" é uma pergunta com resposta; "o que a
-- gente escreveu na sala" não é. Por isso `aula_id unique` e não `aluno_id`.
--
-- O preço: a sala não sabe quando a aula é (0012 abriu mão disso). Quem
-- amarra as duas pontas é o cliente, com a mesma janela de ±12h que o painel
-- da sala já usa para decidir onde cai a anotação do professor. Fora dessa
-- janela não existe aula para carimbar, e o documento continua funcionando ao
-- vivo pelo data channel — só não é salvo. Escrever no campo não pode
-- significar gravar silenciosamente na aula do mês passado.
--
-- ── Quem escreve na tabela ──────────────────────────────────────────────────
--
-- SÓ O PROFESSOR, e isso é decisão de arquitetura, não de permissão.
--
-- A sala tem três portas (0012), e uma delas é o aluno SEM CONTA, que chega
-- pelo link do WhatsApp e não tem sessão de Postgres nenhuma. Se os dois lados
-- gravassem, o convidado precisaria de uma Edge Function nova só para salvar
-- texto, e as duas pontas disputariam a mesma linha a cada tecla.
--
-- Então a sincronia ao vivo é do LiveKit (data channel, como a lousa) e o
-- banco vê só um gravador: o navegador do professor, com debounce. Os dois
-- editam, um só persiste. Se o professor cair no meio da aula, o texto segue
-- vivo entre as pontas e volta a ser salvo quando ele reconectar.
--
-- ── Como o aluno lê depois ──────────────────────────────────────────────────
--
-- Não lê esta tabela. O RLS deste banco serve só ao professor (0001_init.sql),
-- e o caminho do aluno para conteúdo já existe e é `materiais` — que ele
-- enxerga por `materiais-aluno-obter`. Congelar o documento no fim da aula
-- insere um material `tipo = 'texto'` com `aula_id` preenchido, e o texto
-- chega ao aluno pela porta que já estava aberta.
--
-- Esta tabela é o RASCUNHO VIVO; `materiais` é o que ficou. Separar os dois
-- é o que permite continuar editando depois sem republicar sem querer.
-- ============================================================================

create table documentos_aula (
  id            uuid        primary key default gen_random_uuid(),
  aula_id       uuid        not null unique references aulas (id) on delete cascade,
  aluno_id      uuid        not null references alunos (id) on delete cascade,
  professor_id  uuid        not null references professores (id) on delete cascade,

  -- Array de blocos `{ id, tipo, texto }` — ver `features/sala/formato-documento.ts`,
  -- que é a fonte do formato. jsonb e não texto corrido porque a colaboração é
  -- POR BLOCO: duas pessoas só colidem se editarem o mesmo parágrafo, o que
  -- resolve conflito numa dupla sem trazer CRDT para dentro do projeto.
  blocos        jsonb       not null default '[]'::jsonb,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- A tela abre o documento pela aula, sempre. Sem este índice o unique já
-- resolveria a busca, mas ele também cobre o `on conflict (aula_id)` do upsert
-- que o cliente usa para não precisar saber se a linha já existe.
create index documentos_aula_professor_idx on documentos_aula (professor_id);

alter table documentos_aula enable row level security;

create policy prof_owns on documentos_aula
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());

comment on table documentos_aula is
  'Rascunho vivo escrito durante a aula. Só o professor grava; o aluno recebe pelo data channel do LiveKit e, depois, por materiais.';
