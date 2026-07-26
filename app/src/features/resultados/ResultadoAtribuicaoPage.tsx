import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Flame,
  Loader2,
  Pencil,
  Target,
  X,
} from 'lucide-react'
import { useResultadoAtribuicao, type QuestaoResultado, type ResultadoAtribuicao } from './api'
import { useAluno, useAtualizarAluno } from '@/features/alunos/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { ROTULO_TIPO } from '@/types/questao'

function formatarTempo(ms: number | null): string {
  if (ms === null) return '—'
  const segundosTotais = Math.round(ms / 1000)
  const min = Math.floor(segundosTotais / 60)
  const seg = segundosTotais % 60
  return min > 0 ? `${min} min` : `${seg}s`
}

function formatarConclusao(iso: string | null): string {
  if (!iso) return 'ainda não concluída'
  const data = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(ontem.getDate() - 1)
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmoDia(data, hoje)) return `Concluída hoje às ${hora}`
  if (mesmoDia(data, ontem)) return `Concluída ontem às ${hora}`
  return `Concluída em ${data.toLocaleDateString('pt-BR')} às ${hora}`
}

/** Maior sequência de acertos seguidos, na ordem em que o aluno respondeu. */
function melhorSequencia(questoes: QuestaoResultado[]): number {
  let melhor = 0
  let atual = 0
  for (const q of questoes) {
    if (q.correta) {
      atual += 1
      melhor = Math.max(melhor, atual)
    } else {
      atual = 0
    }
  }
  return melhor
}

export function ResultadoAtribuicaoPage() {
  const { atribuicaoId } = useParams<{ atribuicaoId: string }>()
  const { data: resultado, isLoading, error } = useResultadoAtribuicao(atribuicaoId)

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (error || !resultado) {
    return (
      <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Resultado não encontrado.{' '}
        <Link to="/atividades" className="font-bold underline">
          Voltar
        </Link>
      </p>
    )
  }

  const percentual = resultado.total > 0 ? Math.round((resultado.acertos / resultado.total) * 100) : 0
  const erradas = resultado.questoes.filter((q) => q.correta === false)
  const sequencia = melhorSequencia(resultado.questoes)

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-neutral-400">
        <Link to={`/atividades/${resultado.atividadeId}`} className="hover:text-neutral-600">
          {resultado.atividadeTitulo}
        </Link>{' '}
        / <span className="text-neutral-700">{resultado.alunoNome}</span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-extrabold ${corDoAvatar(resultado.alunoId)}`}
          >
            {inicial(resultado.alunoNome)}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold">
              {resultado.atividadeTitulo} — <Link to={`/alunos/${resultado.alunoId}`} className="hover:underline">{resultado.alunoNome}</Link>
            </h1>
            <p className="text-sm text-neutral-500">{formatarConclusao(resultado.concluidaEm)}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-3xl px-5 py-3 text-xl font-extrabold ${
            percentual >= 70
              ? 'bg-emerald-100 text-emerald-900'
              : percentual >= 50
                ? 'bg-amber-100 text-amber-900'
                : 'bg-rose-100 text-rose-800'
          }`}
        >
          {resultado.acertos}/{resultado.total}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Tile Icone={Clock} valor={formatarTempo(resultado.tempoTotalMs)} rotulo="tempo total" />
        <Tile Icone={Target} valor={`${resultado.tentativa}ª`} rotulo="tentativa" />
        <Tile
          Icone={Flame}
          valor={String(sequencia)}
          rotulo="melhor sequência"
          cor="bg-amber-100 text-amber-900"
          corIcone="text-amber-600"
        />
      </div>

      <PadraoDeErro resultado={resultado} erradas={erradas} />

      <ListaDeQuestoes questoes={resultado.questoes} erradas={erradas} />

      <AnotarProximaAula alunoId={resultado.alunoId} alunoNome={resultado.alunoNome} />
    </div>
  )
}

function Tile({
  Icone,
  valor,
  rotulo,
  cor = 'bg-white text-neutral-900',
  corIcone = 'text-neutral-400',
}: {
  Icone: typeof Clock
  valor: string
  rotulo: string
  cor?: string
  corIcone?: string
}) {
  return (
    <div className={`min-w-28 flex-1 rounded-3xl px-5 py-4 sm:flex-none ${cor}`}>
      <Icone className={`h-4 w-4 ${corIcone}`} />
      <p className="mt-1.5 text-2xl font-extrabold">{valor}</p>
      <p className="text-xs font-medium opacity-60">{rotulo}</p>
    </div>
  )
}

/**
 * RF-92/93. O mockup cita o tema gramatical ("past simple de verbos
 * irregulares"), mas o banco não guarda tema por questão — só a habilidade,
 * que é da atividade inteira. Então o card usa o que dá para afirmar de
 * verdade: o tipo de questão que concentrou os erros e a comparação com a
 * tarefa anterior do aluno quando elas treinam a mesma habilidade.
 */
