import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  ListChecks,
  Loader2,
  Mic,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  useAdicionarEtapa,
  useAlternarOpcional,
  useAtualizarTrilha,
  useCriarModulo,
  useExcluirModulo,
  useMoverPassoDeModulo,
  useRemoverEtapa,
  useRenomearModulo,
  useTrocarModulos,
  useTrocarPassos,
  type PassoDaTrilha,
} from './api'
import { useAtividades } from '@/features/atividades/api'
import { useAcervo } from '@/features/materiais/api'
import { useAcessoTutor, useLicoesTutor } from '@/features/tutor/api'
import type { TipoDePasso, Trilha, TrilhaLiberacao, TrilhaModulo, TrilhaNavegacao } from '@/types/db'
import type { LucideIcon } from 'lucide-react'

/**
 * O editor da trilha (docs/TUTOR-TRILHAS.md §4): módulos com passos de três
 * tipos e o painel de como o aluno percorre e quando cada módulo libera.
 *
 * Reordenar é por setas, não por arrastar: o drag-and-drop do HTML5 não
 * funciona em toque, e o professor também usa o celular (RNF-06).
 */

const VISUAL_PASSO: Record<TipoDePasso, { Icone: LucideIcon; cor: string; nome: string }> = {
  material: { Icone: FileText, cor: 'bg-amber-100 text-amber-700', nome: 'Material' },
  atividade: { Icone: ListChecks, cor: 'bg-violet-100 text-violet-700', nome: 'Atividade' },
  tutor: { Icone: Mic, cor: 'bg-sky-100 text-sky-700', nome: 'Lição do tutor' },
}

// ---------------------------------------------------------------------------
// Módulos e passos
// ---------------------------------------------------------------------------

export function ModulosDaTrilha({
  trilhaId,
  modulos,
  passos,
}: {
  trilhaId: string
  modulos: TrilhaModulo[]
  passos: PassoDaTrilha[]
}) {
  const criarModulo = useCriarModulo(trilhaId)
  const trocar = useTrocarModulos(trilhaId)
  const [adicionarEm, setAdicionarEm] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {modulos.map((m, i) => (
        <Modulo
          key={m.id}
          trilhaId={trilhaId}
          modulo={m}
          numero={i + 1}
          passos={passos.filter((p) => p.modulo_id === m.id)}
          outrosModulos={modulos.filter((o) => o.id !== m.id)}
          podeSubir={i > 0}
          podeDescer={i < modulos.length - 1}
          podeExcluir={modulos.length > 1}
          aoSubir={() => trocar.mutate([m, modulos[i - 1]])}
          aoDescer={() => trocar.mutate([m, modulos[i + 1]])}
          aoAdicionar={() => setAdicionarEm(m.id)}
        />
      ))}

      <button
        onClick={() => criarModulo.mutate(`Módulo ${modulos.length + 1}`)}
        disabled={criarModulo.isPending}
        className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> Novo módulo
      </button>

      {adicionarEm && (
        <ModalAdicionarPasso
          trilhaId={trilhaId}
          moduloId={adicionarEm}
          passos={passos}
          aoFechar={() => setAdicionarEm(null)}
        />
      )}
    </div>
  )
}

