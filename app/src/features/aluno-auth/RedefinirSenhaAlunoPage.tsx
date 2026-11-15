import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Loader2 } from 'lucide-react'
import { supabaseAluno } from '@/lib/supabase-aluno'

/**
 * /redefinir-senha-aluno — onde cai o link de "esqueci minha senha" do aluno.
 *
 * O link traz `?code=` (fluxo PKCE, ver lib/supabase-aluno.ts). O código só
 * vira sessão no MESMO navegador que pediu o link: é ele que guarda a outra
 * metade da troca. Aberto em outro aparelho, a tela pede um link novo.
 */
export function RedefinirSenhaAlunoPage() {
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const [estado, setEstado] = useState<'trocando' | 'pronto' | 'invalido'>('trocando')
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const trocou = useRef(false)

  useEffect(() => {
    // O código vale uma vez: o StrictMode do React chamaria o efeito duas.
    if (trocou.current) return
    trocou.current = true
    const codigo = params.get('code')
    if (!codigo) {
      setEstado('invalido')
      return
    }
    void supabaseAluno.auth.exchangeCodeForSession(codigo).then(({ error }) => {
      setEstado(error ? 'invalido' : 'pronto')
      // Tira o código da barra de endereço: ele já foi usado.
      window.history.replaceState(null, '', '/redefinir-senha-aluno')
    })
  }, [params])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (senha.length < 6) return setErro('A senha precisa de pelo menos 6 caracteres.')
    if (senha !== repetida) return setErro('As duas senhas não são iguais.')
    setErro('')
    setSalvando(true)
    const { error } = await supabaseAluno.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) {
      return setErro(error.message.includes('different') ? 'Use uma senha diferente da antiga.' : 'Não consegui salvar a senha. Tente de novo.')
    }
    navegar('/painel', { replace: true })
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-areia px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-lg">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-indigo-100 text-indigo-700">
          <KeyRound className="h-6 w-6" />
        </span>

        {estado === 'trocando' && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o link…
          </p>
        )}

        {estado === 'invalido' && (
          <div className="mt-3 text-center">
            <h1 className="text-lg font-extrabold text-neutral-900">Este link não vale mais</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Ele já foi usado, venceu ou foi aberto em outro aparelho. Peça um novo e abra no mesmo aparelho em que pediu.
            </p>
            <Link
              to="/entrar-aluno?recuperar"
              className="mt-5 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-bold text-white"
            >
              Pedir outro link
            </Link>
          </div>
        )}

        {estado === 'pronto' && (
          <form onSubmit={salvar}>
            <h1 className="mt-3 text-center text-lg font-extrabold text-neutral-900">Crie sua senha nova</h1>
            {erro && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{erro}</p>}
            <label className="mt-4 block">
              <span className="text-xs font-bold text-neutral-600">Senha nova</span>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-bold text-neutral-600">Repita a senha</span>
              <input
                type="password"
                autoComplete="new-password"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <button
              type="submit"
              disabled={salvando}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-base font-bold text-white disabled:opacity-50"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar e entrar
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
