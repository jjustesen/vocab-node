# POC — Tutor de inglês com prática oral guiada

Um tutor que conduz a aula como o professor da gravação: estabelece uma frase,
dá uma pista curta, espera a frase inteira, corrige um ponto por vez, reconstrói
um pré-requisito quando falta a base e, depois, retoma o que exigiu ajuda.

O que a POC precisa demonstrar: [docs/especificacao.md](docs/especificacao.md).
De onde veio: [docs/analise-dinamica-aula.md](docs/analise-dinamica-aula.md) e
[docs/prompt-tutor.txt](docs/prompt-tutor.txt).

## Colocar no ar (3 passos)

**1. Publicar a função** (precisa da `GEMINI_API_KEY` que o app já usa):

```bash
supabase functions deploy poc-tutor --no-verify-jwt
```

O `--no-verify-jwt` é obrigatório — a página não tem login. Sem ele a função
responde 401 e a tela avisa.

**2. Criar um código de acesso** (obrigatório: sem ele a função recusa tudo —
a URL é fácil de adivinhar, e aberta ela seria um Gemini grátis para qualquer um):

```bash
supabase secrets set POC_TUTOR_CODIGO=um-codigo-qualquer
```

E a chave do Jev (TypeSafe AI), que decide a maioria dos turnos sem o Gemini:

```bash
supabase secrets set TYPESAFE_API_KEY=apikey_...
```

Sem ela, a POC continua funcionando, só que tudo vai para o Gemini (mais lento).

Esse código é a **senha** da página: ela pede na entrada e a função confere.
A senha não está em lugar nenhum do código — para trocar, é só rodar o comando
de novo com outra.

**Na plataforma:** a POC também sai no deploy do app, como página à parte
(`app/laboratorio.html`), no caminho escondido definido em `app/vercel.json`.
Fora do Google (noindex) e fora do `robots.txt`, para não anunciar o caminho.

**3. Abrir a página.** No celular, pelo computador (cabo USB e depuração USB
ligada, como já se faz para testar o app):

```bash
npm run dev -- --host 127.0.0.1
```

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:5175 tcp:5175
```

No celular: `http://localhost:5175` (a página pede a senha) — `localhost` libera o
microfone sem HTTPS.

Para ter um link para mandar a outras pessoas: um projeto novo na Vercel com
**Root Directory** `poc-tutor`, a variável `VITE_SUPABASE_URL` (a mesma do app)
e o resto no padrão (build `npm run build`, saída `dist`).

## Como funciona

```
 tutor fala ──▶ microfone abre ──▶ aluno fala ──▶ 3 s de silêncio = terminou
     ▲                                                   │
     │                                                   ▼
 falas (src/falas.ts)                        função poc-tutor (Gemini)
     ▲                                        1. transcreve às cegas
     │                                        2. avalia o texto com o contexto
 controlador (src/controlador.ts)                        │
   decide o próximo passo  ◀──── Avaliacao ──────────────┘
```

- **Controlador** — guarda a posição na aula (última frase aceita, alvo pendente, nível de ajuda, ponto de retorno) e decide o próximo passo. Não fala com IA nem com microfone. É o que a análise diz que não pode ficar só num prompt.
- **Função `poc-tutor`** (`supabase/functions/poc-tutor`) — duas chamadas ao Gemini. A transcrição é cega (não sabe a resposta certa, senão "ouve" a resposta certa — mesma regra da pronúncia no app). A avaliação recebe o texto e o contexto e só *classifica*: adequada, erro (com a habilidade), falta de pré-requisito, dúvida, pedido de ajuda.
- **Falas** — templates, não IA: a pista é a pista, o modelo é o alvo. Cada fala separa português e inglês, e cada parte sai na voz do seu idioma. O que precisa variar (resposta a uma dúvida, reação na conversa) já vem pronto do avaliador.
- **Página** (`web/`) — voz do próprio aparelho, microfone, painel de apoio, registro das decisões.

### Na tela

- **Começar aula** pede o microfone. Depois disso o microfone abre sozinho quando o tutor termina de falar (dá para desligar).
- **Terminei** encerra a vez na hora; senão, 3 s de silêncio depois de falar encerram sozinhos. 8 s sem dizer nada = o tutor dá uma pista.
- **Tocar enquanto o tutor fala** interrompe e abre o microfone.
- **Ajuda**, **Repetir**, e a caixa **Ou digite sua resposta…** (útil no computador).
- Áudio incerto: o tutor pergunta se entendeu certo — **Foi isso** ou **Falar de novo**. Não conta como erro.
- **Apoio** mostra estruturas e vocabulário. **Registro** mostra o estado e cada decisão com o motivo, e baixa o registro da sessão em JSON.
- Abaixo de cada resposta: o que o tutor decidiu e por quê (dá para esconder).

### Ajustes que provavelmente vão precisar de calibração no uso real

| O quê | Onde | Hoje |
|---|---|---|
| Silêncio que encerra a vez | `web/microfone.ts` `FIM_DA_FALA_MS` | 3 s |
| Silêncio que vira pista | `SILENCIO_LONGO_MS` | 8 s |
| Volume que conta como voz | `LIMIAR_VOZ` | 0,03 |
| Erros com o modelo antes de "pendente" | `src/controlador.ts` `ERROS_COM_MODELO_MAX` | 2 |
| Pontos retomados no fechamento | `RECUPERACOES_NO_FECHAMENTO` | 2 |
| Critérios do avaliador | `supabase/functions/poc-tutor/index.ts` `INSTRUCAO_AVALIACAO` | — |

## Estrutura

```
poc-tutor/
├── docs/                     especificação, análise e prompt original
├── roteiro/licao-clima.json  a lição: 5 blocos, 1 sequência de apoio, 3 perguntas de conversa,
│                             12 itens de recuperação; o "painel" é o que o aluno vê
├── src/                      a pedagogia — roda no navegador e nos testes
│   ├── controlador.ts        iniciar(), receber(), memoria()
│   ├── falas.ts              Acao → o que o tutor diz
│   ├── turno.ts              contexto para o avaliador e a resposta dele → Avaliacao
│   ├── validacao.ts          checagens do roteiro
│   └── tipos.ts
├── web/                      a página (React + Vite)
└── test/                     29 testes — um bloco por critério de sucesso
```

## Desenvolvimento

```bash
npm install
npm test          # a pedagogia, sem voz e sem IA
npm run tipos     # checagem de tipos
npm run dev       # a página em http://localhost:5175
```

Os critérios de sucesso que são de condução (2, 3, 4, 5, 7, 8, 9) têm teste em
`test/controlador.test.ts`. Os que dependem da IA e da voz (1, 6 e a qualidade
da avaliação) só se verificam usando — o botão **Baixar registro** existe para
isso: cada sessão de teste vira um arquivo que mostra o que foi ouvido, como
foi avaliado e o que o tutor decidiu.
