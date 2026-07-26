import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2, Pencil, Send } from 'lucide-react'
import { useAtividade, useQuestoesDaAtividade, useEnviosDaAtividade } from './api'
import { EnvioModal } from './EnvioModal'
import { EtiquetaTipo, QuestaoLeitura } from './QuestaoLeitura'
import { ROTULO_HABILIDADE } from '@/types/questao'
import type { QuestaoRow } from '@/types/db'

export function AtividadeDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const { data: atividade, isLoading: carregandoAtividade } = useAtividade(id)
  const { data: questoes, isLoading: carregandoQuestoes } = useQuestoesDaAtividade(id)
  const { data: envios } = useEnviosDaAtividade(id)
  const [modalAberto, setModalAberto] = useState(false)

  if (carregandoAtividade || carregandoQuestoes) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (!atividade) {
    return (
      <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Atividade não encontrada.{' '}
        <Link to="/atividades" className="font-bold underline">
          Voltar
        </Link>
      </p>
    )
  }

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-neutral-400">
        <Link to="/atividades" className="hover:text-neutral-600">
          Atividades
        </Link>{' '}
        / <span className="text-neutral-700">{atividade.titulo}</span>
      </p>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{atividade.titulo}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-violet-200 px-2.5 py-1 text-xs font-extrabold text-violet-900">
              {atividade.nivel}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-neutral-600">
              {questoes?.length ?? 0} {questoes?.length === 1 ? 'questão' : 'questões'}
            </span>
            {atividade.habilidades.map((h) => (
              <span key={h} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-neutral-600">
                {ROTULO_HABILIDADE[h as keyof typeof ROTULO_HABILIDADE] ?? h}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to={`/atividades/${atividade.id}/editar`}
            className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm font-bold text-neutral-700"
          >
            <Pencil className="h-4 w-4" /> Editar
          </Link>
          <button
            onClick={() => setModalAberto(true)}
            className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-extrabold text-white"
          >
            <Send className="h-4 w-4" /> Enviar para aluno
          </button>
        </div>
      </div>

      {/* Questões à esquerda, envios numa coluna estreita à direita: a lista de
          alunos é curta e antes empurrava tudo para baixo de uma página inteira
          de questões. `items-start` para a coluna da direita não esticar. */}
      <div className="mt-5 flex flex-col items-start gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-3 self-stretch">
          {questoes?.map((q, i) => <CartaoQuestao key={q.id} numero={i + 1} questao={q} />)}
        </div>

        {envios && envios.length > 0 && (
          <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:w-72">
            <h2 className="mb-2 text-sm font-bold text-neutral-900">
              Quem já recebeu <span className="font-medium text-neutral-400">· {envios.length}</span>
            </h2>
            <div className="divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
              {envios.map((e) => {
                const conteudo = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-neutral-800">{e.aluno_nome}</span>
                      {e.tentativa > 1 && (
                        <span className="text-xs font-medium text-neutral-400">tentativa {e.tentativa}</span>
                      )}
                    </span>
                    {e.concluida_em ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800">
                        {e.acertos}/{e.total}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">
                        pendente
                      </span>
                    )}
                  </>
                )
                return e.concluida_em ? (
                  <Link
                    key={e.id}
                    to={`/resultados/${e.id}`}
                    className="flex items-center gap-2 px-4 py-3 text-sm transition hover:bg-neutral-50"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <div key={e.id} className="flex items-center gap-2 px-4 py-3 text-sm">
                    {conteudo}
                  </div>
                )
              })}
            </div>
          </aside>
        )}
      </div>

      {modalAberto && (
        <EnvioModal atividadeId={atividade.id} atividadeTitulo={atividade.titulo} aoFechar={() => setModalAberto(false)} />
      )}
    </div>
  )
}

function CartaoQuestao({ numero, questao }: { numero: number; questao: QuestaoRow }) {
  return (
    <div className="rounded-3xl bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-bold text-neutral-400">Q{numero}</span>
        <EtiquetaTipo tipo={questao.tipo} />
      </div>
      <QuestaoLeitura valor={questao} />
    </div>
  )
}
