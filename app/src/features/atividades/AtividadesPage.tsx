import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BookOpen,
  Loader2,
  Milestone,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
} from 'lucide-react'
import { BotaoNovaAtividade } from './BotaoNovaAtividade'
import { EnvioModal } from './EnvioModal'
import { useAtividades } from './api'
import { CORES_NIVEL, visualDaHabilidade } from './visual-atividade'
import { PainelTrilhas } from '@/features/trilhas/PainelTrilhas'
import { useTrilhas } from '@/features/trilhas/api'
import { Chip } from '@/components/Chip'
import { ROTULO_HABILIDADE } from '@/types/questao'
import type { AtividadeComEnvio } from './api'

const GRUPOS_NIVEL = [
  { rotulo: 'Todos os níveis', niveis: [] as string[] },
  { rotulo: 'A1–A2', niveis: ['A1', 'A2'] },
  { rotulo: 'B1–B2', niveis: ['B1', 'B2'] },
  { rotulo: 'C1', niveis: ['C1'] },
]

/**
 * Biblioteca do professor. Trilhas é uma aba daqui, não um item de menu à
 * parte (mockup P11): uma trilha é uma sequência de atividades que já existem,
 * não um tipo de conteúdo separado. A aba vem da rota (/trilhas) para o
 * endereço continuar compartilhável.
 */
export function AtividadesPage() {
  const naAbaTrilhas = useLocation().pathname === '/trilhas'
  const { data: atividades, isLoading, error } = useAtividades()
  const { data: trilhas } = useTrilhas()
  const [busca, setBusca] = useState('')
  const [grupoNivel, setGrupoNivel] = useState(0)
  const [soRascunhos, setSoRascunhos] = useState(false)
  const [modalTrilha, setModalTrilha] = useState(false)

  // "Rascunho" aqui é a atividade que ainda não foi enviada a ninguém — e não
  // `atividades.status`, que existe no banco mas é cosmético (nenhuma policy
  // ou regra depende dele, e o RF-71 fala em "salvar rascunho e retomar",
  // nunca em publicar). O que o professor quer ver é o que ficou pela metade.
  const rascunhos = atividades?.filter((a) => !a.enviada) ?? []

  const filtradas = useMemo(() => {
    if (!atividades) return []
    const termo = busca.trim().toLowerCase()
    const niveis = GRUPOS_NIVEL[grupoNivel].niveis
    return atividades.filter((a) => {
      if (soRascunhos && a.enviada) return false
      const casaNivel = niveis.length === 0 || niveis.includes(a.nivel)
      const casaBusca =
        !termo ||
        a.titulo.toLowerCase().includes(termo) ||
        a.habilidades.some((h) => h.toLowerCase().includes(termo))
      return casaNivel && casaBusca
    })
  }, [atividades, busca, grupoNivel, soRascunhos])

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Atividades</h1>
        {naAbaTrilhas ? (
          <button
            onClick={() => setModalTrilha(true)}
            className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Nova trilha
          </button>
        ) : (
          <BotaoNovaAtividade />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 text-sm">
        <AbaBiblioteca
          ativa={!naAbaTrilhas && !soRascunhos}
          para="/atividades"
          aoClicar={() => setSoRascunhos(false)}
          rotulo="Minhas atividades"
          contagem={atividades?.length ?? 0}
        />
        <AbaBiblioteca
          ativa={!naAbaTrilhas && soRascunhos}
          para="/atividades"
          aoClicar={() => setSoRascunhos(true)}
          rotulo="Rascunhos"
          contagem={rascunhos.length}
        />
        <AbaBiblioteca
          ativa={naAbaTrilhas}
          para="/trilhas"
          rotulo="Trilhas"
          contagem={trilhas?.length ?? 0}
          Icone={Milestone}
        />
      </div>

      {naAbaTrilhas && (
        <PainelTrilhas modalAberto={modalTrilha} aoFecharModal={() => setModalTrilha(false)} />
      )}

      {!naAbaTrilhas && atividades && atividades.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título ou tema..."
              className="w-full rounded-full bg-white py-2.5 pl-11 pr-4 text-sm outline-none ring-neutral-900 focus:ring-2"
            />
          </div>
          {GRUPOS_NIVEL.map((g, i) => (
            <Chip key={g.rotulo} ativo={grupoNivel === i} aoClicar={() => setGrupoNivel(i)}>
              {g.rotulo}
            </Chip>
          ))}
        </div>
      )}

      {!naAbaTrilhas && isLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      {!naAbaTrilhas && error && (
        <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não consegui carregar as atividades: {(error as Error).message}
        </p>
      )}

      {!naAbaTrilhas && atividades && atividades.length === 0 && (
        <div className="mt-4 grid place-items-center rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-neutral-400">
            <BookOpen className="h-5 w-5" />
          </span>
          <p className="mt-3 font-bold text-neutral-700">Nenhuma atividade ainda</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">
            Monte a primeira atividade com as questões que você já usa em aula.
          </p>
          <Link
            to="/atividades/nova"
            className="mt-5 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white"
          >
            Criar atividade
          </Link>
        </div>
      )}

      {!naAbaTrilhas && atividades && atividades.length > 0 && filtradas.length === 0 && (
        <p className="mt-4 rounded-3xl bg-white px-5 py-8 text-center text-sm text-neutral-400">
          {soRascunhos && rascunhos.length === 0
            ? 'Nenhum rascunho — todas as suas atividades já foram enviadas.'
            : 'Nenhuma atividade com esse filtro.'}
        </p>
      )}

      {!naAbaTrilhas && filtradas.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((a) => (
            <CartaoAtividade key={a.id} atividade={a} />
          ))}
          <Link
            to="/atividades/gerar"
            className="grid min-h-44 place-items-center rounded-3xl border-2 border-dashed border-violet-300 p-5 text-center transition hover:border-violet-400 hover:bg-violet-50/40"
          >
            <div>
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white text-violet-600">
                <Sparkles className="h-5 w-5" />
              </span>
              <p className="mt-2 text-sm font-bold text-neutral-700">Gerar nova atividade</p>
              <p className="mt-0.5 text-xs text-neutral-400">a partir de um material</p>
            </div>
          </Link>
        </div>
      )}
    </div>
  )
}

