import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import {
  useAtividade,
  useAtividadeEditavel,
  useAtualizarAtividadeCompleta,
  useAtualizarMetadadosAtividade,
  useQuestoesDaAtividade,
} from './api'
import { AtividadeForm } from './AtividadeForm'
import { questaoRowParaRascunho } from './questaoRascunho'
import { NIVEIS, HABILIDADES } from '@/types/questao'
import type { NivelCefr } from '@/types/db'

export function EditarAtividadePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: atividade, isLoading: carregandoAtividade } = useAtividade(id)
  const { data: questoes, isLoading: carregandoQuestoes } = useQuestoesDaAtividade(id)
  const { data: editavel, isLoading: carregandoEditavel } = useAtividadeEditavel(id)
  const atualizarCompleta = useAtualizarAtividadeCompleta()

  if (carregandoAtividade || carregandoQuestoes || carregandoEditavel) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (!atividade || !questoes) {
    return (
      <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Atividade não encontrada.{' '}
        <Link to="/atividades" className="font-bold underline">
          Voltar
        </Link>
      </p>
    )
  }

  if (!editavel) {
    return <FormMetadadosTravado atividade={atividade} />
  }

  return (
    <AtividadeForm
      tituloPagina="Editar atividade"
      rotuloBotao="Salvar alterações"
      valoresIniciais={{
        titulo: atividade.titulo,
        nivel: atividade.nivel,
        habilidades: atividade.habilidades,
        questoes: questoes.map(questaoRowParaRascunho),
      }}
      aoSalvar={async (dados) => {
        await atualizarCompleta.mutateAsync({ id: atividade.id, ...dados })
        navigate(`/atividades/${atividade.id}`)
      }}
    />
  )
}

/**
 * Atividade já tem resposta registrada — as questões ficam travadas (ver
 * comentário de useAtividadeEditavel em api.ts). Só título/nível/habilidades
 * continuam editáveis.
 */
function FormMetadadosTravado({
  atividade,
}: {
  atividade: { id: string; titulo: string; nivel: NivelCefr; habilidades: string[] }
}) {
  const navigate = useNavigate()
  const atualizar = useAtualizarMetadadosAtividade()

  const [titulo, setTitulo] = useState(atividade.titulo)
  const [nivel, setNivel] = useState<NivelCefr>(atividade.nivel)
  const [habilidades, setHabilidades] = useState<string[]>(atividade.habilidades)
  const [erro, setErro] = useState<string | null>(null)

  function alternarHabilidade(h: string) {
    setHabilidades((atual) => (atual.includes(h) ? atual.filter((x) => x !== h) : [...atual, h]))
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    if (!titulo.trim()) return setErro('Dê um título para a atividade.')
    try {
      await atualizar.mutateAsync({ id: atividade.id, titulo: titulo.trim(), nivel, habilidades })
      navigate(`/atividades/${atividade.id}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <form onSubmit={salvar}>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Editar atividade</h1>
        <button
          type="submit"
          disabled={atualizar.isPending}
          className="flex shrink-0 items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {atualizar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar alterações
        </button>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-xs">
          Esta atividade já tem respostas de aluno registradas — as questões ficaram travadas para não
          bagunçar o histórico de quem já fez. Para mudar as questões, crie uma atividade nova (duplicar
          está na lista de próximos passos).
        </p>
      </div>

      {erro && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</p>
      )}

      <div className="mt-5 rounded-3xl bg-white p-5">
        <label className="block">
          <span className="text-xs font-bold text-neutral-600">Título</span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <span className="text-xs font-bold text-neutral-600">Nível</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {NIVEIS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNivel(n)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                    nivel === n ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-500'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-600">Habilidades</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {HABILIDADES.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => alternarHabilidade(h)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    habilidades.includes(h)
                      ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border border-neutral-300 text-neutral-500'
                  }`}
                >
                  {habilidades.includes(h) ? '✓ ' : ''}
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
