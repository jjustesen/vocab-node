import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
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
import type { Aula } from '@/types/db'

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

/** Janela em que uma aula agendada conta como "a aula de agora". */
const JANELA_HORAS = 12

type AbaPainel = 'anotacoes' | 'aluno'

export function PainelDaAula({ alunoId, alunoNome }: { alunoId: string; alunoNome: string }) {
  const [aba, setAba] = useState<AbaPainel>('anotacoes')

  return (
    // `text-neutral-900` explícito: o painel vive dentro de `data-lk-theme`, e
    // o tema do LiveKit pinta o texto de branco por herança. Sem isto, tudo que
    // não traz classe de cor própria — a começar pelo textarea — sai branco no
    // branco. Fixar a cor na raiz resolve para o que vier depois também.
    <div className="flex h-full flex-col rounded-2xl bg-white text-neutral-900">
      <div className="flex gap-1 border-b border-neutral-200 p-2">
        {(
          [
            ['anotacoes', 'Anotações', NotebookPen],
            ['aluno', alunoNome.split(' ')[0], User],
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {aba === 'anotacoes' ? (
          <Anotacoes alunoId={alunoId} />
        ) : (
          <FichaDoAluno alunoId={alunoId} alunoNome={alunoNome} />
        )}
      </div>
    </div>
  )
}

/**
 * Qual aula recebe a anotação: a agendada mais próxima de agora, dentro de
 * ±12h. Fora dessa janela devolve null de propósito — escrever no campo não
 * pode significar carimbar silenciosamente a aula do mês passado.
 */
function aulaDeAgora(aulas: Aula[] | undefined): Aula | null {
  if (!aulas || aulas.length === 0) return null
  const agora = Date.now()
  const limite = JANELA_HORAS * 60 * 60 * 1000

  let melhor: Aula | null = null
  let menorDistancia = Infinity
  for (const aula of aulas) {
    if (aula.status === 'cancelada') continue
    const distancia = Math.abs(new Date(aula.data_hora).getTime() - agora)
    if (distancia <= limite && distancia < menorDistancia) {
      menorDistancia = distancia
      melhor = aula
    }
  }
  return melhor
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
