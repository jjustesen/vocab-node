# Gravação da aula e exportação em layouts

O professor grava a aula e, depois, escolhe como o vídeo final fica: só as
câmeras, câmeras com o conteúdo, falante em destaque — em 16:9 para a aula
inteira ou em 9:16 para um reel. Para isso, **tudo é gravado separado** e a
composição acontece só na exportação.

Este documento fixa as decisões, o modelo de dados e a ordem de implementação.
O dimensionamento do servidor está em [LIVEKIT-SELF-HOST.md](LIVEKIT-SELF-HOST.md).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| O conteúdo (palco) é gravado como | **Log de eventos**, re-renderizado na exportação | O palco é estado, não pixels (ver `estado-palco.ts`). Gravar os eventos custa zero durante a aula e dá texto e traço nítidos em qualquer resolução, inclusive vertical. As alternativas (professor publicar o palco como tela; Chrome headless por sala no servidor) custam CPU/banda ao vivo e amarram o layout na hora de gravar |
| Câmeras e microfones | **Track Egress** do LiveKit, um arquivo por track, sem transcodificar | É demux, não encode: ~0,1–0,3 vCPU por track |
| Retenção das faixas brutas | **1 dia** a partir do fim da aula | O professor exporta ou baixa no mesmo dia. Guardar mais é custo que cresce para sempre (~US$ 35/mês por mês de aulas retido a 720p) |
| Download | As faixas brutas e as exportações ficam disponíveis para **baixar** enquanto existirem | Quem quer editar fora (CapCut, Premiere) leva os arquivos separados; quem quer pronto, exporta aqui |
| Retenção das exportações | **7 dias** | Regerar é barato; guardar não |
| Onde os bytes ficam | Object storage S3-compatível (**Cloudflare R2**), nunca no Supabase Storage | R2 não cobra saída; Supabase cobra US$ 0,09/GB para assistir/baixar |
| Turma | Grava professor (vídeo + áudio), **áudio** de cada aluno e o log. Vídeo dos alunos só se o professor marcar | 40 câmeras = 27 GB/h. Para o layout "falante atual" o áudio + o evento de quem fala já bastam para o corte; a câmera do aluno é opcional e explícita |

## Custo com retenção de 1 dia

| Item | Valor |
|---|---|
| Faixas brutas em trânsito (pior dia: 10 salas × 8 h × 2 tracks de vídeo a 720p) | ~105 GB/dia |
| Storage médio (1 dia de retenção + exportações de 7 dias) | ~150–250 GB → **~US$ 3–4/mês** no R2 |
| CPU de gravação (egress) | 4–8 vCPU de pico com as 10 salas gravando ao mesmo tempo → **KVM 4** (4 vCPU / 16 GB / 200 GB), com `cpu_cost` do track egress abaixado para 0,3 |
| Exportação | Reel de 60–90 s com conteúdo: 1–3 min de CPU. Aula inteira só câmeras: ~0,5–1× tempo real. Aula inteira com conteúdo: ~3–6× tempo real — vai para a fila com limite |

O disco local da VPS é o gargalo do pior dia: o egress grava no disco e sobe
ao terminar. 200 GB comportam ~1 dia de tudo; a limpeza do egress após o
upload tem que estar ligada.

## Arquitetura

```
 sala (navegador)                 VPS                          Supabase / R2
 ───────────────                  ───                          ─────────────
 [Gravar] ──► gravacao-iniciar ─► livekit egress API           gravacoes (linha)
                                   └► track egress × N ──────► R2: brutas/<gravacao>/<faixa>.webm
 palco/lousa/vista ─────────────► gravacao-evento ───────────► eventos_gravacao (log)
 [Parar] / fim da sala ────────► gravacao-encerrar ─────────► faixas (started_at, url)

 painel de gravações ◄──────────  URLs assinadas  ◄──────────  gravacoes / faixas
   player sincronizado (faixas + palco re-renderizado no navegador, modo replay)
   [Exportar layout X, trecho a–b] ─────────────────────────► exportacoes (fila)
                                  worker (Node + ffmpeg + Remotion) ◄─┘
                                   └► R2: exportadas/<id>.mp4 ─────► link de download
 pg_cron diário ─► apaga brutas > 1 dia, exportadas > 7 dias (R2 + linhas)
```

Três peças novas: **Edge Functions** que falam com a API do egress,
**tabelas** de gravação/faixa/evento/exportação, e um **worker** na VPS que
consome a fila de exportação. O `livekit-server` e o `sala-entrar` não mudam.

