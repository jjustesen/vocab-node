import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Link2,
  Loader2,
  Milestone,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { BotaoNovaAtividade } from '@/features/atividades/BotaoNovaAtividade'
import { useApagarTarefaDoAluno, useRegerarLinkDaTarefa } from '@/features/atividades/api'
import { BotaoApagar } from '@/components/BotaoApagar'
import { SeletorDeOrdem } from '@/components/SeletorDeOrdem'
import { ordenar, useOrdem } from '@/lib/ordenar'
import { linkLembrado } from '@/lib/links-lembrados'
import {
  type ItemHistoricoAluno,
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
import { useRemoverAlunoDaTrilha, useTrilhasDoAluno, type TrilhaNaFicha } from '@/features/trilhas/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { ROTULO_HABILIDADE } from '@/types/questao'
import { CartaoSala } from '@/features/sala/CartaoSala'

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
          <BotaoNovaAtividade compacto aluno={aluno} />
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

          {/* A sala vem logo abaixo dos números: é o que o professor procura
              quando abre a ficha na hora da aula. A mesma peça aparece na aba
              Aulas — um componente só, dois lugares. */}
          <CartaoSala alunoId={aluno.id} alunoNome={aluno.nome} />

          {trilhas && trilhas.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {trilhas.map((t) => (
                <CartaoTrilha key={t.trilhaId} alunoId={aluno.id} trilha={t} />
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-neutral-700">{h.atividadeTitulo}</span>
                        {h.trilha && (
                          <span className="flex items-center gap-1 truncate text-xs font-medium text-violet-700">
                            <Milestone className="h-3 w-3 shrink-0" />
                            {h.trilha.nome} · etapa {h.trilha.etapa}
                          </span>
                        )}
                      </span>
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
          <AtividadesSeparadas historico={historico} alunoId={aluno.id} trilhas={trilhas ?? []} />
        ))}

      {aba === 'Aulas' && <AbaAulas alunoId={aluno.id} alunoNome={aluno.nome} />}

      {aba === 'Materiais' && <AbaMateriais alunoId={aluno.id} alunoNome={aluno.nome} />}

      {aba === 'Pagamentos' && <AbaPagamentos alunoId={aluno.id} valorMensal={aluno.valor_mensal} />}
    </div>
  )
}

/**
 * A aba Atividades, separada pelo CAMINHO por que cada tarefa chegou: avulsa
 * ou etapa de uma trilha.
 *
 * Numa lista só, a "Atividade 1" enviada sozinha e a mesma "Atividade 1" como
 * etapa da trilha eram duas linhas idênticas, e o professor não sabia qual
 * delas estava olhando — nem qual reenviar. Cada trilha vira o seu bloco, na
 * ordem das etapas; o que não é de trilha fica em "Avulsas", do mais recente
 * para o mais antigo.
 *
 * A ordem escolhida no seletor vale para todos os blocos. Padrão: "Mais
 * recentes", que é como a lista sempre veio; o número da etapa continua à
 * vista em cada linha da trilha, então a sequência não se perde com outra ordem.
 *
 * A "tentativa" também é contada DENTRO de cada bloco. No banco ela é uma só
 * por atividade e aluno (o unique de `atribuicoes`), então a segunda vez que a
 * atividade ia avulsa podia aparecer como "tentativa 5" só porque a trilha já
 * a tinha mandado três vezes.
 */
