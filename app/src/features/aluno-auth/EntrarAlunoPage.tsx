import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { GraduationCap, Loader2 } from 'lucide-react'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { useAlunoAuth } from './AlunoAuthProvider'

/** /entrar-aluno — login do aluno com conta (RF-28), sessão isolada da do professor. */
export function EntrarAlunoPage() {
  const navigate = useNavigate()
  const { session, carregando: carregandoSessao } = useAlunoAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

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

  return (
    <div className="grid min-h-dvh place-items-center bg-areia px-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-lg">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-indigo-100 text-indigo-700">
          <GraduationCap className="h-6 w-6" />
        </span>
        <h1 className="mt-3 text-center text-lg font-extrabold text-neutral-900">Entrar</h1>
        <p className="mt-1 text-center text-xs text-neutral-400">Para ver suas tarefas e seu progresso</p>

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

        <button
          type="submit"
          disabled={entrando}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          {entrando && <Loader2 className="h-4 w-4 animate-spin" />}
          Entrar
        </button>
      </form>
    </div>
  )
}