## Modelo de dados

```sql
create table gravacoes (
  id             uuid primary key default gen_random_uuid(),
  professor_id   uuid not null references professores (id) on delete cascade,
  sala_id        uuid not null references salas (id) on delete cascade,
  aula_id        uuid references aulas (id) on delete set null,
  turma_id       uuid references turmas (id) on delete set null,
  egress_room    text not null,                -- nome da sala no LiveKit
  status         text not null check (status in ('gravando','processando','pronta','falhou','expirada')),
  iniciada_em    timestamptz not null default now(),
  encerrada_em   timestamptz,
  expira_em      timestamptz,                  -- encerrada_em + 1 dia
  grava_camera_alunos boolean not null default false
);

create table faixas (
  id             uuid primary key default gen_random_uuid(),
  gravacao_id    uuid not null references gravacoes (id) on delete cascade,
  participante   text not null,                -- ParticipanteId: prof-<id> | aluno-<id>
  nome_exibido   text not null,
  tipo           text not null check (tipo in ('video','audio')),
  egress_id      text not null,
  started_at_ns  bigint,                       -- do LiveKit: é o que alinha as faixas
  duracao_ms     integer,
  objeto         text,                         -- chave no R2
  tamanho_bytes  bigint,
  status         text not null check (status in ('gravando','pronta','falhou'))
);

-- O palco, a lousa e a vista, como aconteceram. `t_ms` é relativo a
-- gravacoes.iniciada_em (relógio do servidor, carimbado na Edge Function —
-- o relógio do navegador não entra).
create table eventos_gravacao (
  gravacao_id    uuid not null references gravacoes (id) on delete cascade,
  t_ms           integer not null,
  topico         text not null,                -- 'palco' | 'lousa' | 'vista' | 'fala'
  mensagem       jsonb not null,
  primary key (gravacao_id, t_ms, topico)
);

create table exportacoes (
  id             uuid primary key default gen_random_uuid(),
  gravacao_id    uuid not null references gravacoes (id) on delete cascade,
  professor_id   uuid not null references professores (id) on delete cascade,
  layout         text not null,                -- 'lado-a-lado' | 'coluna' | 'falante-conteudo' | 'so-cameras'
  formato        text not null check (formato in ('16:9','9:16')),
  inicio_ms      integer not null,
  fim_ms         integer not null,
  status         text not null check (status in ('na_fila','renderizando','pronta','falhou','expirada')),
  progresso      smallint not null default 0,
  objeto         text,
  erro           text,
  criada_em      timestamptz not null default now(),
  expira_em      timestamptz                   -- pronta + 7 dias
);
```

RLS igual ao resto do banco: `professor_id = auth.uid()`. O aluno nunca lê
gravação; o worker usa `service_role`.

## Fluxos

### Gravar

1. Professor clica **Gravar** na sala. `gravacao-iniciar` (JWT do professor)
   cria a linha, chama `StartTrackEgress` para cada track já publicada e
   guarda um `egress_id` por faixa.
2. Quem publica track depois (aluno entra atrasado, liga a câmera) dispara um
   webhook do LiveKit (`track_published`) → a mesma função inicia o egress
   dessa track. Em turma, vídeo de aluno só se `grava_camera_alunos`.
3. O cliente do professor, enquanto grava, espelha cada mensagem que envia ou
   recebe nos tópicos `palco`, `lousa` e `vista` para `gravacao-evento`, em
   lotes de ~1 s. Inclui um evento `fala` quando o falante ativo muda (o
   mesmo sinal do marcador no topo da sala).
4. Todo mundo na sala vê o indicador de gravação. O aluno consentiu no
   cadastro; o indicador é o aviso contínuo.
5. **Parar**, ou o professor sair da sala, chama `gravacao-encerrar`:
   `StopEgress` em todas as faixas, `status = processando`. O webhook
   `egress_ended` preenche `objeto`, `started_at_ns`, `duracao_ms`, e quando
   a última faixa chega, `status = pronta` e `expira_em = agora + 1 dia`.
6. Egress cair não derruba a aula: a faixa fica `falhou`, o professor é
   avisado no painel, o resto da gravação vale.

### Assistir

O painel lista as gravações do professor com contagem regressiva de
expiração. O player abre as faixas por URL assinada (Edge Function assina
com validade curta) e reproduz **sincronizado** pelo `started_at_ns` de cada
uma. O palco é re-renderizado no navegador pelos mesmos componentes da sala
em **modo replay**: recebe o estado no instante `t` derivado de
`eventos_gravacao`. É o mesmo renderizador que a exportação usa — o que o
professor vê é o que sai.

