import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  Loader2,
  Milestone,
  MoreHorizontal,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import { BotaoNovaAtividade } from '@/features/atividades/BotaoNovaAtividade'
import {
  useAluno,
  useAtualizarAluno,
  useContaDoAluno,
  useErrosRecorrentes,
  useHistoricoDoAluno,
  useUltimoReset,
} from './api'
import { AcessoAlunoModal } from './AcessoAlunoModal'
import { EditarAlunoModal } from './EditarAlunoModal'
import { AbaAulas } from '@/features/aulas/AbaAulas'
import { useAulasDoAluno } from '@/features/aulas/api'
import { AbaMateriais } from '@/features/materiais/AbaMateriais'
import { AbaPagamentos } from '@/features/financeiro/AbaPagamentos'
import { mesReferenciaISO, usePagamentosDoAluno } from '@/features/financeiro/api'
import { useTrilhasDoAluno } from '@/features/trilhas/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { ROTULO_HABILIDADE } from '@/types/questao'

const ABAS = ['Resumo', 'Atividades', 'Aulas', 'Materiais', 'Pagamentos'] as const
type Aba = (typeof ABAS)[number]
const DIA_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function AlunoPage() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { data: aluno, isLoading, error } = useAluno(id)
  const { data: historico } = useHistoricoDoAluno(id)
  const { data: errosRecorrentes } = useErrosRecorrentes(id)
  const { data: conta } = useContaDoAluno(id)
  const { data: ultimoReset } = useUltimoReset(id)
  const { data: aulas } = useAulasDoAluno(id)
  const { data: pagamentos } = usePagamentosDoAluno(id)
  const { data: trilhas } = useTrilhasDoAluno(id)
  const atualizar = useAtualizarAluno()
  const [modalAcessoAberto, setModalAcessoAberto] = useState(false)
  const [modalEditarAberto, setModalEditarAberto] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [aba, setAba] = useState<Aba>('Resumo')

  const concluidas = historico?.filter((h) => h.concluidaEm) ?? []
  // Aulas vêm da mais recente para a mais antiga. Só conta como "última aula"
  // a que já aconteceu — uma anotação escrita adiantada numa aula ainda
  // agendada apareceria como a mais recente e confundiria o professor.
  const agora = new Date().toISOString()
  const ultimaAnotacao = aulas?.find((a) => a.anotacao && a.data_hora <= agora)
  const pagamentoDoMes = pagamentos?.find((p) => p.referencia_mes === mesReferenciaISO())
  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long' })
  const mediaAcertos =
    concluidas.length > 0
      ? Math.round(
          (concluidas.reduce((soma, h) => soma + (h.total ? h.acertos! / h.total : 0), 0) / concluidas.length) * 100,
        )
      : null

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (error || !aluno) {
    return (
      <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Aluno não encontrado.{' '}
        <Link to="/alunos" className="font-bold underline">
          Voltar para a lista
        </Link>
      </p>
    )
  }

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-neutral-400">
        <Link to="/alunos" className="hover:text-neutral-600">
          Alunos
        </Link>{' '}
        / <span className="text-neutral-700">{aluno.nome}</span>
      </p>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className={`grid h-16 w-16 shrink-0 place-items-center rounded-full text-2xl font-extrabold ${corDoAvatar(aluno.id)}`}
          >
            {inicial(aluno.nome)}
          </span>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">
              {aluno.nome}
              {aluno.nivel_cefr && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-extrabold text-violet-700">
                  {aluno.nivel_cefr}
                </span>
              )}
              {conta ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  <Check className="h-3 w-3" /> conta ativa
                </span>
              ) : (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                  sem conta
                </span>
              )}
            </h1>
            <p className="text-sm text-neutral-500">
              {conta?.email ?? aluno.email ?? 'sem e-mail cadastrado'}
              {aluno.valor_mensal && ` · R$ ${aluno.valor_mensal}/mês`}
              {aluno.dia_semana !== null && aluno.horario && ` · ${DIA_ABREV[aluno.dia_semana]} ${aluno.horario.slice(0, 5)}`}
            </p>
          </div>
        </div>

        <div className="relative flex flex-wrap items-start gap-2">
          {!conta && (
            <button
              onClick={() => setModalAcessoAberto(true)}
              className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold"
            >
              <Link2 className="h-4 w-4" /> Gerar link de cadastro
            </button>
          )}
          <BotaoNovaAtividade compacto />
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-500"
            title="Mais ações"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuAberto && (
            <>
              {/* Camada invisível: clicar em qualquer lugar fora fecha o menu. */}
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
              <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-neutral-200">
                <div className="p-1.5">
                  <ItemMenu
                    Icone={Pencil}
                    rotulo="Editar dados"
                    aoClicar={() => {
                      setMenuAberto(false)
                      setModalEditarAberto(true)
                    }}
                  />
                  <ItemMenu
                    Icone={Archive}
                    rotulo="Arquivar aluno"
                    aoClicar={async () => {
                      setMenuAberto(false)
                      await atualizar.mutateAsync({ id: aluno.id, campos: { status: 'arquivado' } })
                      navegar('/alunos')
                    }}
                  />
                  {conta && (
                    <ItemMenu
                      Icone={RotateCcw}
                      rotulo="Resetar acesso"
                      perigo
                      aoClicar={() => {
                        setMenuAberto(false)
                        setModalAcessoAberto(true)
                      }}
                    />
                  )}
                </div>
                <p className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-400">
                  Último reset: {ultimoReset ? new Date(ultimoReset).toLocaleDateString('pt-BR') : 'nunca'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {modalAcessoAberto && (
        <AcessoAlunoModal
          alunoId={aluno.id}
          alunoNome={aluno.nome}
          temConta={Boolean(conta)}
          aoFechar={() => setModalAcessoAberto(false)}
        />
      )}
      {modalEditarAberto && <EditarAlunoModal aluno={aluno} aoFechar={() => setModalEditarAberto(false)} />}

      <div className="mt-6 flex flex-wrap gap-1 text-sm">
        {ABAS.map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={
              aba === a
                ? 'rounded-full bg-neutral-900 px-4 py-2 font-bold text-white'
                : 'rounded-full px-4 py-2 font-semibold text-neutral-400 hover:text-neutral-700'
            }
          >
            {a}
          </button>
        ))}
      </div>

      {aba === 'Resumo' && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Tile
              cor="bg-violet-200"
              corRotulo="text-violet-800/70"
              valor={mediaAcertos === null ? '—' : `${mediaAcertos}%`}
              rotulo="média de acertos"
            />
            <Tile
              cor="bg-emerald-100"
              corRotulo="text-emerald-800/70"
              valor={String(concluidas.length)}
              sufixo={historico && historico.length > 0 ? `/${historico.length}` : undefined}
              rotulo="tarefas concluídas"
            />
            <Tile
              cor="bg-amber-100"
              corRotulo="text-amber-800/80"
              valor={aluno.valor_mensal ? mesAtual : '—'}
              rotulo={
                !aluno.valor_mensal ? (
                  'sem mensalidade definida'
                ) : pagamentoDoMes?.status === 'pago' ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> mensalidade paga
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> R$ {aluno.valor_mensal} pendente
                  </span>
                )
              }
            />
          </div>

          {trilhas && trilhas.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {trilhas.map((t) => (
                <Link
                  key={t.trilhaId}
                  to={`/alunos/${aluno.id}/trilhas/${t.trilhaId}`}
                  className="flex items-center gap-3 rounded-3xl bg-violet-200 p-4 transition hover:shadow-sm"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-violet-700">
                    <Milestone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-neutral-900">{t.nome}</span>
                    <span className="block text-xs font-medium text-violet-900/70">
                      {t.status === 'pausada' ? 'pausada · ' : ''}
                      {t.concluidas}/{t.total} etapas
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Painel Icone={Pencil} titulo="Anotação da última aula" sufixo={dataCurta(ultimaAnotacao?.data_hora)}>
              {ultimaAnotacao ? (
                <p className="whitespace-pre-wrap text-sm text-neutral-600">{ultimaAnotacao.anotacao}</p>
              ) : (
                <p className="text-sm text-neutral-400">
                  Nenhuma aula anotada ainda. Registre na aba Aulas.
                </p>
              )}
            </Painel>

            <Painel Icone={FileText} titulo="Últimas atividades">
              {historico && historico.length > 0 ? (
                <div className="space-y-2.5">
                  {historico.slice(0, 3).map((h) => (
                    <div key={h.atribuicaoId} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate text-neutral-700">{h.atividadeTitulo}</span>
                      {h.concluidaEm ? (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${corDoPlacar(h.acertos, h.total)}`}
                        >
                          {h.acertos}/{h.total}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">
                          pendente
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-400">Nenhuma atividade enviada ainda.</p>
              )}
            </Painel>
          </div>

          {errosRecorrentes && errosRecorrentes.length > 0 && (
            <div className="mt-4 rounded-3xl bg-white p-5">
              <h2 className="text-sm font-bold text-neutral-900">Erros recorrentes</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {errosRecorrentes.map((e) => (
                  <span
                    key={e.habilidade}
                    className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"
                  >
                    {ROTULO_HABILIDADE[e.habilidade as keyof typeof ROTULO_HABILIDADE] ?? e.habilidade} · {e.erros}
                  </span>
                ))}
              </div>
            </div>
          )}

          {aluno.observacoes && (
            <div className="mt-4 rounded-3xl bg-white p-5">
              <h2 className="text-sm font-bold text-neutral-900">Observações</h2>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-neutral-600">{aluno.observacoes}</p>
            </div>
          )}
        </>
      )}

      {aba === 'Atividades' &&
        (!historico || historico.length === 0 ? (
          <div className="mt-4 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
            <p className="font-bold text-neutral-700">Nenhuma atividade ainda</p>
            <p className="mt-1 text-sm text-neutral-500">
              Crie a primeira atividade para {aluno.nome.split(' ')[0]} e envie pelo WhatsApp.
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
            {historico.map((h) => {
              const conteudo = (
                <>
                  <div className="flex-1">
                    <p className="font-bold text-neutral-800">
                      {h.atividadeTitulo}
                      {h.tentativa > 1 && (
                        <span className="ml-1 text-xs font-medium text-neutral-400">tentativa {h.tentativa}</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-400">{h.nivel}</p>
                  </div>
                  {h.concluidaEm ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800">
                      {h.acertos}/{h.total}
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">
                      pendente
                    </span>
                  )}
                </>
              )
              return h.concluidaEm ? (
                <Link
                  key={h.atribuicaoId}
                  to={`/resultados/${h.atribuicaoId}`}
                  className="flex items-center gap-3 px-5 py-3.5 text-sm transition hover:bg-neutral-50"
                >
                  {conteudo}
                </Link>
              ) : (
                <div key={h.atribuicaoId} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                  {conteudo}
                </div>
              )
            })}
          </div>
        ))}

      {aba === 'Aulas' && <AbaAulas alunoId={aluno.id} alunoNome={aluno.nome} />}

      {aba === 'Materiais' && <AbaMateriais alunoId={aluno.id} alunoNome={aluno.nome} />}

      {aba === 'Pagamentos' && <AbaPagamentos alunoId={aluno.id} valorMensal={aluno.valor_mensal} />}
    </div>
  )
}

function dataCurta(iso?: string): string | undefined {
  if (!iso) return undefined
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function corDoPlacar(acertos: number | null, total: number | null): string {
  if (!total) return 'bg-neutral-100 text-neutral-500'
  const percentual = (acertos ?? 0) / total
  if (percentual >= 0.7) return 'bg-emerald-100 text-emerald-800'
  if (percentual >= 0.5) return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-700'
}

function Tile({
  cor,
  corRotulo,
  valor,
  sufixo,
  rotulo,
}: {
  cor: string
  corRotulo: string
  valor: string
  /** Parte menor colada no número, tipo o "/17" de "14/17". */
  sufixo?: string
  rotulo: React.ReactNode
}) {
  return (
    <div className={`rounded-3xl p-5 ${cor}`}>
      <p className="text-3xl font-extrabold capitalize text-neutral-900">
        {valor}
        {sufixo && <span className="text-xl opacity-50">{sufixo}</span>}
      </p>
      <div className={`mt-1 text-xs font-semibold ${corRotulo}`}>{rotulo}</div>
    </div>
  )
}

function Painel({
  Icone,
  titulo,
  sufixo,
  children,
}: {
  Icone: typeof Pencil
  titulo: string
  sufixo?: string
  children: React.ReactNode
}) {
  return (
    // min-w-0: item de grid não encolhe sozinho, e um título de atividade
    // comprido estouraria a largura da tela no celular.
    <section className="min-w-0 rounded-3xl bg-white p-5">
      <h2 className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-neutral-900">
        <Icone className="h-4 w-4 shrink-0" /> {titulo}
        {sufixo && <span className="font-medium text-neutral-400">· {sufixo}</span>}
      </h2>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function ItemMenu({
  Icone,
  rotulo,
  aoClicar,
  perigo = false,
}: {
  Icone: typeof Pencil
  rotulo: string
  aoClicar: () => void
  perigo?: boolean
}) {
  return (
    <button
      onClick={aoClicar}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold ${
        perigo ? 'text-rose-700 hover:bg-rose-50' : 'text-neutral-700 hover:bg-neutral-100'
      }`}
    >
      <Icone className="h-3.5 w-3.5" /> {rotulo}
    </button>
  )
}