function AtividadesSeparadas({
  historico,
  alunoId,
  trilhas,
}: {
  historico: ItemHistoricoAluno[]
  alunoId: string
  trilhas: TrilhaNaFicha[]
}) {
  const [ordem, setOrdem] = useOrdem('atividades-do-aluno', 'recentes')
  const emOrdem = (itens: ItemHistoricoAluno[]) =>
    ordenar(itens, ordem, { nome: (h) => h.atividadeTitulo, data: (h) => h.enviadaEm })
  const avulsas = emOrdem(historico.filter((h) => !h.trilha))

  // Na ordem em que aparecem no histórico (mais recente primeiro): a trilha
  // mexida por último fica no topo.
  const blocos = new Map<string, { nome: string; itens: ItemHistoricoAluno[] }>()
  for (const h of historico) {
    if (!h.trilha) continue
    const bloco = blocos.get(h.trilha.id) ?? { nome: h.trilha.nome, itens: [] }
    bloco.itens.push(h)
    blocos.set(h.trilha.id, bloco)
  }

  const tentativa = numerarTentativas(historico)
  const progressoPorTrilha = new Map(trilhas.map((t) => [t.trilhaId, t]))

  return (
    <div className="mt-4 space-y-6">
      {historico.length > 1 && (
        <div className="-mb-2 flex justify-end">
          <SeletorDeOrdem ordem={ordem} aoMudar={setOrdem} />
        </div>
      )}
      {[...blocos].map(([trilhaId, bloco]) => {
        const progresso = progressoPorTrilha.get(trilhaId)
        const itens = emOrdem(bloco.itens)
        return (
          <section key={trilhaId}>
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
              <span className="grid h-7 w-7 place-items-center rounded-xl bg-violet-200 text-violet-800">
                <Milestone className="h-3.5 w-3.5" />
              </span>
              <h2 className="min-w-0 truncate text-sm font-extrabold text-neutral-900">
                <span className="font-bold text-violet-700">Trilha · </span>
                {bloco.nome}
              </h2>
              {progresso && (
                <span className="text-xs font-medium text-neutral-400">
                  {progresso.concluidas}/{progresso.total} etapas
                  {progresso.status === 'pausada' ? ' · pausada' : ''}
                </span>
              )}
              {/* Sem progresso = o aluno já saiu desta trilha; a página dela não teria o que mostrar. */}
              {progresso && (
                <Link
                  to={`/alunos/${alunoId}/trilhas/${trilhaId}`}
                  className="ml-auto text-xs font-bold text-violet-700 hover:underline"
                >
                  Ver trilha
                </Link>
              )}
            </div>
            <div className="divide-y divide-neutral-100 overflow-hidden rounded-3xl border-l-4 border-violet-300 bg-white">
              {itens.map((h) => (
                <LinhaDaTarefa
                  key={h.atribuicaoId}
                  h={h}
                  alunoId={alunoId}
                  tentativa={tentativa.get(h.atribuicaoId) ?? 1}
                />
              ))}
            </div>
          </section>
        )
      })}

      {avulsas.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-neutral-200 text-neutral-700">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-extrabold text-neutral-900">Atividades avulsas</h2>
            <span className="text-xs font-medium text-neutral-400">enviadas fora de trilha</span>
          </div>
          <div className="divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
            {avulsas.map((h) => (
              <LinhaDaTarefa
                key={h.atribuicaoId}
                h={h}
                alunoId={alunoId}
                tentativa={tentativa.get(h.atribuicaoId) ?? 1}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Tentativa de cada envio contada no bloco dele: por atividade entre as
 * avulsas, por etapa dentro de cada trilha. Do mais antigo para o mais novo,
 * então o primeiro envio é sempre o 1.
 */
function numerarTentativas(historico: ItemHistoricoAluno[]): Map<string, number> {
  const contagem = new Map<string, number>()
  const resultado = new Map<string, number>()
  for (const h of historico.toSorted((a, b) => a.enviadaEm.localeCompare(b.enviadaEm))) {
    const chave = h.trilha ? `trilha|${h.trilha.id}|${h.trilha.etapa}` : `avulsa|${h.atividadeId}`
    const n = (contagem.get(chave) ?? 0) + 1
    contagem.set(chave, n)
    resultado.set(h.atribuicaoId, n)
  }
  return resultado
}

function LinhaDaTarefa({
  h,
  alunoId,
  tentativa,
}: {
  h: ItemHistoricoAluno
  alunoId: string
  tentativa: number
}) {
  const conteudo = (
    <>
      {h.trilha && (
        <span
          title={`Etapa ${h.trilha.etapa}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-100 text-xs font-extrabold text-violet-800"
        >
          {h.trilha.etapa}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-neutral-800">
          {h.atividadeTitulo}
          {tentativa > 1 && <span className="ml-1 text-xs font-medium text-neutral-400">tentativa {tentativa}</span>}
        </p>
        <p className="text-xs text-neutral-400">
          {h.trilha ? `Etapa ${h.trilha.etapa} · ` : ''}
          {h.nivel}
        </p>
      </div>
      {h.concluidaEm ? (
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800">
          {h.acertos}/{h.total}
        </span>
      ) : (
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">pendente</span>
      )}
    </>
  )
  // O botão de link só entra nas pendentes: numa tarefa já concluída a linha
  // inteira é um atalho para o resultado, e reabrir o link só serviria para o
  // aluno reler o gabarito. A lixeira fica FORA do link, senão o clique de
  // apagar abriria o resultado.
  return h.concluidaEm ? (
    <div className="flex items-center gap-1 pr-3 transition hover:bg-neutral-50">
      <Link
        to={`/resultados/${h.atribuicaoId}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-5 text-sm"
      >
        {conteudo}
      </Link>
      <BotaoApagarTarefa atribuicaoId={h.atribuicaoId} alunoId={alunoId} concluida />
    </div>
  ) : (
    <div className="flex items-center gap-3 py-3.5 pr-3 pl-5 text-sm">
      {conteudo}
      <BotaoLinkDaTarefa atribuicaoId={h.atribuicaoId} alunoId={alunoId} />
      <BotaoApagarTarefa atribuicaoId={h.atribuicaoId} alunoId={alunoId} />
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

/**
 * Recupera o link de uma tarefa pendente.
 *
 * O rótulo muda conforme o que o botão realmente vai fazer, em vez de dizer
 * sempre "copiar": o banco guarda só o hash do token (RNF-09), então o link
 * original só existe se ESTE navegador presenciou o envio. Sem ele, a única
 * saída é emitir outro — e isso derruba o anterior, que é o oposto de copiar.
 * Por isso o segundo caminho pede confirmação antes.
 */
function BotaoLinkDaTarefa({ atribuicaoId, alunoId }: { atribuicaoId: string; alunoId: string }) {
  const regerar = useRegerarLinkDaTarefa(alunoId)
  const [link, setLink] = useState(() => linkLembrado(atribuicaoId))
  const [copiado, setCopiado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  async function copiar(valor: string) {
    await navigator.clipboard.writeText(valor)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (link) {
    return (
      <button
        onClick={() => copiar(link)}
        title="Copiar o link enviado a este aluno"
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-600 transition hover:bg-neutral-50"
      >
        {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copiado ? 'Copiado' : 'Copiar link'}
      </button>
    )
  }

  if (confirmando) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="hidden text-xs font-medium text-neutral-400 sm:inline">
          Derruba o link anterior.
        </span>
        <button
          onClick={async () => {
            const novo = await regerar.mutateAsync(atribuicaoId)
            setLink(novo)
            setConfirmando(false)
            await copiar(novo)
          }}
          disabled={regerar.isPending}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {regerar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Confirmar
        </button>
        <button
          onClick={() => setConfirmando(false)}
          className="rounded-full px-2 py-1.5 text-xs font-bold text-neutral-500"
        >
          Cancelar
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      title="Este navegador não guardou o link deste envio — só é possível emitir um novo"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-600 transition hover:bg-neutral-50"
    >
      <RefreshCw className="h-3.5 w-3.5" /> Gerar novo link
    </button>
  )
}

/**
 * A trilha na ficha do aluno: o cartão leva ao progresso dele, e a lixeira
 * tira a trilha DELE — a trilha continua existindo para os outros alunos.
 */
function CartaoTrilha({ alunoId, trilha }: { alunoId: string; trilha: TrilhaNaFicha }) {
  const remover = useRemoverAlunoDaTrilha(trilha.trilhaId)
  return (
    <div className="flex items-center gap-1 rounded-3xl bg-violet-200 pr-2 transition hover:shadow-sm">
      <Link
        to={`/alunos/${alunoId}/trilhas/${trilha.trilhaId}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-4"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-violet-700">
          <Milestone className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-neutral-900">{trilha.nome}</span>
          <span className="block text-xs font-medium text-violet-900/70">
            {trilha.status === 'pausada' ? 'pausada · ' : ''}
            {trilha.concluidas}/{trilha.total} etapas
          </span>
        </span>
      </Link>
      {/*
        A confirmação diz o que fica: sem isso, o professor não tira a trilha
        com medo de perder as notas das etapas que o aluno já fez.
      */}
      <BotaoApagar
        titulo="Tirar a trilha deste aluno"
        confirmacao={trilha.concluidas > 0 ? 'Tirar? As notas ficam' : 'Tirar a trilha?'}
        pendente={remover.isPending}
        aoConfirmar={() => remover.mutate(alunoId)}
      />
    </div>
  )
}

/** Apaga UMA tarefa do aluno — ver `useApagarTarefaDoAluno`. */
function BotaoApagarTarefa({
  atribuicaoId,
  alunoId,
  concluida = false,
}: {
  atribuicaoId: string
  alunoId: string
  concluida?: boolean
}) {
  const apagar = useApagarTarefaDoAluno(alunoId)
  return (
    <BotaoApagar
      titulo={concluida ? 'Apagar a tarefa e o resultado' : 'Apagar a tarefa — o link para de funcionar'}
      // Numa concluída, o que se perde é a nota: é isso que tem de aparecer.
      confirmacao={concluida ? 'Apagar com a nota?' : 'Apagar?'}
      pendente={apagar.isPending}
      aoConfirmar={() => apagar.mutate(atribuicaoId)}
    />
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
