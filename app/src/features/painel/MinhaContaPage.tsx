import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, CreditCard, KeyRound, Loader2, LogOut, Milestone, Search } from 'lucide-react'
import { useAlunoAuth } from '@/features/aluno-auth/AlunoAuthProvider'
import {
  type AssinaturaDoAluno,
  useAbrirCartoes,
  useCancelarAssinatura,
  useDefinirSenha,
  useManterAssinatura,
  useMinhaConta,
} from './contaApi'

const MOTIVOS = [
  { id: 'caro', rotulo: 'Ficou caro' },
  { id: 'sem_tempo', rotulo: 'Estou sem tempo' },
  { id: 'terminei', rotulo: 'Terminei a trilha' },
  { id: 'nao_gostei', rotulo: 'Não gostei' },
  { id: 'outro', rotulo: 'Outro motivo' },
]

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * /painel/conta — "Minha conta" (docs/TUTOR-TRILHAS.md §6.2): assinaturas de
 * todos os professores, cartões e recibos, trilhas à venda dos professores do
 * aluno e a senha.
 */
export function MinhaContaPage() {
  const { sair } = useAlunoAuth()
  const { data: conta, isLoading, error } = useMinhaConta()
  const cartoes = useAbrirCartoes()
  const [busca, setBusca] = useState('')

  return (
    <div className="min-h-dvh bg-areia px-5 pb-16 pt-6">
      <div className="mx-auto max-w-sm">
        <Link to="/painel" className="flex items-center gap-1 text-sm font-bold text-neutral-500">
          <ChevronLeft className="h-4 w-4" /> Painel
        </Link>
        <h1 className="mt-3 text-xl font-extrabold">Minha conta</h1>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : error || !conta ? (
          <p className="mt-4 rounded-3xl bg-white px-4 py-5 text-sm text-neutral-500">{error?.message ?? 'Não consegui carregar.'}</p>
        ) : (
          <>
            <p className="text-xs font-medium text-neutral-500">{conta.email}</p>

            <Titulo>Assinaturas</Titulo>
            {conta.assinaturas.length === 0 ? (
              <p className="rounded-3xl bg-white px-4 py-5 text-center text-sm text-neutral-400">Você não assina nenhum plano.</p>
            ) : (
              <div className="space-y-2">
                {conta.assinaturas.map((a) => (
                  <CartaoAssinatura key={a.id} a={a} />
                ))}
              </div>
            )}

            <Titulo>Pagamento</Titulo>
            <button
              type="button"
              onClick={() => cartoes.mutate()}
              disabled={!conta.temCartao || cartoes.isPending}
              className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left disabled:opacity-50"
            >
              <CreditCard className="h-5 w-5 text-neutral-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Cartões e recibos</span>
                <span className="block text-xs text-neutral-500">
                  {conta.temCartao ? 'Trocar ou remover o cartão, ver os recibos' : 'Nenhum cartão cadastrado'}
                </span>
              </span>
              {cartoes.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
            {cartoes.error && <p className="mt-1 text-xs text-rose-600">{cartoes.error.message}</p>}

            {conta.explorar.length > 0 && (
              <>
                <Titulo>Trilhas dos seus professores</Titulo>
                {conta.explorar.length > 3 && (
                  <label className="mb-2 flex items-center gap-2 rounded-2xl bg-white px-3 py-2">
                    <Search className="h-4 w-4 text-neutral-400" />
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar trilha ou professor"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </label>
                )}
                <div className="space-y-2">
                  {conta.explorar
                    .filter((p) => `${p.nome} ${p.professorNome} ${p.trilhas.map((t) => t.nome).join(' ')}`.toLowerCase().includes(busca.toLowerCase()))
                    .map((p) => (
                      <Link key={p.slug} to={`/p/${p.slug}`} className="block rounded-3xl bg-white p-4">
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-extrabold">{p.nome}</span>
                          {p.assinado && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">assinado</span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          com {p.professorNome} · {reais(p.precoCentavos)}/mês · {p.praticasMes} práticas
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1">
                          {p.trilhas.map((t) => (
                            <span key={t.nome} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800">
                              <Milestone className="h-3 w-3" /> {t.nome}
                            </span>
                          ))}
                        </span>
                      </Link>
                    ))}
                </div>
              </>
            )}

            <Titulo>Dados</Titulo>
            <Senha />
            <button
              type="button"
              onClick={() => void sair()}
              className="mt-2 flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left text-sm font-bold text-neutral-700"
            >
              <LogOut className="h-5 w-5 text-neutral-500" /> Sair
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 text-xs font-extrabold uppercase tracking-wider text-neutral-400">{children}</h2>
}

function CartaoAssinatura({ a }: { a: AssinaturaDoAluno }) {
  const cancelar = useCancelarAssinatura()
  const manter = useManterAssinatura()
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const encerrada = a.status === 'encerrada'

  const situacao = encerrada
    ? a.motivoEncerramento === 'pagamento_recusado'
      ? `Encerrada · o pagamento de ${data(a.encerradaEm ?? a.periodoFim)} não foi aprovado`
      : `Encerrada em ${data(a.encerradaEm ?? a.periodoFim)}`
    : a.cancelaNoFim
      ? `Termina em ${data(a.periodoFim)}`
      : a.contratadaPeloProfessor
        ? `Contratada por ${a.professorNome} · renova em ${data(a.periodoFim)}`
        : `Ativa · próxima cobrança em ${data(a.periodoFim)}`

  return (
    <div className={`rounded-3xl p-4 ${encerrada ? 'bg-neutral-100' : 'bg-white'}`}>
      <p className="font-extrabold">{a.planoNome}</p>
      <p className="text-xs text-neutral-500">
        com {a.professorNome}
        {!a.contratadaPeloProfessor && ` · ${reais(a.precoCentavos)}/mês`}
      </p>
      <p className={`mt-1 text-xs font-bold ${encerrada ? 'text-neutral-500' : a.cancelaNoFim ? 'text-amber-700' : 'text-emerald-700'}`}>{situacao}</p>
      {!encerrada && a.praticasUsadas !== null && (
        <p className="mt-1 text-xs text-neutral-500">
          {a.praticasUsadas} de {a.praticas} práticas usadas neste mês
        </p>
      )}

      {encerrada && a.slug && (
        <Link to={`/p/${a.slug}`} className="mt-3 inline-block rounded-full bg-neutral-900 px-4 py-2 text-xs font-extrabold text-white">
          Assinar de novo
        </Link>
      )}
      {!encerrada && a.contratadaPeloProfessor && <p className="mt-2 text-xs text-neutral-400">Para mudar algo, fale com seu professor.</p>}
      {!encerrada && !a.contratadaPeloProfessor && a.cancelaNoFim && (
        <button
          type="button"
          onClick={() => manter.mutate(a.id)}
          disabled={manter.isPending}
          className="mt-3 rounded-full bg-neutral-900 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
        >
          Manter assinatura
        </button>
      )}
      {!encerrada && !a.contratadaPeloProfessor && !a.cancelaNoFim && !cancelando && (
        <button type="button" onClick={() => setCancelando(true)} className="mt-3 text-xs font-bold text-neutral-500 underline">
          Cancelar assinatura
        </button>
      )}

      {cancelando && (
        <div className="mt-3 rounded-2xl bg-neutral-50 p-3">
          <p className="text-xs text-neutral-600">
            Você continua com acesso até {data(a.periodoFim)}, e não há nova cobrança. Seu progresso fica guardado: dá para
            assinar de novo e voltar de onde parou.
          </p>
          <p className="mt-2 text-xs font-bold text-neutral-700">Por que está cancelando? (opcional)</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMotivo(m.id === motivo ? '' : m.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${motivo === m.id ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600'}`}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => cancelar.mutate({ assinaturaId: a.id, motivo }, { onSuccess: () => setCancelando(false) })}
              disabled={cancelar.isPending}
              className="rounded-full bg-rose-600 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
            >
              Cancelar assinatura
            </button>
            <button type="button" onClick={() => setCancelando(false)} className="rounded-full px-4 py-2 text-xs font-bold text-neutral-600">
              Voltar
            </button>
          </div>
          {cancelar.error && <p className="mt-2 text-xs text-rose-600">{cancelar.error.message}</p>}
        </div>
      )}
    </div>
  )
}

function Senha() {
  const definir = useDefinirSenha()
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState('')

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left">
        <KeyRound className="h-5 w-5 text-neutral-500" />
        <span>
          <span className="block text-sm font-bold">{definir.isSuccess ? 'Senha salva' : 'Criar ou trocar a senha'}</span>
          <span className="block text-xs text-neutral-500">Para entrar de outro aparelho com seu e-mail</span>
        </span>
      </button>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        definir.mutate(senha, { onSuccess: () => { setAberto(false); setSenha('') } })
      }}
      className="rounded-3xl bg-white p-4"
    >
      <label className="block text-sm font-bold">
        Senha nova
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          className="mt-1 block w-full rounded-xl border border-neutral-200 px-3 py-2 font-normal"
        />
      </label>
      {definir.error && <p className="mt-2 text-xs text-rose-600">{definir.error.message}</p>}
      <button
        type="submit"
        disabled={senha.length < 6 || definir.isPending}
        className="mt-3 rounded-full bg-neutral-900 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40"
      >
        Salvar senha
      </button>
    </form>
  )
}