### Baixar

Botão por faixa e "baixar tudo" (zip gerado pelo worker, também com 7 dias).
As faixas brutas saem como vieram do egress (`.webm` para vídeo, `.ogg` para
áudio), com um `manifesto.json` que traz os offsets — quem edita fora alinha
com isso.

### Exportar

1. Professor escolhe layout, formato e trecho; entra em `exportacoes` como
   `na_fila`. Reels (até 3 min) têm prioridade sobre aulas inteiras.
2. O worker pega o próximo, baixa as faixas do R2 para disco local, e:
   - **layouts sem conteúdo** (só câmeras): ffmpeg direto — `xstack`/`overlay`
     + x264. Nada de Remotion.
   - **layouts com conteúdo**: Remotion renderiza a faixa do palco (o
     componente de replay, quadro a quadro, na resolução e proporção do
     layout) para um `.mp4` intermediário; ffmpeg compõe com as câmeras.
   - **falante atual**: o worker gera a linha do tempo de cortes a partir dos
     eventos `fala` (com histerese de ~1,5 s para não piscar) e o ffmpeg
     alterna a fonte.
3. Saída H.264 + AAC, 1080p (1920×1080 ou 1080×1920), sobe para R2,
   `status = pronta`, `expira_em = agora + 7 dias`. O painel mostra o link.
4. Concorrência: 1 aula inteira **ou** 3 reels por vez em 4 vCPU. Trabalho
   que morre no meio volta para a fila (`renderizando` há mais de N min).

### Limpar

`pg_cron` uma vez por dia: apaga objetos no R2 e marca `expirada` para
brutas com `expira_em < now()` e exportações idem. Nunca apaga o que está
`renderizando`.

## Layouts

Os quatro do desenho, cada um em 16:9 e 9:16:

| Chave | Composição | Precisa do palco |
|---|---|---|
| `so-cameras` | Professor em cima, aluno embaixo (ou lado a lado em 16:9) | não |
| `coluna` | Professor, aluno, conteúdo empilhados | sim |
| `falante-conteudo` | Falante atual em cima, conteúdo grande embaixo | sim |
| `turma` | Professor + alunos em grade (só os com vídeo) | não |

Em 9:16 as câmeras são recortadas ao centro (o rosto fica); em 16:9 entram
inteiras. O palco é renderizado já na proporção do espaço que ocupa — não é
um 16:9 espremido.

## Configuração do servidor

- `livekit/egress` no `docker-compose` (o `generate` cria com `--egress`),
  com `cpu_cost.track: 0.3` e as credenciais do R2 (`s3` com `endpoint`
  da Cloudflare). Sem `room_composite`/`web` — nunca usamos.
- Webhooks do LiveKit apontando para uma Edge Function (`livekit-webhook`),
  validando a assinatura com a API key/secret.
- Worker: um serviço Node no `docker-compose` (imagem própria com `ffmpeg` e
  Chromium para o Remotion), lendo `exportacoes` por polling com
  `for update skip locked`.
- Secrets novos no Supabase: `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY`,
  `R2_SECRET_KEY`, `LIVEKIT_WEBHOOK_SECRET` (se separado).

## Fases

1. **Gravar e baixar** — egress de tracks, tabelas `gravacoes`/`faixas`,
   Edge Functions iniciar/encerrar/webhook, painel com lista + download +
   expiração de 1 dia, limpeza. *Entrega valor sozinha: o professor já leva
   os arquivos separados para editar fora.*
2. **Log do palco + player** — `eventos_gravacao`, espelhamento no cliente,
   modo replay dos componentes do palco, player sincronizado.
3. **Exportar só câmeras** — worker, ffmpeg, layouts `so-cameras` e `turma`,
   fila e download com 7 dias.
4. **Exportar com conteúdo** — Remotion renderizando o replay, layouts
   `coluna` e `falante-conteudo`, corte por falante.
5. **Marcadores** — o professor marca "vira reel" durante a aula; a timeline
   do player mostra e pré-preenche o trecho.

## Fora do escopo por agora

Gravação no navegador (MediaRecorder) como alternativa ao egress — não
serve para o aluno (upload de GB pelo 4G, aba fechada perde tudo) e não
resolve o palco. Legendas automáticas e transcrição — outra feature, com
custo próprio de IA.
