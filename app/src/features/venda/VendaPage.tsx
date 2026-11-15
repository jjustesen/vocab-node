import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookOpen, Check, FileText, Loader2, Mic, Milestone, PenLine } from 'lucide-react'
import { useAlunoAuth } from '@/features/aluno-auth/AlunoAuthProvider'
import { reais, useAbrirCheckout, usePlanoAVenda } from './api'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * /p/:slug — a página de venda de um plano (docs/TUTOR-TRILHAS.md §6, §6.1).
 * Pública. Sem login: nome e e-mail, e a compra cria a conta. Logado:
 * "Assinando como…" e um toque até o pagamento.
 */
export function VendaPage() {
  const { slug } = useParams<{ slug: string }>()
  const { session, carregando, sair } = useAlunoAuth()
  const { data, isLoading, error } = usePlanoAVenda(slug, Boolean(session))
  const checkout = useAbrirCheckout()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [conferindo, setConferindo] = useState(false)

  if (isLoading || carregando) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <p className="max-w-xs font-bold text-neutral-700">{error?.message ?? 'Não encontrei este plano.'}</p>
      </div>
    )
  }

  const { plano } = data
  const emailValido = EMAIL.test(email.trim())
  const podePagar = data.usuario || (nome.trim() && emailValido)

  function pagar(e: React.FormEvent) {
    e.preventDefault()
    if (!slug || !podePagar) return
    // E-mail digitado errado = pagou e não recebe nada: confirma antes (§6).
    if (!data!.usuario && !conferindo) {
      setConferindo(true)
      return
    }
    checkout.mutate(data!.usuario ? { slug } : { slug, nome: nome.trim(), email: email.trim().toLowerCase() })
  }

  return (
    <div className="min-h-dvh bg-areia px-5 pb-12 pt-8">
      <div className="mx-auto max-w-md">
        {!data.usuario && (
          <p className="mb-4 text-right text-xs font-medium text-neutral-500">
            Já tem conta?{' '}
            <Link to="/entrar-aluno" className="font-bold text-neutral-800 underline">
              Entrar
            </Link>
          </p>
        )}

        <div className="relative overflow-hidden rounded-3xl bg-violet-200 p-6">
          <span className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-violet-300/60" />
          <p className="relative text-xs font-bold text-violet-900/70">com {data.professorNome}</p>
          <h1 className="relative mt-1 text-2xl font-extrabold text-neutral-900">{plano.nome}</h1>
          {plano.descricao && <p className="relative mt-2 text-sm text-violet-950/80">{plano.descricao}</p>}
          <p className="relative mt-4">
            <span className="text-3xl font-extrabold text-neutral-900">{reais(plano.precoCentavos)}</span>
            <span className="text-sm font-semibold text-violet-900/70"> por mês</span>
          </p>
          <ul className="relative mt-3 space-y-1 text-sm font-medium text-neutral-800">
            <li className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-violet-700" /> {plano.praticasMes} práticas de conversação com o tutor por mês
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-violet-700" /> Cancele quando quiser. O acesso vai até o fim do mês pago.
            </li>
          </ul>
        </div>

        <h2 className="mb-2 mt-6 text-xs font-extrabold uppercase tracking-wider text-neutral-400">O que vem no plano</h2>
        <div className="space-y-2">
          {data.trilhas.map((t) => (
            <div key={t.nome} className="rounded-3xl bg-white p-4">
              <p className="flex items-center gap-2 font-extrabold">
                <Milestone className="h-4 w-4 text-violet-600" /> {t.nome}
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-extrabold text-indigo-700">{t.nivel}</span>
              </p>
              {t.descricao && <p className="mt-1 text-sm text-neutral-500">{t.descricao}</p>}
              <p className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-neutral-500">
                {t.materiais > 0 && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {t.materiais} materiais
                  </span>
                )}
                {t.atividades > 0 && (
                  <span className="flex items-center gap-1">
                    <PenLine className="h-3.5 w-3.5" /> {t.atividades} atividades
                  </span>
                )}
                {t.licoes > 0 && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" /> {t.licoes} lições com o tutor
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>

        {data.jaAssina ? (
          <Link to="/painel" className="mt-6 block rounded-full bg-neutral-900 py-3.5 text-center text-sm font-extrabold text-white">
            Você já assina. Abrir meu painel
          </Link>
        ) : !plano.aceitando ? (
          <p className="mt-6 rounded-3xl bg-white px-5 py-4 text-center text-sm font-medium text-neutral-500">
            Este plano não está aceitando novas assinaturas agora.
          </p>
        ) : (
          <form onSubmit={pagar} className="mt-6 rounded-3xl bg-white p-5">
            {data.usuario ? (
              <p className="text-sm text-neutral-600">
                Assinando como <strong>{data.usuario.nome || data.usuario.email}</strong>.{' '}
                {/* Celular compartilhado: assinar na conta errada é fácil (§6.1). */}
                <button type="button" onClick={() => void sair()} className="font-bold underline">
                  Não é você?
                </button>
              </p>
            ) : conferindo ? (
              <div>
                <p className="text-sm text-neutral-600">Confira seu e-mail. É por ele que você entra depois:</p>
                <p className="mt-1 break-all text-lg font-extrabold">{email.trim().toLowerCase()}</p>
                <button type="button" onClick={() => setConferindo(false)} className="mt-1 text-xs font-bold text-neutral-500 underline">
                  Corrigir
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-bold">
                  Seu nome
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    autoComplete="name"
                    className="mt-1 block w-full rounded-xl border border-neutral-200 px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  E-mail
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    className="mt-1 block w-full rounded-xl border border-neutral-200 px-3 py-2.5 font-normal"
                  />
                </label>
              </div>
            )}
            {checkout.error && <p className="mt-3 text-sm font-medium text-rose-600">{checkout.error.message}</p>}
            <button
              type="submit"
              disabled={!podePagar || checkout.isPending}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {checkout.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {conferindo || data.usuario ? `Assinar por ${reais(plano.precoCentavos)}/mês` : 'Continuar'}
            </button>
            <p className="mt-2 text-center text-[11px] text-neutral-400">Pagamento seguro pelo Stripe.</p>
          </form>
        )}
      </div>
    </div>
  )
}
