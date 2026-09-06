import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Minus,
  NotebookPen,
  Plus,
  User,
  X,
} from 'lucide-react'
import { useAluno, useErrosRecorrentes, useHistoricoDoAluno } from '@/features/alunos/api'
import { useAtualizarAula, useAulasDoAluno, useCriarAula } from '@/features/aulas/api'
import { useResultadoAtribuicao } from '@/features/resultados/api'
import { corDaNota } from '@/features/tarefa/formato'
import { aulaDeAgora, JANELA_HORAS } from './aula-de-agora'
import { linkDaSala, useSala, useSalaDaTurma } from './api'

/**
 * Painel lateral da sala — SÓ do professor.
 *
 * O aluno não vê nada disto, e isso é regra de produto, não recorte de layout:
 * `aulas.anotacao` é a anotação do professor SOBRE a aula, e "erros
 * recorrentes" é diagnóstico. Mostrar ao aluno, ao vivo, seria expor a ficha
 * dele durante a própria aula.
 *
 * Tudo aqui lê pelo cliente do professor (RLS) — nenhuma Edge Function nova.
 */

type AbaPainel = 'anotacoes' | 'aluno'

export type AlunoNoPainel = { id: string; nome: string }

/**
 * ── Numa turma, o painel e por PESSOA ───────────────────────────────────────
 *
 * A anotação da aula e o diagnostico continuam sendo de um aluno so — "erros
 * recorrentes da turma" nao existe, e a cobranca tambem e individual. Entao o
 * painel ganha uma tira de nomes no topo: o professor escolhe de quem esta
 * falando, e anotacao, ficha e historico seguem aquela escolha.
 *
 * No 1:1 a tira nao aparece (um nome so nao e escolha), e a tela e exatamente
 * a de antes.
 */