function PadraoDeErro({
  resultado,
  erradas,
}: {
  resultado: ResultadoAtribuicao
  erradas: QuestaoResultado[]
}) {
  if (erradas.length === 0) {
    return (
      <div className="mt-4 flex gap-2 rounded-3xl bg-emerald-100/70 px-5 py-4">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p className="text-sm text-emerald-900">
          <span className="font-bold">Sem erros nesta tarefa.</span> Vale subir a dificuldade na próxima.
        </p>
      </div>
    )
  }

  const porTipo = new Map<string, number>()
  for (const q of erradas) porTipo.set(q.tipo, (porTipo.get(q.tipo) ?? 0) + 1)
  const [tipoDominante, qtdDominante] = [...porTipo.entries()].sort((a, b) => b[1] - a[1])[0]

  const anterior = resultado.anterior
  const repeteHabilidade = anterior && anterior.habilidadesEmComum.length > 0

  return (
    <div className="mt-4 flex gap-2 rounded-3xl bg-amber-100/70 px-5 py-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <p className="text-sm text-amber-900">
        <span className="font-bold">Padrão de erro: </span>
        {erradas.length === 1 ? 'a questão errada é' : `das ${erradas.length} questões erradas, ${qtdDominante} ${qtdDominante === 1 ? 'é' : 'são'}`}{' '}
        de <span className="font-bold">{ROTULO_TIPO[tipoDominante as keyof typeof ROTULO_TIPO]}</span>.
        {repeteHabilidade && (
          <>
            {' '}
            Mesma habilidade da tarefa anterior (
            <Link to={`/resultados/${anterior.atribuicaoId}`} className="font-bold underline">
              {anterior.acertos}/{anterior.total}
            </Link>
            ).
          </>
        )}
      </p>
    </div>
  )
}

/**
 * Colapsada, a lista mostra só o que precisa de atenção (erros e não
 * respondidas) — numa tarefa de 10 questões, o professor não quer rolar 8
 * acertos para achar os 2 erros. O botão abre a lista inteira.
 */