/** Aba da biblioteca. É um link, não um botão: cada aba tem endereço próprio. */
function AbaBiblioteca({
  ativa,
  para,
  aoClicar,
  rotulo,
  contagem,
  Icone,
}: {
  ativa: boolean
  para: string
  aoClicar?: () => void
  rotulo: string
  contagem: number
  Icone?: typeof Milestone
}) {
  return (
    <Link
      to={para}
      onClick={aoClicar}
      className={`flex items-center gap-1.5 rounded-full px-4 py-2 font-bold transition ${
        ativa ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-700'
      }`}
    >
      {Icone && <Icone className="h-4 w-4" />}
      {rotulo} <span className={ativa ? 'text-neutral-400' : 'text-neutral-300'}>{contagem}</span>
    </Link>
  )
}

function CartaoAtividade({ atividade }: { atividade: AtividadeComEnvio }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [envioAberto, setEnvioAberto] = useState(false)

  const visual = visualDaHabilidade(atividade.habilidades)
  const rotuloHabilidades = atividade.habilidades
    .map((h) => ROTULO_HABILIDADE[h as keyof typeof ROTULO_HABILIDADE] ?? h)
    .join(' · ')

  return (
    <div className="flex flex-col rounded-3xl bg-white p-5 transition hover:shadow-sm">
      <Link to={`/atividades/${atividade.id}`} className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${visual.cor}`}>
            <visual.Icone className="h-4 w-4" />
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${CORES_NIVEL[atividade.nivel]}`}
          >
            {atividade.nivel}
          </span>
        </div>

        <h3 className="mt-3 font-extrabold leading-snug text-neutral-900">{atividade.titulo}</h3>
        <p className="mt-1 text-xs font-medium text-neutral-400">
          {rotuloHabilidades && `${rotuloHabilidades} · `}
          {atividade.questoes} {atividade.questoes === 1 ? 'questão' : 'questões'}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-bold">
          {atividade.enviada ? (
            <>
              <span className="flex items-center gap-1 text-violet-700">
                <Send className="h-3.5 w-3.5" />
                {atividade.envios} {atividade.envios === 1 ? 'envio' : 'envios'}
              </span>
              {atividade.mediaPercentual !== null && (
                <span
                  className={`flex items-center gap-1 ${
                    atividade.mediaPercentual >= 70
                      ? 'text-emerald-700'
                      : atividade.mediaPercentual >= 50
                        ? 'text-amber-700'
                        : 'text-rose-600'
                  }`}
                >
                  <Target className="h-3.5 w-3.5" />
                  {atividade.mediaPercentual}% média
                </span>
              )}
            </>
          ) : (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
              rascunho — ainda não enviada
            </span>
          )}
        </div>
      </Link>

      <div className="relative mt-4 flex items-center gap-2">
        <button
          onClick={() => setEnvioAberto(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 py-2.5 text-sm font-bold text-white"
        >
          <Send className="h-4 w-4" /> Enviar
        </button>
        <button
          onClick={() => setMenuAberto((v) => !v)}
          title="Mais ações"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-neutral-200 text-neutral-500"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {menuAberto && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
            <div className="absolute bottom-12 right-0 z-20 w-44 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-neutral-200">
              <Link
                to={`/atividades/${atividade.id}`}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-100"
              >
                <BookOpen className="h-3.5 w-3.5" /> Ver atividade
              </Link>
              <Link
                to={`/atividades/${atividade.id}/editar`}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-100"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Link>
            </div>
          </>
        )}
      </div>

      {envioAberto && (
        <EnvioModal
          atividadeId={atividade.id}
          atividadeTitulo={atividade.titulo}
          aoFechar={() => setEnvioAberto(false)}
        />
      )}
    </div>
  )
}
