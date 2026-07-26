import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bell, CheckCircle2, Clock, MessageCircle, Pencil, Sparkles } from 'lucide-react'
import { BotaoNovaAtividade } from '@/features/atividades/BotaoNovaAtividade'
import { useAlunos } from '@/features/alunos/api'
import { useAuth } from '@/features/auth/AuthProvider'
import { useAulasEntre } from '@/features/aulas/api'
import { ModalAula } from '@/features/aulas/AbaAulas'
import { useUsoDoMes } from '@/features/planos/api'
import { useAtribuicoesPendentes, useConcluidasRecentes, useContagemConcluidasHoje } from './api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import { linkWhatsapp } from '@/lib/whatsapp'
import type { AulaComAluno } from '@/features/aulas/api'

function limitesDoDia(data: Date): { inicioISO: string; fimISO: string } {
  const inicio = new Date(data)
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 1)
  return { inicioISO: inicio.toISOString(), fimISO: fim.toISOString() }
}

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** "hoje" / "há 1 dia" / "há 5 dias" — o professor só precisa da ordem de grandeza. */
function tempoDesde(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

export function HojePage() {
  const { session } = useAuth()
  const { data: alunos } = useAlunos('ativo')
  const { inicioISO, fimISO } = limitesDoDia(new Date())
  const { data: aulasDeHoje } = useAulasEntre(inicioISO, fimISO)
  const { data: uso } = useUsoDoMes()
  const { data: pendentes } = useAtribuicoesPendentes()
  const { data: concluidas } = useConcluidasRecentes()
  const { data: concluidasHoje } = useContagemConcluidasHoje(inicioISO, fimISO)

  const nome = ((session?.user.user_metadata.nome as string | undefined) ?? '').split(' ')[0]
  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // O nível vem da ficha do aluno, não da aula — aproveitamos a lista já carregada.
  const nivelPorAluno = new Map((alunos ?? []).map((a) => [a.id, a.nivel_cefr]))

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{saudacao()}{nome && `, ${nome}`}</h1>
          <p className="text-sm text-neutral-500 first-letter:uppercase">{hoje}</p>
        </div>
        <BotaoNovaAtividade />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Contador valor={alunos?.length ?? 0} rotulo="alunos" cor="bg-white text-neutral-900" corRotulo="text-neutral-500" />
        <Contador
          valor={pendentes?.length ?? 0}
          rotulo="aguardando"
          cor="bg-amber-100 text-amber-900"
          corRotulo="text-amber-700"
        />
        <Contador
          valor={concluidasHoje ?? 0}
          rotulo="concluídas hoje"
          cor="bg-emerald-100 text-emerald-900"
          corRotulo="text-emerald-700"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Coluna titulo="Aulas de hoje" Icone={Clock}>
          {aulasDeHoje && aulasDeHoje.length > 0 ? (
            <>
              <ProximaAula aula={aulasDeHoje[0]} nivel={nivelPorAluno.get(aulasDeHoje[0].aluno_id) ?? null} />
              {aulasDeHoje.slice(1).map((a) => (
                <Link
                  key={a.id}
                  to={`/alunos/${a.aluno_id}`}
                  className="flex shrink-0 items-center gap-3 rounded-3xl bg-white p-4 transition hover:bg-neutral-50"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${corDoAvatar(a.aluno_id)}`}
                  >
                    {inicial(a.alunoNome)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-neutral-900">{a.alunoNome}</p>
                    <p className="text-xs text-neutral-400">
                      {horaDe(a.data_hora)} · {a.duracao_min} min
                      {nivelPorAluno.get(a.aluno_id) && ` · ${nivelPorAluno.get(a.aluno_id)}`}
                    </p>
                  </div>
                </Link>
              ))}
              <EspacoVago texto="Horário vago" soDesktop />
            </>
          ) : (
            <EspacoVago texto="Nenhuma aula agendada para hoje." />
          )}
        </Coluna>

        <Coluna titulo="Aguardando resposta" Icone={Bell}>
          {pendentes && pendentes.length > 0 ? (
            <div className="flex-1 space-y-3.5 overflow-y-auto rounded-3xl bg-white p-5">
              {pendentes.slice(0, 5).map((p) => (
                <div key={p.atribuicaoId} className="flex items-center gap-2 text-sm">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${corDoAvatar(p.alunoId)}`}
                  >
                    {inicial(p.alunoNome)}
                  </span>
                  <Link to={`/alunos/${p.alunoId}`} className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-bold text-neutral-900">
                      {p.alunoNome.split(' ')[0]}
                    </span>
                    <span className="block truncate text-xs text-neutral-400">
                      {p.atividadeTitulo} · {tempoDesde(p.enviadaEm)}
                    </span>
                  </Link>
                  <a
                    href={linkWhatsapp(
                      `Oi ${p.alunoNome.split(' ')[0]}! Passando pra lembrar da atividade "${p.atividadeTitulo}" 🙂`,
                      p.alunoTelefone,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    title="Cobrar no WhatsApp"
                    className="shrink-0 rounded-full bg-emerald-100 p-2 text-emerald-800 transition hover:bg-emerald-200"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </div>
              ))}
              {pendentes.length > 5 && (
                <p className="pt-1 text-xs font-medium text-neutral-400">
                  e mais {pendentes.length - 5} aguardando
                </p>
              )}
            </div>
          ) : (
            <CartaoVazioEsticado texto="Nenhuma tarefa pendente." />
          )}
        </Coluna>

        <Coluna titulo="Concluídas" Icone={CheckCircle2}>
          {concluidas && concluidas.length > 0 ? (
            <div className="flex-1 space-y-3.5 overflow-y-auto rounded-3xl bg-white p-5">
              {concluidas.map((c) => (
                <Link
                  key={c.atribuicaoId}
                  to={`/resultados/${c.atribuicaoId}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${corDoAvatar(c.alunoId)}`}
                  >
                    {inicial(c.alunoNome)}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-bold text-neutral-900">
                      {c.alunoNome.split(' ')[0]}
                    </span>
                    <span className="block truncate text-xs text-neutral-400">{c.atividadeTitulo}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${corDoPlacar(c.acertos, c.total)}`}
                  >
                    {c.acertos}/{c.total}
                  </span>
                </Link>
              ))}
              <Link
                to="/atividades"
                className="flex items-center gap-1 pt-1 text-xs font-bold text-violet-700"
              >
                Ver todos os resultados <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <CartaoVazioEsticado texto="Nada concluído ainda." />
          )}
        </Coluna>
      </div>

      {uso && (
        <div className="mt-4 rounded-3xl bg-white p-5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            <h2 className="text-sm font-bold text-neutral-900">
              Plano {uso.plano === 'pro' ? 'pago' : 'gratuito'}
            </h2>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {uso.limiteAlunos !== null && (
              <BarraDeUso rotulo="Alunos" usado={uso.alunosAtivos} limite={uso.limiteAlunos} />
            )}
            <BarraDeUso rotulo="Gerações por IA este mês" usado={uso.geracoesDoMes} limite={uso.limiteGeracoes} />
          </div>
        </div>
      )}

      {alunos?.length === 0 && (
        <div className="mt-6 rounded-3xl bg-violet-200 p-6">
          <h2 className="text-lg font-extrabold">Comece por aqui</h2>
          <p className="mt-1 max-w-md text-sm text-violet-900/70">
            Cadastre seu primeiro aluno. Depois é só criar uma atividade e mandar o link pelo
            WhatsApp — o aluno responde sem instalar nada.
          </p>
          <Link
            to="/alunos"
            className="mt-4 inline-block rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white"
          >
            Cadastrar aluno
          </Link>
        </div>
      )}
    </div>
  )
}

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function corDoPlacar(acertos: number, total: number): string {
  if (total === 0) return 'bg-neutral-100 text-neutral-500'
  const percentual = acertos / total
  if (percentual >= 0.7) return 'bg-emerald-100 text-emerald-800'
  if (percentual >= 0.5) return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-700'
}

function Contador({
  valor,
  rotulo,
  cor,
  corRotulo,
}: {
  valor: number
  rotulo: string
  cor: string
  corRotulo: string
}) {
  return (
    <div className={`rounded-3xl px-6 py-4 text-center ${cor}`}>
      <p className="text-2xl font-extrabold">{valor}</p>
      <p className={`text-xs font-medium ${corRotulo}`}>{rotulo}</p>
    </div>
  )
}

function Coluna({
  titulo,
  Icone,
  children,
}: {
  titulo: string
  Icone: typeof Clock
  children: React.ReactNode
}) {
  return (
    // min-w-0: sem isso o item de grid assume min-width:auto e um título de
    // atividade comprido estica a coluna, furando a largura da tela no celular.
    <section className="flex min-w-0 flex-col">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-neutral-900">
        <Icone className="h-4 w-4" /> {titulo}
      </h2>
      {/* Altura fixa só no desktop, onde as três colunas ficam lado a lado e
          precisam terminar alinhadas (345px = a de "Concluídas" cheia). No
          celular elas são empilhadas, então cada uma cresce com o conteúdo. */}
      <div className="flex flex-col gap-3 lg:h-[345px]">{children}</div>
    </section>
  )
}

/** A próxima aula do dia ganha o card lilás de destaque, com atalho para anotar. */
function ProximaAula({ aula, nivel }: { aula: AulaComAluno; nivel: string | null }) {
  const [anotando, setAnotando] = useState(false)

  return (
    <div className="rounded-3xl bg-violet-200 p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-sm font-extrabold text-violet-700">
          {inicial(aula.alunoNome)}
        </span>
        <div className="min-w-0">
          <Link to={`/alunos/${aula.aluno_id}`} className="block truncate font-bold text-neutral-900">
            {aula.alunoNome}
          </Link>
          <p className="text-xs text-violet-800">
            {horaDe(aula.data_hora)} · {aula.duracao_min} min{nivel && ` · ${nivel}`}
          </p>
        </div>
      </div>
      <button
        onClick={() => setAnotando(true)}
        className="mt-4 flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
      >
        <Pencil className="h-3.5 w-3.5" /> Anotar aula
      </button>

      {anotando && <ModalAula aula={aula} alunoId={aula.aluno_id} aoFechar={() => setAnotando(false)} />}
    </div>
  )
}

/** Card branco que estica até o fim da coluna, para as três terminarem juntas. */
function CartaoVazioEsticado({ texto }: { texto: string }) {
  return (
    <div className="grid flex-1 place-items-center rounded-3xl bg-white p-5">
      <p className="text-sm text-neutral-400">{texto}</p>
    </div>
  )
}

/**
 * Preenche a sobra da coluna de aulas. Com `soDesktop` ele só aparece onde as
 * colunas dividem a mesma linha — no celular, empilhado, um retângulo tracejado
 * embaixo das aulas seria só ruído.
 */
function EspacoVago({ texto, soDesktop = false }: { texto: string; soDesktop?: boolean }) {
  return (
    <div
      className={`flex-1 place-items-center rounded-3xl border-2 border-dashed border-neutral-200 p-5 ${
        soDesktop ? 'hidden lg:grid' : 'grid'
      }`}
    >
      <p className="text-sm font-medium text-neutral-400">{texto}</p>
    </div>
  )
}

function BarraDeUso({ rotulo, usado, limite }: { rotulo: string; usado: number; limite: number }) {
  const percentual = Math.min(100, Math.round((usado / limite) * 100))
  const noLimite = usado >= limite
  return (
    <div>
      <p className="flex items-baseline justify-between text-xs font-bold text-neutral-600">
        <span>{rotulo}</span>
        <span className={noLimite ? 'text-rose-600' : 'text-neutral-400'}>
          {usado}/{limite}
        </span>
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${noLimite ? 'bg-rose-500' : percentual >= 80 ? 'bg-amber-400' : 'bg-violet-500'}`}
          style={{ width: `${percentual}%` }}
        />
      </div>
    </div>
  )
}
