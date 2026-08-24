import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Eye, Loader2 } from 'lucide-react'
import { CorpoDaQuestao } from '@/features/tarefa/TarefaPage'
import { CORES_TIPO, ROTULO_TIPO, dividirEnunciado } from '@/types/questao'
import { supabase } from '@/lib/supabase'
import type { QuestaoRow } from '@/types/db'
import type { QuestaoTarefa } from '@/features/tarefa/tipos'
import { useAtividade, useQuestoesDaAtividade } from './api'

/**
 * /atividades/:id/preview — o professor vê a atividade COMO O ALUNO vê, antes
 * de enviar.
 *
 * Reusa <CorpoDaQuestao>, o mesmo componente da tela do aluno, em vez de
 * redesenhar a questão aqui: um preview com layout próprio mente na primeira
 * divergência, e é justamente para conferir que ele existe.
 *
 * É interativo de propósito — o professor pode responder e ver o feedback,
 * que é como se percebe alternativa ambígua ou explicação que não ensina.
 * Nada é gravado: não há atribuição nem aluno por trás desta tela.
 */
export function PreviewAtividadePage() {
  const { id } = useParams<{ id: string }>()
  const { data: atividade } = useAtividade(id)
  const { data: questoes } = useQuestoesDaAtividade(id)
  const [indice, setIndice] = useState(0)

  if (!questoes || !atividade) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (questoes.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="font-bold text-neutral-800">Esta atividade ainda não tem questões.</p>
        <Link to={`/atividades/${id}`} className="mt-3 inline-block text-sm font-bold text-violet-700">
          Voltar para a atividade
        </Link>
      </div>
    )
  }

  const questao = questoes[indice]

  return (
    <div className="pb-10">
      <div className="mb-5 flex items-center gap-3">
        <Link
          to={`/atividades/${id}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-neutral-500"
          title="Voltar para a atividade"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold text-neutral-400">
            <Eye className="h-3.5 w-3.5" /> Pré-visualização
          </p>
          <h1 className="truncate text-lg font-extrabold text-neutral-900">{atividade.titulo}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <ListaDeQuestoes questoes={questoes} indice={indice} aoEscolher={setIndice} />

        <div className="min-w-0 flex-1">
          {/* Fundo areia e coluna estreita: a mesma moldura da tela do aluno,
              para o professor julgar o que ele vai de fato ver no celular. */}
          <div className="rounded-3xl bg-areia p-5 sm:p-8">
            <div className="mx-auto max-w-sm">
              <p className="mb-1 text-xs font-bold text-neutral-400">
                Questão {indice + 1} de {questoes.length}
              </p>
              <QuestaoInterativa key={questao.id} linha={questao} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              onClick={() => setIndice((i) => Math.max(0, i - 1))}
              disabled={indice === 0}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-neutral-700 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => setIndice((i) => Math.min(questoes.length - 1, i + 1))}
              disabled={indice === questoes.length - 1}
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Menu lateral — vira uma faixa rolável no celular, onde não cabe coluna. */
function ListaDeQuestoes({
  questoes,
  indice,
  aoEscolher,
}: {
  questoes: { id: string; tipo: QuestaoTarefa['tipo']; instrucao: string | null; enunciado: string }[]
  indice: number
  aoEscolher: (i: number) => void
}) {
  // A lista rola DENTRO de si mesma: com 15 questões ela empurrava a página
  // inteira, e o professor perdia a questão de vista ao procurar outra.
  return (
    <nav className="flex shrink-0 gap-2 overflow-x-auto pb-2 lg:max-h-[calc(100dvh-11rem)] lg:w-64 lg:flex-col lg:overflow-y-auto lg:pb-0 lg:pr-1">
      {questoes.map((q, i) => {
        const { frase, instrucao } = dividirEnunciado(q)
        const resumo = frase || instrucao || 'Questão'
        const atual = i === indice
        return (
          <button
            key={q.id}
            onClick={() => aoEscolher(i)}
            className={`flex w-56 shrink-0 items-start gap-2.5 rounded-2xl px-3.5 py-3 text-left transition lg:w-full ${
              atual ? 'bg-neutral-900' : 'bg-white hover:bg-neutral-50'
            }`}
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-extrabold ${
                atual ? 'bg-amber-300 text-neutral-900' : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`line-clamp-2 text-xs font-bold ${atual ? 'text-white' : 'text-neutral-700'}`}
              >
                {resumo}
              </span>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  atual ? 'bg-white/15 text-white' : CORES_TIPO[q.tipo]
                }`}
              >
                {ROTULO_TIPO[q.tipo]}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}

/**
 * Uma questão respondível. O estado de feedback vive aqui e é jogado fora ao
 * trocar de questão (a `key` no pai remonta), então o professor pode testar a
 * mesma questão quantas vezes quiser.
 */
function QuestaoInterativa({ linha }: { linha: QuestaoRow }) {
  const [feedback, setFeedback] = useState<Parameters<typeof CorpoDaQuestao>[0]['feedback']>(null)
  const audioUrl = useAudioAssinado(linha.audio_path)

  // A linha do banco vira o formato que o aluno recebe. Os campos de progresso
  // não existem aqui: no preview ninguém respondeu nada, é sempre uma questão
  // em branco.
  const questao: QuestaoTarefa = {
    id: linha.id,
    ordem: linha.ordem,
    tipo: linha.tipo,
    instrucao: linha.instrucao,
    enunciado: linha.enunciado,
    opcoes: linha.opcoes,
    pares: linha.pares,
    resposta_correta: linha.resposta_correta,
    respostas_aceitas: linha.respostas_aceitas,
    explicacao: linha.explicacao,
    audio_url: audioUrl,
    respondida: false,
    resposta_dada: null,
    correta: null,
  }

  function responder(valor: string) {
    // A correção real vive em `corrigir()`; aqui basta comparar com o gabarito
    // para o professor ver os dois estados da tela.
    setFeedback({
      correta: valor === questao.resposta_correta,
      resposta_correta: questao.resposta_correta,
      pares_corretos: questao.pares,
      explicacao: questao.explicacao,
    })
  }

  return (
    <div key={questao.id}>
      <CorpoDaQuestao
        questao={questao}
        feedback={feedback}
        aoResponder={responder}
        aoFalar={async () => ({ ouviu: false })}
        aoLimparFeedback={() => setFeedback(null)}
      />

      {feedback && (
        <div className="mt-4 rounded-2xl bg-white px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-neutral-900">
            <Check className="h-4 w-4 text-emerald-600" />
            Resposta certa: {questao.resposta_correta || '—'}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{questao.explicacao}</p>
          <button
            onClick={() => setFeedback(null)}
            className="mt-3 text-xs font-bold text-violet-700"
          >
            Testar de novo
          </button>
        </div>
      )}
    </div>
  )
}


/**
 * URL assinada do áudio de `ordenar_audio` (bucket privado `audio-questoes`).
 * Sem ela o preview cairia no fallback de revelar o texto, e o professor não
 * conseguiria conferir justamente o que a questão tem de diferente: o som.
 */
function useAudioAssinado(caminho: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!caminho) return setUrl(null)
    let cancelado = false
    supabase.storage
      .from('audio-questoes')
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => {
        if (!cancelado) setUrl(data?.signedUrl ?? null)
      })
    return () => {
      cancelado = true
    }
  }, [caminho])

  return url
}