function Modulo({
  trilhaId,
  modulo,
  numero,
  passos,
  outrosModulos,
  podeSubir,
  podeDescer,
  podeExcluir,
  aoSubir,
  aoDescer,
  aoAdicionar,
}: {
  trilhaId: string
  modulo: TrilhaModulo
  numero: number
  passos: PassoDaTrilha[]
  outrosModulos: TrilhaModulo[]
  podeSubir: boolean
  podeDescer: boolean
  podeExcluir: boolean
  aoSubir: () => void
  aoDescer: () => void
  aoAdicionar: () => void
}) {
  const renomear = useRenomearModulo(trilhaId)
  const excluir = useExcluirModulo(trilhaId)
  const reordenar = useTrocarPassos(trilhaId)
  const remover = useRemoverEtapa(trilhaId)
  const alternarOpcional = useAlternarOpcional(trilhaId)
  const moverDeModulo = useMoverPassoDeModulo(trilhaId)
  const [titulo, setTitulo] = useState(modulo.titulo)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  /** Troca dois passos vizinhos do módulo de lugar (ver `useTrocarPassos`). */
  function mover(indice: number, direcao: -1 | 1) {
    const a = passos[indice]
    const b = passos[indice + direcao]
    if (!a || !b) return
    reordenar.mutate([a, b])
  }

  return (
    <section className="rounded-3xl bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-neutral-900 text-xs font-extrabold text-white">
          {numero}
        </span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={() => titulo.trim() && titulo !== modulo.titulo && renomear.mutate({ id: modulo.id, titulo })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label={`Nome do módulo ${numero}`}
          className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm font-extrabold text-neutral-900 outline-none hover:bg-neutral-50 focus:bg-neutral-50"
        />
        <BotaoIcone titulo="Subir módulo" onClick={aoSubir} disabled={!podeSubir}>
          <ChevronUp className="h-4 w-4" />
        </BotaoIcone>
        <BotaoIcone titulo="Descer módulo" onClick={aoDescer} disabled={!podeDescer}>
          <ChevronDown className="h-4 w-4" />
        </BotaoIcone>
        {podeExcluir &&
          (confirmarExclusao ? (
            <button
              onClick={() => excluir.mutate(modulo.id)}
              className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white"
            >
              Apagar módulo e {passos.length} {passos.length === 1 ? 'passo' : 'passos'}?
            </button>
          ) : (
            <BotaoIcone titulo="Apagar módulo" onClick={() => setConfirmarExclusao(true)}>
              <Trash2 className="h-4 w-4" />
            </BotaoIcone>
          ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {passos.length === 0 && (
          <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
            Módulo vazio. Adicione um material, uma atividade ou uma lição do tutor.
          </p>
        )}
        {passos.map((p, i) => {
          const visual = VISUAL_PASSO[p.tipo]
          return (
            <div key={p.id} className="flex items-center gap-2 rounded-2xl bg-neutral-50 px-2.5 py-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${visual.cor}`}>
                <visual.Icone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                {p.tipo === 'atividade' ? (
                  <Link to={`/atividades/${p.atividade_id}`} className="block truncate text-sm font-bold text-neutral-800 hover:underline">
                    {p.titulo}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-bold text-neutral-800">{p.titulo}</p>
                )}
                <p className="truncate text-xs font-medium text-neutral-400">
                  {visual.nome} · {p.detalhe}
                  {p.nivel ? ` · ${p.nivel}` : ''}
                </p>
              </div>
              <button
                onClick={() => alternarOpcional.mutate({ etapaId: p.id, opcional: !p.opcional })}
                title="Passo opcional aparece para o aluno, mas não segura o avanço"
                className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:block ${
                  p.opcional
                    ? 'border-neutral-300 bg-white text-neutral-700'
                    : 'border-dashed border-neutral-300 text-neutral-400'
                }`}
              >
                {p.opcional ? 'Opcional' : 'Obrigatório'}
              </button>
              {outrosModulos.length > 0 && (
                <SeletorDeModulo
                  modulos={outrosModulos}
                  aoEscolher={(moduloId) => moverDeModulo.mutate({ etapaId: p.id, moduloId })}
                />
              )}
              <BotaoIcone titulo="Subir" onClick={() => mover(i, -1)} disabled={i === 0 || reordenar.isPending}>
                <ChevronUp className="h-4 w-4" />
              </BotaoIcone>
              <BotaoIcone
                titulo="Descer"
                onClick={() => mover(i, 1)}
                disabled={i === passos.length - 1 || reordenar.isPending}
              >
                <ChevronDown className="h-4 w-4" />
              </BotaoIcone>
              <BotaoIcone titulo="Tirar da trilha" onClick={() => remover.mutate(p.id)} disabled={remover.isPending}>
                <X className="h-4 w-4" />
              </BotaoIcone>
            </div>
          )
        })}
      </div>

      <button
        onClick={aoAdicionar}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 py-2.5 text-sm font-bold text-neutral-500 transition hover:border-neutral-400"
      >
        <Plus className="h-4 w-4" /> Adicionar passo
      </button>
    </section>
  )
}

function SeletorDeModulo({ modulos, aoEscolher }: { modulos: TrilhaModulo[]; aoEscolher: (id: string) => void }) {
  return (
    <label className="relative grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-neutral-400 hover:bg-neutral-200" title="Mover para outro módulo">
      <ArrowRightLeft className="h-3.5 w-3.5" />
      <select
        aria-label="Mover para outro módulo"
        value=""
        onChange={(e) => e.target.value && aoEscolher(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Mover para…</option>
        {modulos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.titulo}
          </option>
        ))}
      </select>
    </label>
  )
}

function BotaoIcone({
  titulo,
  onClick,
  disabled,
  children,
}: {
  titulo: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-200 disabled:opacity-25"
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Adicionar passo
// ---------------------------------------------------------------------------

function ModalAdicionarPasso({
  trilhaId,
  moduloId,
  passos,
  aoFechar,
}: {
  trilhaId: string
  moduloId: string
  passos: PassoDaTrilha[]
  aoFechar: () => void
}) {
  const { data: acesso } = useAcessoTutor()
  const [tipo, setTipo] = useState<TipoDePasso>('material')
  const [busca, setBusca] = useState('')
  const adicionar = useAdicionarEtapa(trilhaId)
  const { data: atividades, isLoading: carregandoAtividades } = useAtividades()
  const { data: materiais, isLoading: carregandoMateriais } = useAcervo()
  const { data: licoes, isLoading: carregandoLicoes } = useLicoesTutor()

  const jaNaTrilha = new Set(passos.flatMap((p) => [p.atividade_id, p.material_id, p.licao_tutor_id].filter(Boolean)))
  const termo = busca.trim().toLowerCase()
  const confere = (texto: string) => !termo || texto.toLowerCase().includes(termo)

  const itens: { id: string; titulo: string; detalhe: string }[] =
    tipo === 'atividade'
      ? (atividades ?? [])
          .filter((a) => confere(a.titulo))
          .map((a) => ({ id: a.id, titulo: a.titulo, detalhe: `${a.nivel} · ${a.questoes} ${a.questoes === 1 ? 'questão' : 'questões'}` }))
      : tipo === 'material'
        ? (materiais ?? [])
            .filter((m) => confere(m.nome))
            .map((m) => ({ id: m.id, titulo: m.nome, detalhe: m.tipo.toUpperCase() }))
        : (licoes ?? [])
            .filter((l) => confere(l.titulo))
            .map((l) => ({
              id: l.id,
              titulo: l.titulo,
              detalhe: `${l.nivel_cefr ?? 'Sem nível'} · ${l.professor_id ? 'sua' : 'da biblioteca'}`,
            }))
  const carregando =
    tipo === 'atividade' ? carregandoAtividades : tipo === 'material' ? carregandoMateriais : carregandoLicoes
  const tipos: TipoDePasso[] = acesso ? ['material', 'atividade', 'tutor'] : ['material', 'atividade']

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Adicionar passo</h2>
            <p className="text-sm text-neutral-500">Do que já está no seu acervo.</p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`mt-4 grid gap-1.5 ${tipos.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {tipos.map((t) => {
            const v = VISUAL_PASSO[t]
            return (
              <button
                key={t}
                onClick={() => setTipo(t)}
                aria-pressed={tipo === t}
                className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-xs font-bold ${
                  tipo === t ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600'
                }`}
              >
                <v.Icone className="h-4 w-4" />
                {v.nome}
              </button>
            )
          })}
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          className="mt-3 w-full rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm outline-none ring-neutral-900 focus:ring-2"
        />

        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {carregando && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          )}
          {!carregando && itens.length === 0 && (
            <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
              {tipo === 'tutor' ? 'Nenhuma lição publicada encontrada.' : 'Nada encontrado.'}
            </p>
          )}
          {itens.map((item) => (
            <button
              key={item.id}
              onClick={async () => {
                await adicionar.mutateAsync({ tipo, itemId: item.id, moduloId })
                aoFechar()
              }}
              disabled={adicionar.isPending}
              className="flex w-full items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-2.5 text-left transition hover:bg-neutral-100 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-neutral-800">{item.titulo}</span>
                <span className="text-xs text-neutral-400">
                  {item.detalhe}
                  {jaNaTrilha.has(item.id) && ' · já está na trilha'}
                </span>
              </span>
              <Plus className="h-4 w-4 shrink-0 text-neutral-400" />
            </button>
          ))}
        </div>
        {adicionar.error && <p className="mt-2 text-xs font-medium text-rose-700">{adicionar.error.message}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Como o aluno percorre e quando libera
// ---------------------------------------------------------------------------

const NAVEGACOES: { valor: TrilhaNavegacao; titulo: string; texto: string }[] = [
  { valor: 'sequencia', titulo: 'Em sequência', texto: 'O próximo passo abre quando o anterior é concluído.' },
  { valor: 'sugerida', titulo: 'Livre, com ordem sugerida', texto: 'Tudo aberto; o próximo recomendado fica em destaque.' },
  { valor: 'abas', titulo: 'Livre, por tipo', texto: 'Abas Materiais, Atividades e Tutor. O aluno escolhe a ordem.' },
]

const LIBERACOES: { valor: TrilhaLiberacao; titulo: string; texto: string }[] = [
  { valor: 'tudo', titulo: 'Tudo de uma vez', texto: 'Todos os módulos abertos desde o início.' },
  { valor: 'progresso', titulo: 'Conforme avança', texto: 'O módulo seguinte abre ao concluir o anterior.' },
  { valor: 'periodo', titulo: 'Um módulo por período', texto: 'Abre um módulo novo a cada intervalo, mesmo sem concluir.' },
  {
    valor: 'progresso_e_periodo',
    titulo: 'Conforme avança, com intervalo mínimo',
    texto: 'Evita fazer tudo no primeiro mês e cancelar.',
  },
]

export function ConfiguracaoDaTrilha({ trilha }: { trilha: Trilha }) {
  const atualizar = useAtualizarTrilha(trilha.id)
  const [dias, setDias] = useState(String(trilha.liberacao_dias))
  const [nota, setNota] = useState(trilha.nota_minima === null ? '' : String(trilha.nota_minima))
  const usaDias = trilha.liberacao === 'periodo' || trilha.liberacao === 'progresso_e_periodo'

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-neutral-900">Como o aluno percorre cada módulo</h3>
        <Opcoes
          nome={`navegacao-${trilha.id}`}
          opcoes={NAVEGACOES}
          valor={trilha.navegacao}
          aoMudar={(navegacao) => atualizar.mutate({ navegacao })}
        />
        {trilha.navegacao !== 'abas' && (
          <label className="mt-3 flex items-center justify-between gap-3 text-sm text-neutral-700">
            Deixar o aluno ver também por tipo
            <input
              type="checkbox"
              checked={trilha.permite_abas}
              onChange={(e) => atualizar.mutate({ permite_abas: e.target.checked })}
              className="h-4 w-4 accent-violet-700"
            />
          </label>
        )}
        <label className="mt-3 flex items-center justify-between gap-3 text-sm text-neutral-700">
          <span>
            Nota mínima na atividade
            <span className="block text-xs text-neutral-400">Em branco: basta terminar.</span>
          </span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onBlur={() => {
                const valor = nota.trim() === '' ? null : Math.max(0, Math.min(100, Math.round(Number(nota))))
                if (valor !== trilha.nota_minima) atualizar.mutate({ nota_minima: valor })
              }}
              className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-right tabular-nums"
            />
            %
          </span>
        </label>
      </div>

      <div className="rounded-3xl bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-neutral-900">Quando cada módulo libera</h3>
        <Opcoes
          nome={`liberacao-${trilha.id}`}
          opcoes={LIBERACOES}
          valor={trilha.liberacao}
          aoMudar={(liberacao) => atualizar.mutate({ liberacao })}
        />
        {usaDias && (
          <label className="mt-3 flex items-center justify-between gap-3 text-sm text-neutral-700">
            Intervalo entre módulos
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={365}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                onBlur={() => {
                  const valor = Math.max(1, Math.min(365, Math.round(Number(dias) || 1)))
                  setDias(String(valor))
                  if (valor !== trilha.liberacao_dias) atualizar.mutate({ liberacao_dias: valor })
                }}
                className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-right tabular-nums"
              />
              dias
            </span>
          </label>
        )}
      </div>
      {atualizar.error && <p className="text-xs font-medium text-rose-700">{atualizar.error.message}</p>}
    </div>
  )
}

function Opcoes<T extends string>({
  nome,
  opcoes,
  valor,
  aoMudar,
}: {
  nome: string
  opcoes: { valor: T; titulo: string; texto: string }[]
  valor: T
  aoMudar: (v: T) => void
}) {
  return (
    <div className="space-y-1.5">
      {opcoes.map((o) => (
        <label
          key={o.valor}
          className={`flex cursor-pointer gap-2.5 rounded-2xl border px-3 py-2.5 ${
            valor === o.valor ? 'border-violet-600 bg-violet-50/50' : 'border-neutral-200'
          }`}
        >
          <input
            type="radio"
            name={nome}
            checked={valor === o.valor}
            onChange={() => aoMudar(o.valor)}
            className="mt-0.5 accent-violet-700"
          />
          <span>
            <span className="block text-sm font-bold text-neutral-800">{o.titulo}</span>
            <span className="block text-xs text-neutral-500">{o.texto}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
