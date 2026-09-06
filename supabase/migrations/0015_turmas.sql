-- ============================================================================
-- Turmas — a aula em grupo
--
-- Até aqui o produto era 1:1 e o PRD dizia isso (4.2). O que muda agora não é
-- "a sala aceita mais gente": é O QUE O LINK SIGNIFICA.
--
-- Em 0012/0013, o token da sala é ENDEREÇO E IDENTIDADE ao mesmo tempo. Quem
-- abre `/s/<token>` não só sabe qual sala é — ele É a Lais, porque o token
-- pertence à linha dela. É daí que o convidado sem conta tira o nome, a ficha
-- e a aula onde a anotação cai, tudo sem login.
--
-- Numa turma isso não se sustenta: o token não pode dizer quem é a pessoa,
-- porque são várias. Ele vira SÓ ENDEREÇO, e a identidade passa a vir de
-- outro lugar — a conta do aluno, ou o e-mail digitado na antessala.
--
-- ── Por que o e-mail é obrigatório na turma ─────────────────────────────────
--
-- Porque sem ele o link de turma seria encaminhável para qualquer um. Com um
-- aluno por sala o risco era contido (o professor sabe quem tem o link); com
-- uma turma, o mesmo token circula em N conversas de WhatsApp.
--
-- Exigir um e-mail QUE JÁ ESTEJA NA BASE transforma o link numa porta com
-- lista de convidados: ele continua sendo aberto por quem tem o endereço, mas
-- só entra quem o professor já cadastrou. E, de quebra, resolve o que o
-- produto precisa de qualquer jeito — achar a pessoa para trazer os materiais
-- dela e para mandar tarefa depois.
--
-- Isto é IDENTIFICAÇÃO, não autenticação: quem souber o e-mail de um aluno e
-- tiver o link entra como ele. Para uma turma de aula particular é uma troca
-- aceitável (é o mesmo nível de garantia de uma sala do Meet com link); se um
-- dia precisar ser autenticação, o caminho é mandar um código para o e-mail
-- antes de liberar — e este schema não muda por causa disso.
--
-- A porta 1:1 NÃO passa a pedir e-mail. Ali o token já identifica a pessoa,
-- então pedir e-mail só acrescentaria fricção sem nenhuma informação nova —
-- e travaria todos os alunos que hoje estão cadastrados sem e-mail.
-- ============================================================================

create table turmas (
  id            uuid        primary key default gen_random_uuid(),
  professor_id  uuid        not null references professores (id) on delete cascade,
  nome          text        not null,
  criada_em     timestamptz not null default now()
);

-- Quem é ESPERADO na turma. É esta lista que o e-mail da antessala consulta —
-- e é por isso que ela não é só organização de tela: ela é o controle de
-- acesso da sala em grupo.
create table turmas_alunos (
  turma_id  uuid not null references turmas (id) on delete cascade,
  aluno_id  uuid not null references alunos (id) on delete cascade,
  primary key (turma_id, aluno_id)
);

create index turmas_alunos_aluno_idx on turmas_alunos (aluno_id);

-- ── A sala passa a servir aos dois casos ────────────────────────────────────
--
-- Aditivo de propósito: as salas 1:1 que já existem continuam byte a byte como
-- estavam, e `sala-entrar` continua achando cada uma por `token_hash`. Trocar
-- o modelo por um "encontro" genérico seria mais limpo no papel e exigiria
-- migrar dado vivo de um produto em uso — não paga agora.

alter table salas add column turma_id uuid references turmas (id) on delete cascade;
alter table salas alter column aluno_id drop not null;

-- Uma sala é de UM aluno ou de UMA turma, nunca das duas coisas nem de
-- nenhuma. Sem este check, uma linha órfã viraria uma sala que ninguém sabe
-- para quem serve — e `sala-entrar` teria que adivinhar.
alter table salas add constraint sala_de_um_ou_de_turma
  check (num_nonnulls(aluno_id, turma_id) = 1);

-- `aluno_id` já era unique (uma sala por aluno). O mesmo para a turma: o link
-- é combinado uma vez e vale para sempre, como no 1:1.
create unique index salas_turma_unica on salas (turma_id) where turma_id is not null;

alter table turmas enable row level security;
alter table turmas_alunos enable row level security;

create policy prof_owns on turmas
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());

-- A associação é do professor dono da TURMA. Checar pelo aluno daria o mesmo
-- resultado hoje (aluno e turma são do mesmo professor), mas amarrar na turma
-- é o que continua certo se um dia um aluno for compartilhado.
create policy prof_owns on turmas_alunos
  for all using (
    exists (select 1 from turmas t where t.id = turma_id and t.professor_id = auth.uid())
  ) with check (
    exists (select 1 from turmas t where t.id = turma_id and t.professor_id = auth.uid())
  );

comment on table turmas is
  'Aula em grupo. O link da sala da turma é endereço, não identidade — quem entra se identifica por conta ou por e-mail já cadastrado.';
