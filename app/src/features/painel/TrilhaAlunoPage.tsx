import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Check,
  ChevronLeft,
  Clock,
  FileText,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  Loader2,
  Lock,
  Mic,
  Milestone,
  Play,
} from 'lucide-react'
import { usePainelAluno, type EtapaDaTrilha, type ModuloDaTrilha, type TrilhaDoAluno } from './api'
import { corDaNota, minutosEstimados } from '@/features/tarefa/formato'
import type { LucideIcon } from 'lucide-react'

/**
 * A trilha do aluno, módulo a módulo (docs/TUTOR-TRILHAS.md §4).
 *
 * Quem decide o que está aberto é o servidor (painel-aluno-obter, com a regra
 * de `_shared/trilha-liberacao.ts`): esta tela só desenha `estado` de cada
 * passo e `aberto` de cada módulo. Nada aqui é gravado como "liberado".
 *
 * Duas visões da mesma trilha:
 *   em ordem   uma linha por módulo, com o próximo passo em destaque
 *   por tipo   abas Materiais · Atividades · Tutor, para quem prefere escolher
 * A trilha "livre, por tipo" abre direto nas abas; nas outras, as abas são
 * uma alternativa quando o professor deixa (`permiteAbas`).
 */
export function TrilhaAlunoPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = usePainelAluno()
  const [visao, setVisao] = useState<'ordem' | 'tipo' | null>(null)
  const [aba, setAba] = useState<EtapaDaTrilha['tipo']>('material')

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const trilha = data?.trilhas.find((t) => t.id === id)
  if (!trilha) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <div>
          <p className="font-bold text-neutral-800">Trilha não encontrada.</p>
          <Link to="/painel" className="mt-2 inline-block text-sm font-bold text-violet-700 underline">
            Voltar para o painel
          </Link>
        </div>
      </div>
    )
  }

  const pausada = trilha.status === 'pausada'
  const podeTrocar = trilha.navegacao !== 'abas' && trilha.permiteAbas
  const visaoAtual = trilha.navegacao === 'abas' ? 'tipo' : (visao ?? 'ordem')
  const tiposPresentes = (['material', 'atividade', 'tutor'] as const).filter((t) => trilha.etapas.some((e) => e.tipo === t))
  const abaAtual = tiposPresentes.includes(aba) ? aba : (tiposPresentes[0] ?? 'material')

  return (
    <div className="min-h-dvh bg-areia px-5 pb-10 pt-4">
      <div className="mx-auto max-w-sm">
        <Link to="/painel" className="flex items-center gap-2 text-neutral-400">
          <ChevronLeft className="h-5 w-5" />
          <span className="text-sm font-bold text-neutral-500">Minha trilha</span>
        </Link>

        <CabecalhoTrilha trilha={trilha} professorNome={data!.professorNome} pausada={pausada} />

        {podeTrocar && (
          <div className="mt-4 grid grid-cols-2 rounded-2xl bg-neutral-200/70 p-1" role="group" aria-label="Como ver a trilha">
            {(
              [
                ['ordem', 'Em ordem', ListOrdered],
                ['tipo', 'Por tipo', LayoutGrid],
              ] as const
            ).map(([valor, rotulo, Icone]) => (
              <button
                key={valor}
                onClick={() => setVisao(valor)}
                aria-pressed={visaoAtual === valor}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold ${
                  visaoAtual === valor ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                }`}
              >
                <Icone className="h-3.5 w-3.5" /> {rotulo}
              </button>
            ))}
          </div>
        )}

        {visaoAtual === 'tipo' && tiposPresentes.length > 1 && (
          <div className={`mt-4 grid gap-1.5 ${tiposPresentes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {tiposPresentes.map((t) => {
              const v = VISUAL[t]
              return (
                <button
                  key={t}
                  onClick={() => setAba(t)}
                  aria-pressed={abaAtual === t}
                  className={`flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-xs font-extrabold ${
                    abaAtual === t ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  <v.Icone className="h-4 w-4" />
                  {v.plural}
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-5 space-y-6">
          {trilha.modulos.map((m) => {
            const passos = trilha.etapas.filter(
              (e) => e.moduloId === m.id && (visaoAtual === 'ordem' || e.tipo === abaAtual),
            )
            if (visaoAtual === 'tipo' && passos.length === 0) return null
            return (
              <ModuloDoAluno
                key={m.id}
                modulo={m}
                passos={passos}
                atualId={trilha.atualId}
                mostrarTitulo={trilha.modulos.length > 1}
                pausada={pausada}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

const VISUAL: Record<EtapaDaTrilha['tipo'], { Icone: LucideIcon; plural: string; cor: string }> = {
  material: { Icone: FileText, plural: 'Materiais', cor: 'bg-amber-100 text-amber-700' },
  atividade: { Icone: ListChecks, plural: 'Atividades', cor: 'bg-violet-100 text-violet-700' },
  tutor: { Icone: Mic, plural: 'Tutor', cor: 'bg-sky-100 text-sky-700' },
}

function CabecalhoTrilha({
  trilha,
  professorNome,
  pausada,
}: {
  trilha: TrilhaDoAluno
  professorNome: string
  pausada: boolean
}) {
  const percentual = trilha.etapas.length > 0 ? (trilha.concluidas / trilha.etapas.length) * 100 : 0

  return (
    <div className={`relative mt-3 overflow-hidden rounded-3xl p-5 ${pausada ? 'bg-neutral-200' : 'bg-violet-200'}`}>
      <span className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-violet-300/60" />
      <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white text-violet-700">
        <Milestone className="h-5 w-5" />
      </span>
      <h1 className="relative mt-2 text-lg font-extrabold text-neutral-900">{trilha.nome}</h1>
      <p className="relative text-xs font-semibold text-violet-900/70">
        com {professorNome} · nível {trilha.nivel}
      </p>

      <div className="relative mt-3 flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/60">
          <div
            className={`h-full rounded-full ${pausada ? 'bg-neutral-400' : 'bg-violet-600'}`}
            style={{ width: `${percentual}%` }}
          />
        </div>
        <span className="text-xs font-extrabold text-violet-900">
          {trilha.concluidas}/{trilha.etapas.length}
        </span>
      </div>

      {pausada && (
        <p className="relative mt-2 text-xs font-semibold text-violet-900/70">Seu professor pausou esta trilha por enquanto.</p>
      )}
    </div>
  )
}

function ModuloDoAluno({
  modulo,
  passos,
  atualId,
  mostrarTitulo,
  pausada,
}: {
  modulo: ModuloDaTrilha
  passos: EtapaDaTrilha[]
  atualId: string | null
  mostrarTitulo: boolean
  pausada: boolean
}) {
  return (
    <section>
      {mostrarTitulo && (
        <h2
          className={`mb-2 flex items-center justify-between gap-2 px-1 text-xs font-extrabold uppercase tracking-wide ${
            modulo.aberto ? 'text-neutral-500' : 'text-neutral-400'
          }`}
        >
          <span className="truncate">{modulo.titulo}</span>
          {modulo.concluido && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] normal-case tracking-normal text-emerald-800">
              Concluído
            </span>
          )}
        </h2>
      )}

      {!modulo.aberto ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white/50 px-4 py-3 text-xs font-medium text-neutral-500">
          <Lock className="h-4 w-4 shrink-0" />
          {motivoDaTrava(modulo)}
        </div>
      ) : passos.length === 0 ? (
        <p className="rounded-2xl bg-white/60 px-4 py-3 text-xs text-neutral-400">Nada neste módulo ainda.</p>
      ) : (
        <div className="space-y-2">
          {passos.map((p) => (
            <Passo key={p.etapaId} passo={p} destaque={p.etapaId === atualId} pausada={pausada} />
          ))}
        </div>
      )}
    </section>
  )
}

function motivoDaTrava(m: ModuloDaTrilha): string {
  const data = m.abreEm
    ? new Date(m.abreEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null
  if (m.esperaConcluir && data) return `Abre quando você concluir "${m.esperaConcluir}", a partir de ${data}`
  if (m.esperaConcluir) return `Abre quando você concluir "${m.esperaConcluir}"`
  if (data) return `Abre em ${data}`
  return 'Ainda não liberado'
}

/** Para onde cada tipo de passo leva. */
function destino(p: EtapaDaTrilha): string | null {
  if (p.tipo === 'atividade') return p.atribuicaoId ? `/painel/tarefa/${p.atribuicaoId}` : null
  if (p.tipo === 'material') return p.materialId ? `/painel/materiais/${p.materialId}?passo=${p.etapaId}` : null
  return p.licaoId ? `/painel/tutor/${p.licaoId}` : null
}

function Passo({ passo, destaque, pausada }: { passo: EtapaDaTrilha; destaque: boolean; pausada: boolean }) {
  const v = VISUAL[passo.tipo]
  const feito = passo.estado === 'feito'
  const travado = passo.estado === 'travado'
  const link = !travado && !pausada ? destino(passo) : null
  const percentual = passo.total ? (passo.acertos ?? 0) / passo.total : 1
  // Concluída com nota baixa vira convite a refazer, não repreensão.
  const daPraMelhorar = passo.tipo === 'atividade' && feito && percentual < 0.7

  const subtitulo = travado
    ? 'Conclua o passo anterior'
    : passo.tipo === 'atividade'
      ? feito
        ? daPraMelhorar
          ? 'dá pra melhorar — refazer?'
          : 'concluída'
        : `${passo.totalQuestoes} questões · ~${minutosEstimados(passo.totalQuestoes)} min`
      : passo.tipo === 'material'
        ? feito
          ? 'lido'
          : `${(passo.detalhe ?? 'material').toUpperCase()} · leia e marque como lido`
        : feito
          ? 'praticada'
          : 'conversa com o tutor'

  const cartao = destaque && !feito && !travado ? (
    <div className="relative overflow-hidden rounded-3xl bg-neutral-900 p-5 text-white">
      <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-violet-500/30" />
      <span className="relative rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-extrabold">SUA VEZ</span>
      <p className="relative mt-2 flex items-center gap-2 text-base font-extrabold">
        <v.Icone className="h-4 w-4 shrink-0 text-violet-300" />
        {passo.titulo}
      </p>
      <p className="relative mt-0.5 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
        {passo.tipo === 'atividade' && <Clock className="h-3.5 w-3.5" />} {subtitulo}
      </p>
      {link && (
        <span className="relative mt-3 flex w-fit items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-neutral-900">
          <Play className="h-3.5 w-3.5" /> {passo.tipo === 'material' ? 'Ler' : passo.tipo === 'tutor' ? 'Praticar' : 'Começar'}
        </span>
      )}
    </div>
  ) : (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${travado ? 'bg-white/50' : 'bg-white'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${travado ? 'bg-neutral-100 text-neutral-400' : v.cor}`}>
        <v.Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-bold ${travado ? 'text-neutral-400' : 'text-neutral-800'}`}>{passo.titulo}</p>
        <p className={`text-xs font-medium ${daPraMelhorar ? 'font-semibold text-amber-700' : 'text-neutral-400'}`}>
          {passo.opcional && !feito ? 'Opcional · ' : ''}
          {subtitulo}
        </p>
      </div>
      {travado ? (
        <Lock className="h-4 w-4 shrink-0 text-neutral-300" />
      ) : feito && passo.tipo === 'atividade' && passo.total !== null ? (
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${corDaNota(passo.acertos ?? 0, passo.total ?? 0)}`}
        >
          {passo.acertos}/{passo.total}
        </span>
      ) : feito ? (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-300 text-emerald-900">
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-extrabold text-neutral-600">
          {passo.tipo === 'material' ? 'Ler' : passo.tipo === 'tutor' ? 'Praticar' : 'Fazer'}
        </span>
      )}
    </div>
  )

  return link ? (
    <Link to={link} className="block">
      {cartao}
    </Link>
  ) : (
    cartao
  )
}
