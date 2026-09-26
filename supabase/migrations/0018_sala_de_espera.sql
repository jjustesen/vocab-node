-- ============================================================================
-- Sala de espera — o aluno bate na porta, o professor abre
--
-- Até aqui a posse do link (ou a conta) bastava para entrar na chamada. Isso
-- continua sendo o padrão: a maioria dos professores dá aula 1:1 e não quer
-- um passo a mais entre o aluno e a aula. A espera é OPCIONAL, ligada por
-- professor em Configurações, e vale para todas as salas dele.
--
-- ── Por que a espera mora no banco, e não no LiveKit ────────────────────────
--
-- A alternativa seria deixar o aluno entrar na sala do LiveKit sem permissão
-- de ver nem publicar, e o professor promovê-lo pela API de servidor. Ficaria
-- tudo "dentro da chamada", mas o aluno em espera já estaria conectado à sala
-- — e mensagens do data channel (chat, palco) chegariam até ele. Aqui o token
-- do LiveKit simplesmente NÃO É ASSINADO até o professor admitir: quem espera
-- não está na sala, em nenhum sentido.
--
-- ── Uma linha por pessoa por sala ───────────────────────────────────────────
--
-- A chave é (sala, participante) — a mesma identidade estável que vai para o
-- LiveKit (`aluno-<id>`). Recarregar a página enquanto espera não cria um
-- segundo pedido, e abrir pelo link e pelo painel é a mesma pessoa batendo.
--
-- A linha é APAGADA quando o token é entregue (ver `sala-entrar`): a admissão
-- vale para aquela entrada, não para sempre. Sair e voltar é bater de novo,
-- como no Meet.
--
-- `visto_em` é o pulso de quem espera: a tela do aluno consulta a cada poucos
-- segundos e renova o carimbo. Quem fechou a aba para de renovar, e o
-- professor deixa de ver um nome fantasma na lista.
-- ============================================================================

alter table professores add column sala_de_espera boolean not null default false;

create type espera_status as enum ('pendente', 'admitido', 'recusado');

create table sala_espera (
  sala_id          uuid          not null references salas (id) on delete cascade,
  participante_id  text          not null,
  nome             text          not null,
  status           espera_status not null default 'pendente',
  pedido_em        timestamptz   not null default now(),
  visto_em         timestamptz   not null default now(),
  primary key (sala_id, participante_id)
);

-- Mesmo princípio de acesso das outras tabelas: o RLS serve só ao professor,
-- que lista quem espera e admite/recusa. Quem espera fala só com `sala-entrar`,
-- que usa a chave de serviço.
alter table sala_espera enable row level security;

create policy prof_owns_sala on sala_espera
  for all
  using (exists (select 1 from salas s where s.id = sala_id and s.professor_id = auth.uid()))
  with check (exists (select 1 from salas s where s.id = sala_id and s.professor_id = auth.uid()));
