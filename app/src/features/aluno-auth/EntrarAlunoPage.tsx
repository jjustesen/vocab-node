import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, Loader2 } from 'lucide-react'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { consumirMotivoDaSaida } from '@/lib/motivo-saida'
import { useAlunoAuth } from './AlunoAuthProvider'

/** /entrar-aluno — login do aluno com conta (RF-28), sessão isolada da do professor. */
export function EntrarAlunoPage() {
  const navigate = useNavigate()
  const { session, carregando: carregandoSessao } = useAlunoAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  // Lido uma vez, na montagem: o painel deixa o motivo aqui quando a sessão era
  // válida mas não era de aluno. Sem isto a pessoa é devolvida ao login sem
  // nenhuma explicação, que foi exatamente o que aconteceu no primeiro teste.
  const [erro, setErro] = useState(() => {
    const motivo = consumirMotivoDaSaida()
    if (motivo === 'conta-de-professor') return 'Essa conta é de professor. Entre pela área do professor, no link abaixo.'
    if (motivo === 'sessao-expirada') return 'Sua sessão expirou. Entre de novo com seu e-mail e senha.'
    return ''
  })
  const [entrando, setEntrando] = useState(false)
  // "Esqueci minha senha": o mesmo cartão pede só o e-mail. `?recuperar` abre
  // direto nele (o link vencido da tela de senha nova manda para cá).
  const [params] = useSearchParams()
  const [recuperando, setRecuperando] = useState(() => params.has('recuperar'))
  const [aviso, setAviso] = useState('')

  if (!carregandoSessao && session) return <Navigate to="/painel" replace />

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    setEntrando(true)
    const { error } = await supabaseAluno.auth.signInWithPassword({ email, password: senha })
    setEntrando(false)
    if (error) return setErro('E-mail ou senha incorretos.')
    navigate('/painel')
  }

  async function pedirLink(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')
    setEntrando(true)
    const { error } = await supabaseAluno.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha-aluno`,
    })
    setEntrando(false)
    if (error) {
      return setErro(
        error.status === 429 ? 'Muitos pedidos seguidos. Espere um minuto e tente de novo.' : 'Não consegui enviar o e-mail. Tente de novo.',
      )
    }
    // Mesma resposta com ou sem conta: dizer "esse e-mail não existe"
    // entregaria quem é aluno da plataforma.
    setAviso(`Se ${email.trim()} tiver conta, o link para criar uma senha nova chega em alguns minutos. Abra no mesmo aparelho e confira o spam.`)
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-areia px-4">
      <form onSubmit={recuperando ? pedirLink : entrar} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-lg">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-indigo-100 text-indigo-700">
          <GraduationCap className="h-6 w-6" />
        </span>
        <h1 className="mt-3 text-center text-lg font-extrabold text-neutral-900">
          {recuperando ? 'Criar uma senha nova' : 'Entrar como aluno'}
        </h1>
        <p className="mt-1 text-center text-xs text-neutral-400">
          {recuperando ? 'Mandamos um link para o seu e-mail' : 'Para ver suas tarefas e seu progresso'}
        </p>

        {erro && (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{erro}</p>
        )}

        <label className="mt-4 block">
          <span className="text-xs font-bold text-neutral-600">E-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={entrando}
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        {aviso && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">{aviso}</p>}

        {!recuperando && (
        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">Senha</span>
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={entrando}
            className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        )}

        <button
          type="submit"
          disabled={entrando}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          {entrando && <Loader2 className="h-4 w-4 animate-spin" />}
          {recuperando ? 'Enviar o link' : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={() => {
            setRecuperando(!recuperando)
            setErro('')
            setAviso('')
          }}
          className="mt-3 w-full text-center text-xs font-bold text-neutral-500 underline"
        >
          {recuperando ? 'Voltar para entrar' : 'Esqueci minha senha'}
        </button>

        {/* Volta para o login do professor — sem isto, quem cai aqui por
            engano fica sem saída visível. */}
        <p className="mt-5 text-center text-xs text-neutral-400">
          É professor?{' '}
          <Link to="/entrar-professor" className="mt-2 flex w-full items-center justify-center rounded-full border border-neutral-300 py-3 text-sm font-bold text-violet-700">
            Entrar como professor
          </Link>
        </p>
      </form>
    </div>
  )
}
