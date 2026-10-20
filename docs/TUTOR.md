# Tutor oral no produto (beta fechado)

O tutor oral nasceu como POC em [`poc-tutor/`](../poc-tutor/README.md), numa página escondida com senha. A migration [0024](../supabase/migrations/0024_tutor.sql) o traz para dentro do produto:

- **Professor liberado** (`tutor_acesso`) vê a aba **Configurações → Tutor**: alunos com tutor, preferências (voz natural, microfone automático, sessões por mês), uso e custo do mês, resultados recentes.
- Na **ficha do aluno**, aba **Tutor**: a chave do tutor daquele aluno, as lições da biblioteca que ele pratica e o histórico das práticas.
- O **aluno** com o tutor ligado ganha o item **Tutor** no menu do app: a lista de lições liberadas (`/painel/tutor`) e a aula em tela cheia (`/painel/tutor/:licaoId`).

A tela da aula é a mesma do laboratório ([`poc-tutor/web/AulaDoTutor.tsx`](../poc-tutor/web/AulaDoTutor.tsx)). O que muda é a conexão ([`conexao.ts`](../poc-tutor/web/conexao.ts)): no app, as chamadas vão para a função `tutor-aluno`, com o token do aluno e a sessão aberta.

## Quem pode o quê

| Regra | Onde é garantida |
|---|---|
| Só professor liberado vê o tutor | `tutor_acesso` sem policy de escrita: só o SQL Editor libera |
| Até `max_alunos` com tutor ligado | trigger `conferir_tutor_do_aluno` em `alunos` |
| Aluno só pratica com o tutor ligado e lição liberada | `tutor-aluno`, em toda chamada |
| Sessões por mês: menor entre `professores.tutor_sessoes_mes` e `tutor_acesso.max_sessoes_mes` | `tutor-aluno`, ação `iniciar` (mês de America/Sao_Paulo) |
| Sessão vale 2 h e até US$ 0,50 | `tutor-aluno` (`DURACAO_MAX_MS`, `TETO_POR_SESSAO_USD`) |
| Voz natural desligada = nada de Gemini TTS | `tutor-aluno` recusa `falar_stream` |
| O prompt do avaliador vem do banco, não do navegador | `tutor-aluno` lê `notasParaAvaliador` do roteiro e confere o `itemId` |

O custo de cada chamada é somado no servidor (RPC `tutor_somar_gasto`), com os preços de [`_shared/tutor/precos.ts`](../supabase/functions/_shared/tutor/precos.ts), espelhados em `poc-tutor/web/custo.ts`.

## Ordem para publicar

A ordem importa: `painel-aluno-obter` novo lê `alunos.tutor_ativo`, que só existe depois da migration.

1. **Migration** — rode `supabase/migrations/0024_tutor.sql` no SQL Editor (ou `supabase db push`).
2. **Funções** — `tutor-aluno` e `painel-aluno-obter` com verify-jwt ligado (o aluno está logado); `poc-tutor` continua sem:
   ```bash
   supabase functions deploy tutor-aluno
   supabase functions deploy painel-aluno-obter
   supabase functions deploy poc-tutor --no-verify-jwt
   ```
   Os secrets são os do laboratório: `GEMINI_API_KEY`, `TYPESAFE_API_KEY` (opcional) e, se quiser trocar, `POC_TUTOR_MODELO`, `POC_TUTOR_MODELO_TTS`, `POC_TUTOR_VOZ`.
3. **Lições** — ponha `SUPABASE_SERVICE_ROLE_KEY` em `poc-tutor/.env.local` (já ignorado pelo git) e publique cada uma:
   ```bash
   cd poc-tutor
   node scripts/publicar-licao.ts roteiro/licao-apresentacoes.json --nivel A1 --ordem 1 --codigo <senha-da-poc>
   node scripts/publicar-licao.ts roteiro/licao-rotina.json --nivel A1 --ordem 2 --codigo <senha-da-poc>
   node scripts/publicar-licao.ts roteiro/licao-fim-de-semana.json --nivel A2 --ordem 3 --codigo <senha-da-poc>
   node scripts/publicar-licao.ts roteiro/licao-clima.json --nivel A2 --ordem 4
   ```
   Com `--codigo` (a senha `POC_TUTOR_CODIGO`), o script grava as falas fixas que faltam pela função `poc-tutor` e sobe os MP3 para o bucket `tutor-falas`. Precisa de `pip install lameenc` para a conversão. Sem `--codigo`, sobe só as que já existem em `web/audios/` (as da lição do clima); o resto o aluno ouve em stream. `--rascunho` salva sem publicar.
4. **Liberar um professor** — no SQL Editor:
   ```sql
   insert into tutor_acesso (professor_id, max_alunos, max_sessoes_mes, observacao)
   select p.id, 5, 30, 'beta'
     from professores p join auth.users u on u.id = p.id
    where u.email = 'professor@exemplo.com'
   on conflict (professor_id) do update
     set max_alunos = excluded.max_alunos, max_sessoes_mes = excluded.max_sessoes_mes;
   ```
   Para tirar do beta: `delete from tutor_acesso where professor_id = '<id>';`. O tutor some para o professor e para os alunos dele, e as sessões já feitas ficam.
5. **Front** — o deploy normal do app (Vercel).

## Escrever uma lição nova

Uma lição é um `Roteiro` ([`poc-tutor/src/tipos.ts`](../poc-tutor/src/tipos.ts)) em JSON, em `poc-tutor/roteiro/`. Além dos blocos, apoios, conversa e recuperação, cada lição traz:

- `notasParaAvaliador` — os fatos de gramática que o avaliador tem de respeitar (a linha "Material:" do prompt).
- `nomes` — como os blocos e as habilidades aparecem para o aluno: `curto` no selo da tela, `resumo` no que o tutor diz no fim.

`npm test` em `poc-tutor/` valida todas as lições da pasta (`test/roteiros.test.ts`): roteiro válido, nenhuma resposta vazando no painel ou nas pistas, nomes completos, e a aula rodando do começo ao fim, com acertos e com erros.