export function PainelDaAula({
  alunos,
  alunoId,
  aoTrocarAluno,
  turmaId,
}: {
  /** Quem esta na aula. No 1:1 tem um; numa turma, todos os inscritos. */
  alunos: AlunoNoPainel[]
  /** De quem o painel esta falando agora. */
  alunoId: string
  aoTrocarAluno: (alunoId: string) => void
  /** Preenchido na sala de turma — decide qual link o rodape mostra. */
  turmaId: string | null
}) {
  const [aba, setAba] = useState<AbaPainel>('anotacoes')
  const aluno = alunos.find((a) => a.id === alunoId) ?? alunos[0]

  return (
    // `text-neutral-900` explícito: o painel vive dentro de `data-lk-theme`, e
    // o tema do LiveKit pinta o texto de branco por herança. Sem isto, tudo que
    // não traz classe de cor própria — a começar pelo textarea — sai branco no
    // branco. Fixar a cor na raiz resolve para o que vier depois também.
    <div className="flex h-full flex-col rounded-2xl bg-white text-neutral-900">
      {alunos.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 p-2">
          {alunos.map((a) => (
            <button
              key={a.id}
              onClick={() => aoTrocarAluno(a.id)}
              title={a.nome}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                a.id === aluno.id
                  ? 'bg-violet-300 text-neutral-900'
                  : 'text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              <User className="h-3 w-3" /> {a.nome.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-neutral-200 p-2">
        {(
          [
            ['anotacoes', 'Anotações', NotebookPen],
            ['aluno', alunos.length > 1 ? 'Perfil' : aluno.nome.split(' ')[0], User],
          ] as const
        ).map(([chave, rotulo, Icone]) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
              aba === chave ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            <Icone className="h-3.5 w-3.5" /> {rotulo}
          </button>
        ))}
      </div>

      {/*
        `key` no aluno: trocar de pessoa TEM que remontar o miolo. Sem isso, o
        textarea da anotacao guardaria o texto do aluno anterior enquanto o
        servidor traz o do novo — e o debounce salvaria a anotacao de um na
        aula do outro.
      */}
      <div key={aluno.id} className="min-h-0 flex-1 overflow-y-auto p-4">
        {aba === 'anotacoes' ? (
          <Anotacoes alunoId={aluno.id} />
        ) : (
          <FichaDoAluno alunoId={aluno.id} alunoNome={aluno.nome} />
        )}
      </div>

      <LinkDaSala alunoId={turmaId ? null : aluno.id} turmaId={turmaId} nome={aluno.nome} />
    </div>
  )
}

/**
 * O link de entrada do aluno, ao alcance de dentro da sala.
 *
 * Ele já existe na ficha (`CartaoSala`), e é justamente por isso que faltava
 * aqui: o momento em que o professor precisa dele é o momento em que ele NÃO
 * pode sair da sala — está sozinho na chamada, esperando, e o aluno não
 * apareceu. Ter que abrir outra aba para copiar um link enquanto a aula já
 * começou é a fricção que a sala existe para tirar.
 *
 * Fica fora das abas, no rodapé do painel, porque não é nem anotação nem ficha
 * — é uma ação, e precisa estar visível qualquer que seja a aba aberta.
 *
 * Sem botão de gerar link: criar sala e trocar link são decisões da ficha, com
 * o aviso de que o link antigo morre (0013). No meio de uma aula isso seria um
 * clique de arrependimento.
 */
function LinkDaSala({
  alunoId,
  turmaId,
  nome,
}: {
  alunoId: string | null
  turmaId: string | null
  nome: string
}) {
  const { data: salaDoAluno } = useSala(alunoId ?? undefined)
  const { data: salaDaTurma } = useSalaDaTurma(turmaId ?? undefined)
  const [copiado, setCopiado] = useState(false)

  const sala = turmaId ? salaDaTurma : salaDoAluno
  const link = sala?.token ? linkDaSala(sala.token) : null
  const primeiroNome = turmaId ? 'a turma' : nome.split(' ')[0]

  if (!link) return null

  async function copiar() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="shrink-0 border-t border-neutral-200 p-3">
      <p className="text-[11px] font-bold text-neutral-500">Link de entrada {turmaId ? 'da turma' : `de ${primeiroNome}`}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {/* `readOnly` e não texto solto: assim o professor pode selecionar o
            link à mão quando a área de transferência do navegador estiver
            bloqueada — o que acontece em http sem TLS. */}
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate rounded-lg bg-neutral-100 px-2 py-1.5 text-[11px] text-neutral-600"
        />
        <button
          onClick={copiar}
          title="Copiar o link para mandar no WhatsApp"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-neutral-700"
        >
          {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

function Anotacoes({ alunoId }: { alunoId: string }) {
  const { data: aulas, isLoading } = useAulasDoAluno(alunoId)
  const atualizar = useAtualizarAula()
  const criar = useCriarAula()

  const aula = useMemo(() => aulaDeAgora(aulas), [aulas])

  const [texto, setTexto] = useState('')
  const [salvo, setSalvo] = useState(false)
  const aulaCarregada = useRef<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Só puxa do servidor quando MUDA de aula. Sincronizar a cada refetch
  // sobrescreveria o que o professor está digitando: `useAtualizarAula`
  // invalida `chavesAulas.todas`, então o próprio salvamento traria a resposta
  // de volta por cima do cursor.
  useEffect(() => {
    if (!aula || aulaCarregada.current === aula.id) return
    aulaCarregada.current = aula.id
    setTexto(aula.anotacao ?? '')
  }, [aula])

  useEffect(() => () => (temporizador.current ? clearTimeout(temporizador.current) : undefined), [])

  function escrever(valor: string) {
    setTexto(valor)
    setSalvo(false)
    if (!aula) return
    if (temporizador.current) clearTimeout(temporizador.current)
    // Um segundo parado = salvou. Sem botão: na aula ninguém lembra de clicar.
    temporizador.current = setTimeout(() => {
      atualizar.mutate(
        { aula, campos: { anotacao: valor.trim() || null } },
        { onSuccess: () => setSalvo(true) },
      )
    }, 1000)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (!aula) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center">
        <AlertTriangle className="mx-auto h-5 w-5 text-amber-500" />
        <p className="mt-2 text-sm font-bold text-neutral-700">Nenhuma aula por perto</p>
        <p className="mt-1 text-xs text-neutral-500">
          A anotação fica guardada dentro de uma aula, e não há nenhuma agendada nas próximas
          {' '}{JANELA_HORAS} horas. Registre esta aula para começar a anotar.
        </p>
        <button
          onClick={() =>
            criar.mutate({
              alunoId,
              dataHoraISO: new Date().toISOString(),
              duracaoMin: 60,
              status: 'realizada',
            })
          }
          disabled={criar.isPending}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {criar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Registrar aula de agora
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-neutral-500">
          Aula de{' '}
          {new Date(aula.data_hora).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        {atualizar.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
        ) : (
          salvo && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
              <Check className="h-3.5 w-3.5" /> salvo
            </span>
          )
        )}
      </div>

      <textarea
        value={texto}
        onChange={(e) => escrever(e.target.value)}
        placeholder="O que rolou nesta aula, o que revisar na próxima, erros que apareceram…"
        className="mt-2 min-h-48 flex-1 resize-none rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none ring-neutral-900 focus:ring-2"
      />

      {atualizar.error && (
        <p className="mt-2 text-xs font-medium text-rose-700">
          Não consegui salvar: {(atualizar.error as Error).message}
        </p>
      )}
    </div>
  )
}

function FichaDoAluno({ alunoId, alunoNome }: { alunoId: string; alunoNome: string }) {
  const { data: aluno } = useAluno(alunoId)
  const { data: historico } = useHistoricoDoAluno(alunoId)
  const { data: erros } = useErrosRecorrentes(alunoId)
  const [aberta, setAberta] = useState<string | null>(null)

  const feitas = (historico ?? []).filter((h) => h.concluidaEm)
  const ultimas = feitas.slice(0, 8)

  // A tarefa abre AQUI DENTRO, e não em /resultados/:id: navegar para outra
  // rota desmontaria o <LiveKitRoom> e derrubaria a chamada no meio da aula.
  if (aberta) return <DetalheDaTarefa atribuicaoId={aberta} aoVoltar={() => setAberta(null)} />

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-extrabold text-neutral-900">{alunoNome}</p>
        <p className="mt-0.5 text-xs font-medium text-neutral-500">
          {aluno?.nivel_cefr ? `Nível ${aluno.nivel_cefr}` : 'Nível não definido'} ·{' '}
          {feitas.length} {feitas.length === 1 ? 'tarefa feita' : 'tarefas feitas'}
        </p>
      </div>

      {aluno?.observacoes && (
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-400">Observações</p>
          <p className="mt-1.5 whitespace-pre-wrap rounded-2xl bg-neutral-100 px-3 py-2.5 text-xs text-neutral-600">
            {aluno.observacoes}
          </p>
        </div>
      )}

      {/* O que mais interessa numa aula ao vivo: onde ele erra. Vem antes do
          histórico porque é acionável agora, não depois. */}
      {erros && erros.length > 0 && (
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-400">
            Erros recorrentes
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {erros.slice(0, 5).map((e) => (
              <span
                key={e.habilidade}
                className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"
              >
                {e.habilidade} · {e.erros}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-400">Últimas tarefas</p>
        {ultimas.length === 0 ? (
          <p className="mt-1.5 text-xs text-neutral-400">Nenhuma tarefa concluída ainda.</p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {ultimas.map((h) => (
              <button
                key={h.atribuicaoId}
                onClick={() => setAberta(h.atribuicaoId)}
                className="flex w-full items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2 text-left transition hover:bg-neutral-200"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-neutral-700">
                  {h.atividadeTitulo}
                </span>
                {h.acertos !== null && h.total !== null && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${corDaNota(h.acertos, h.total)}`}
                  >
                    {h.acertos}/{h.total}
                  </span>
                )}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Questão a questão de uma tarefa, dentro do painel — o que o aluno respondeu
 * e o que era esperado. É a versão apertada de /resultados/:id: aqui cabem
 * 320px de largura e a pergunta é uma só ("onde ele errou?"), então fica o
 * enunciado, a resposta dada e, quando erra, a correta. Explicação, áudio de
 * pronúncia e padrão de erro ficam na página cheia, para depois da aula.
 */
function DetalheDaTarefa({ atribuicaoId, aoVoltar }: { atribuicaoId: string; aoVoltar: () => void }) {
  const { data, isLoading, error } = useResultadoAtribuicao(atribuicaoId)

  return (
    <div>
      <button
        onClick={aoVoltar}
        className="flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-900"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </button>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        </div>
      )}

      {error && <p className="mt-4 text-xs font-medium text-rose-700">Não consegui carregar esta tarefa.</p>}

      {data && (
        <>
          <div className="mt-3 flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-extrabold text-neutral-900">{data.atividadeTitulo}</p>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${corDaNota(data.acertos, data.total)}`}
            >
              {data.acertos}/{data.total}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {data.questoes.map((q) => (
              <div key={q.id} className="rounded-xl bg-neutral-100 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    {q.correta === null ? (
                      <Minus className="h-3.5 w-3.5 text-neutral-400" />
                    ) : q.correta ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-rose-600" />
                    )}
                  </span>
                  <p className="min-w-0 flex-1 text-xs font-semibold text-neutral-700">{q.enunciado}</p>
                </div>

                <div className="mt-1.5 pl-5.5 text-xs">
                  {q.correta === null ? (
                    <span className="text-neutral-400">sem resposta</span>
                  ) : q.correta ? (
                    <span className="text-neutral-500">{q.respostaDada}</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-rose-500 line-through">{q.respostaDada ?? '—'}</span>
                      <span className="text-neutral-300">→</span>
                      <span className="font-bold text-emerald-700">{q.respostaCorreta}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
