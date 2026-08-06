import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, GraduationCap, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

type Modo = 'entrar' | 'criar'

export function LoginPage() {
  const { session, carregando } = useAuth()
  // A landing (app/index.html, fora do SPA) linka "Começar grátis" com
  // ?modo=criar — só lido na primeira renderização, de propósito: depois
  // disso quem manda é o toggle abaixo, não a URL.
  const [params] = useSearchParams()
  const [modo, setModo] = useState<Modo>(params.get('modo') === 'criar' ? 'criar' : 'entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (carregando) return null
  if (session) return <Navigate to="/hoje" replace />

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)

    try {
      if (modo === 'criar') {
        // `nome` vai nos metadados; um trigger no banco copia para `professores`.
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome } },
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      }
    } catch (e) {
      setErro(traduzirErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        {/* Link de verdade (não <Link>): a landing vive fora do SPA
            (app/index.html, na raiz do domínio), então sair daqui é
            navegação de página inteira, não roteamento client-side. */}
        <a
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-neutral-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para o site
        </a>
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-violet-300 text-neutral-900">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-lg font-extrabold">Vocab Node</span>
        </div>

        <form
          onSubmit={enviar}
          className="rounded-3xl border border-neutral-200 bg-white p-7 shadow-sm"
        >
          <h1 className="text-xl font-extrabold">
            {modo === 'entrar' ? 'Entrar' : 'Criar conta grátis'}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {modo === 'entrar'
              ? 'Bem-vindo de volta.'
              : 'Leva menos de um minuto.'}
          </p>

          {modo === 'criar' && (
            <label className="mt-5 block">
              <span className="text-xs font-bold text-neutral-600">Seu nome</span>
              <input
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="name"
                placeholder="Ana Souza"
                className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
              />
            </label>
          )}

          <label className="mt-4 block">
            <span className="text-xs font-bold text-neutral-600">E-mail</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="voce@email.com"
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-bold text-neutral-600">Senha</span>
            <input
              required
              type="password"
              minLength={8}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
              placeholder="mínimo 8 caracteres"
              className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
            />
          </label>

          {erro && (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>

          <p className="mt-5 text-center text-xs text-neutral-500">
            {modo === 'entrar' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
            <button
              type="button"
              onClick={() => {
                setModo(modo === 'entrar' ? 'criar' : 'entrar')
                setErro(null)
              }}
              className="font-bold text-violet-700"
            >
              {modo === 'entrar' ? 'Criar conta grátis' : 'Entrar'}
            </button>
          </p>
        </form>

        {/* Fora do card, e contornado em vez de sólido: é a porta do OUTRO
            público (o aluno tem sessão própria, ver AlunoAuthProvider), não
            mais uma opção do formulário do professor. */}
        <Link
          to="/entrar-aluno"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white py-3.5 text-sm font-bold text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50"
        >
          <BookOpen className="h-4 w-4" />
          Entrar como aluno
        </Link>
        <p className="mt-2 text-center text-xs text-neutral-400">
          Para ver suas tarefas e seu progresso
        </p>
      </div>
    </div>
  )
}

function traduzirErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('User already registered')) return 'Já existe uma conta com esse e-mail.'
  if (msg.includes('Password should be')) return 'A senha precisa de ao menos 8 caracteres.'
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  return msg
}
