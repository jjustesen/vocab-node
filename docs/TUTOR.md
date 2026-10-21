# Tutor oral no produto (beta fechado)

O tutor oral nasceu como POC em [`poc-tutor/`](../poc-tutor/README.md), numa página escondida com senha. A migration [0024](../supabase/migrations/0024_tutor.sql) o traz para dentro do produto:

- **Professor liberado** (`tutor_acesso`) vê o item **Tutor** no menu (`/tutor`), com quatro abas:
  - **Lições**: as dele (rascunho ou publicadas) e a biblioteca, só leitura. **Nova lição com IA** transforma a foto, o PDF ou o texto de uma página de drillings numa lição em rascunho (`tutor-gerar-licao`, migration 0025).
  - **Alunos**, **Resultados** e **Preferências**: quem tem o tutor, uso e custo do mês, voz, microfone e sessões por mês.
- **Editor de lição** (`/tutor/licoes/:id`): tudo o que o tutor pede, aceita, dica e corrige, mais as "regras para a IA". O `validarRoteiro` impede publicar com problema; o `avisosDoRoteiro` aponta resposta vazando na folha ou na dica. O painel **Áudios** lista as falas fixas, toca as gravadas e grava as que faltam (`tutor-gravar-falas`). **Experimentar** abre a aula como aluno, numa sessão de teste que não conta para ninguém.
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
   supabase functions deploy tutor-gerar-licao
   supabase functions deploy tutor-gravar-falas
   supabase functions deploy tutor-comparar-vozes   # tela /tutor/vozes; ELEVENLABS_API_KEY e DEEPGRAM_API_KEY opcionais
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

## Lições do professor (0025)

- `tutor_licoes.professor_id` nulo = biblioteca global (todos leem as publicadas, ninguém edita pelo app); preenchido = lição do professor (só ele lê, edita e apaga). Liberar para um aluno exige lição global ou dele.
- **Gerar com IA:** o Gemini preenche um schema de listas (`_shared/tutor/licao-ia.ts`) que vira `Roteiro`. Ids, calibração, instrução da transformação pelo nome do bloco, e dicas que entregam a resposta saem no código. Limite: 20 lições geradas por dia por professor; não gasta a cota de atividades do plano.
- **Gravar falas:** a função recalcula a chave de cada fala (`_shared/tutor/chave.ts`, espelho de `poc-tutor/src/chaveDaFala.ts`), pula as que já estão no bucket e codifica MP3 de 64 kbps com lamejs. O editor manda de 4 em 4 e espera quando o TTS bate no limite por minuto.
- **Testes do professor:** `tutor-aluno` com `modo: 'professor'` abre as lições dele, até em rascunho; a sessão fica com `teste = true`, sem aluno, e há um teto de 30 testes em 24 h.
- **As 8 páginas de drillings** do professor estão em `poc-tutor/roteiro/drillings/` (validadas pelo `npm test`) e foram inseridas como rascunhos da conta dele.