function ListaDeQuestoes({
  questoes,
  erradas,
}: {
  questoes: QuestaoResultado[]
  erradas: QuestaoResultado[]
}) {
  const problemas = questoes.filter((q) => q.correta !== true)
  const [mostrarTodas, setMostrarTodas] = useState(problemas.length === 0)
  const visiveis = mostrarTodas ? questoes : problemas

  return (
    <div className="mt-4 overflow-hidden rounded-3xl bg-white">
      <div className="divide-y divide-neutral-100">
        {visiveis.map((q) => (
          <LinhaQuestao key={q.id} numero={questoes.indexOf(q) + 1} questao={q} />
        ))}
      </div>

      {problemas.length > 0 && (
        <button
          onClick={() => setMostrarTodas((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-neutral-100 py-3 text-xs font-bold text-neutral-500 transition hover:bg-neutral-50"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition ${mostrarTodas ? 'rotate-180' : ''}`} />
          {mostrarTodas
            ? `mostrar só ${erradas.length === 1 ? 'o erro' : 'os erros'}`
            : `ver as ${questoes.length} questões`}
        </button>
      )}
    </div>
  )
}

function LinhaQuestao({ numero, questao }: { numero: number; questao: QuestaoResultado }) {
  const [aberta, setAberta] = useState(false)

  return (
    <div>
      <button
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-neutral-50"
      >
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
            questao.correta === null
              ? 'bg-neutral-100 text-neutral-400'
              : questao.correta
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-600'
          }`}
        >
          {questao.correta ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>

        <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">
          <span className="font-bold text-neutral-400">Q{numero}</span> · {questao.enunciado}
        </span>

        <ResumoResposta questao={questao} />
      </button>

      {aberta && (
        <div className="border-t border-neutral-100 bg-neutral-50/60 px-5 py-4">
          <p className="text-sm font-medium text-neutral-900">{questao.enunciado}</p>
          <CorpoResposta questao={questao} />
          {questao.explicacao && (
            <p className="mt-3 rounded-2xl bg-amber-100/70 px-4 py-3 text-sm text-amber-900">
              <span className="font-bold">Explicação: </span>
              {questao.explicacao}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** A "resposta" resumida à direita da linha: certa em cinza, errada riscada → certa. */
function ResumoResposta({ questao }: { questao: QuestaoResultado }) {
  if (questao.tipo === 'ligar_colunas') {
    let escolhas: unknown[] = []
    try {
      escolhas = questao.respostaDada ? JSON.parse(questao.respostaDada) : []
    } catch {
      escolhas = []
    }
    const pares = questao.pares ?? []
    const certos = pares.filter((p, i) => escolhas[i] === p.direita).length
    return (
      <span className="hidden shrink-0 text-xs font-medium text-neutral-400 sm:inline">
        {certos}/{pares.length} pares
      </span>
    )
  }

  if (questao.correta === null) {
    return <span className="hidden shrink-0 text-xs font-medium text-neutral-400 sm:inline">sem resposta</span>
  }

  if (questao.correta) {
    return (
      <span className="hidden max-w-40 shrink-0 truncate text-xs font-medium text-neutral-400 sm:inline">
        {questao.respostaDada}
      </span>
    )
  }

  return (
    <span className="hidden shrink-0 items-center gap-1.5 text-xs sm:flex">
      <span className="max-w-28 truncate text-rose-500 line-through">{questao.respostaDada ?? '—'}</span>
      <span className="text-neutral-300">→</span>
      <span className="max-w-28 truncate font-bold text-emerald-700">{questao.respostaCorreta}</span>
    </span>
  )
}

/** RF-94: fecha o ciclo — o que o resultado revelou vira anotação na ficha. */
function AnotarProximaAula({ alunoId, alunoNome }: { alunoId: string; alunoNome: string }) {
  const { data: aluno } = useAluno(alunoId)
  const atualizar = useAtualizarAluno()
  const [texto, setTexto] = useState('')
  const [salvo, setSalvo] = useState(false)

  async function salvar() {
    if (!texto.trim() || !aluno) return
    const carimbo = new Date().toLocaleDateString('pt-BR')
    // Anexa ao que já existe em vez de substituir — a ficha é um histórico.
    const novo = [aluno.observacoes?.trim(), `[${carimbo}] ${texto.trim()}`].filter(Boolean).join('\n\n')
    await atualizar.mutateAsync({ id: alunoId, campos: { observacoes: novo } })
    setTexto('')
    setSalvo(true)
    setTimeout(() => setSalvo(false), 3000)
  }

  return (
    <div className="mt-4 rounded-3xl bg-white p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
        <Pencil className="h-4 w-4" /> Anotar para a próxima aula
      </h2>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        placeholder="Ex.: revisar verbos irregulares — montar drill rápido no começo da aula."
        className="mt-2.5 w-full resize-none rounded-2xl bg-neutral-100 px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={salvar}
          disabled={!texto.trim() || atualizar.isPending}
          className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {atualizar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar na ficha {alunoNome.split(' ')[0] && `de ${alunoNome.split(' ')[0]}`}
        </button>
        {salvo && (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5" /> salvo nas observações
          </span>
        )}
      </div>
    </div>
  )
}

function CorpoResposta({ questao }: { questao: QuestaoResultado }) {
  if (questao.tipo === 'multipla_escolha' || questao.tipo === 'verdadeiro_falso') {
    return (
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {questao.opcoes?.map((o) => {
          const eDada = o === questao.respostaDada
          const eCorreta = o === questao.respostaCorreta
          const classe = eDada
            ? questao.correta
              ? 'bg-emerald-100 font-medium text-emerald-900'
              : 'bg-rose-100 font-medium text-rose-800'
            : eCorreta
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-white text-neutral-500'
          return (
            <div key={o} className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 ${classe}`}>
              <span className="min-w-0 flex-1 break-words">{o}</span>
              {eCorreta && <Check className="h-4 w-4 shrink-0 text-emerald-700" />}
              {eDada && !eCorreta && <span className="shrink-0 text-xs">resposta do aluno</span>}
            </div>
          )
        })}
      </div>
    )
  }

  if (questao.tipo === 'ligar_colunas') {
    let escolhas: unknown[] = []
    try {
      escolhas = questao.respostaDada ? JSON.parse(questao.respostaDada) : []
    } catch {
      escolhas = []
    }
    return (
      <div className="mt-3 space-y-1.5 text-sm">
        {questao.pares?.map((p, i) => {
          const escolhida = typeof escolhas[i] === 'string' ? (escolhas[i] as string) : null
          const acertouPar = escolhida !== null && escolhida === p.direita
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-2/5 shrink-0 truncate rounded-xl bg-white px-3 py-2 font-medium text-neutral-700">
                {p.esquerda}
              </span>
              <span className="shrink-0 text-neutral-300">→</span>
              <span
                className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2 ${
                  acertouPar
                    ? 'bg-emerald-100 text-emerald-800'
                    : escolhida
                      ? 'bg-rose-100 text-rose-700 line-through'
                      : 'bg-white text-neutral-400'
                }`}
              >
                {escolhida ?? '(sem resposta)'}
              </span>
              {!acertouPar && (
                <span className="shrink-0 text-xs font-bold text-emerald-700">certo: {p.direita}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // lacuna, ordenar_palavras, resposta_curta — resposta em texto livre
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span
        className={`rounded-2xl px-4 py-2.5 font-medium ${
          questao.correta ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-800'
        }`}
      >
        {questao.respostaDada ?? '(sem resposta)'}
      </span>
      {!questao.correta && (
        <>
          <span className="text-neutral-300">→</span>
          <span className="rounded-2xl bg-emerald-100 px-4 py-2.5 font-medium text-emerald-900">
            {questao.respostaCorreta}
          </span>
        </>
      )}
    </div>
  )
}
