import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { consultarVolta, type Volta } from './api'

const TENTATIVAS = 30
const INTERVALO_MS = 2000

/**
 * /p/:slug/pronto — a volta do Stripe (docs/TUTOR-TRILHAS.md §6). Quem cria a
 * conta é o webhook: esta página só espera por ele e, se a compra criou a
 * conta agora, entra nela uma vez e leva ao painel.
 */
export function ProntoPage() {
  const { slug } = useParams<{ slug: string }>()
  const [params] = useSearchParams()
  const sessionId = params.get('session_id') ?? ''
  const navegar = useNavigate()
  const [volta, setVolta] = useState<Volta | null>(null)
  const [desistiu, setDesistiu] = useState(false)
  const rodou = useRef(false)

  useEffect(() => {
    if (rodou.current || !sessionId) return
    rodou.current = true
    let cancelado = false
    void (async () => {
      for (let i = 0; i < TENTATIVAS && !cancelado; i++) {
        const v = await consultarVolta(sessionId).catch(() => null)
        if (v?.estado === 'pronto') {
          if (v.tokenHash) {
            const { error } = await supabaseAluno.auth.verifyOtp({ token_hash: v.tokenHash, type: 'magiclink' })
            if (!error) {
              navegar('/painel', { replace: true })
              return
            }
          }
          setVolta(v)
          return
        }
        if (v) setVolta(v)
        await new Promise((ok) => setTimeout(ok, INTERVALO_MS))
      }
      if (!cancelado) setDesistiu(true)
    })()
    return () => {
      cancelado = true
    }
  }, [sessionId, navegar])

  if (volta?.estado === 'pronto') {
    return (
      <Moldura>
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-3 text-xl font-extrabold">Pagamento confirmado</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {volta.planoNome ? `"${volta.planoNome}" já está` : 'A trilha já está'} na sua conta.
          {volta.entrar && ` Entre com ${volta.email}.`}
        </p>
        <Link
          to={volta.entrar ? '/entrar-aluno' : '/painel'}
          className="mt-5 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-extrabold text-white"
        >
          {volta.entrar ? 'Entrar' : 'Abrir meu painel'}
        </Link>
      </Moldura>
    )
  }

  if (desistiu || !sessionId || volta?.estado === 'pendente') {
    return (
      <Moldura>
        <h1 className="text-xl font-extrabold">
          {volta?.estado === 'pendente' ? 'O pagamento ainda não foi confirmado' : 'Ainda confirmando'}
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Se você pagou, a trilha aparece na sua conta em alguns minutos. Pode fechar esta página.
        </p>
        <Link to={`/p/${slug}`} className="mt-5 inline-block text-sm font-bold underline">
          Voltar para o plano
        </Link>
      </Moldura>
    )
  }

  return (
    <Moldura>
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-600" />
      <h1 className="mt-3 text-xl font-extrabold">Preparando sua trilha…</h1>
      <p className="mt-2 text-sm text-neutral-600">Leva só alguns segundos.</p>
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-areia px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center">{children}</div>
    </div>
  )
}
