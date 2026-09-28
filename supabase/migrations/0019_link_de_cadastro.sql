-- ============================================================================
-- Link de cadastro do professor (28/09/2026)
--
-- Até aqui todo aluno nascia pelas mãos do professor: ele cadastrava a linha
-- em `alunos` e só depois mandava o convite individual (convites_aluno,
-- RF-22/23). Para quem abre uma turma nova isso é um formulário por aluno.
-- Este link inverte a ordem: o professor compartilha UM link (grupo de
-- WhatsApp, por exemplo) e cada pessoa que o abre cria sozinha a própria
-- linha em `alunos` + a conta de login (`contas_aluno`).
--
-- Por que 24h e não os 7 dias do convite individual: o convite serve a UM
-- aluno já conhecido e morre no primeiro uso. Este link é de uso MÚLTIPLO e
-- vai parar em grupo — quanto mais tempo vivo, mais ele circula para fora de
-- quem o professor quis convidar, e cada cadastro consome vaga do plano. Um
-- dia cobre "mandei no grupo, todo mundo se cadastra hoje"; depois disso o
-- professor gera outro em um clique.
--
-- Por que só o hash: mesma regra dos outros links (RNF-09, ver 0001). Quem lê
-- esta linha não consegue cadastrar ninguém. O custo é o professor não poder
-- "rever" o link em outro navegador — o front guarda o token cru no
-- localStorage de quem gerou (mesmo esquema do link aberto, 0010), e fora
-- dali oferece "gerar novo link". Diferente da sala (0013), este link vive
-- 24h: regerar é barato, então não vale abrir exceção à RNF-09.
--
-- Um link por professor (unique em professor_id): gerar de novo troca
-- token_hash na MESMA linha e o link anterior morre na hora — deixa de casar
-- com hash nenhum. Os alunos já cadastrados ficam; eles pendem do professor,
-- não do link.
--
-- As datas são do SERVIDOR (trigger abaixo), não do navegador: o professor
-- escreve nesta tabela direto via RLS, e sem o trigger poderia gravar
-- `expira_em` para daqui a dez anos. Os 24h são regra do banco, não da tela.
--
-- Mesmo princípio de acesso do resto do banco: RLS serve só ao professor;
-- quem abre o link fala com Edge Functions (link-cadastro-obter /
-- link-cadastro-concluir), que validam o token por hash com service_role.
-- ============================================================================

create table links_cadastro (
  id            uuid        primary key default gen_random_uuid(),
  professor_id  uuid        not null unique references professores (id) on delete cascade,
  token_hash    text        not null unique,   -- sha256; o cru só existe no link (RNF-09)
  expira_em     timestamptz not null,          -- geração + 24h, fixado pelo trigger
  criado_em     timestamptz not null default now()
);

create or replace function public.fixar_validade_link_cadastro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Todo insert/update é uma (re)geração: o front só manda token_hash novo.
  new.criado_em := now();
  new.expira_em := now() + interval '24 hours';
  return new;
end;
$$;

create trigger fixar_validade_link_cadastro
  before insert or update on links_cadastro
  for each row execute function public.fixar_validade_link_cadastro();

alter table links_cadastro enable row level security;

create policy prof_owns on links_cadastro
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
