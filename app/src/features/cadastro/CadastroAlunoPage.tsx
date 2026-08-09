import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bell, Check, CheckCircle2, Loader2, Mail, TrendingUp, XCircle } from 'lucide-react'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { mensagemDeErro } from '@/lib/api-tarefa'
import { inicial } from '@/lib/avatar'
import { BotaoPrincipal, TelaAluno } from '@/features/tarefa/visual'
import { concluirConvite, obterConvite, type ConviteObterResposta } from './api'

type Tela = 'carregando' | 'erro' | 'formulario' | 'enviando' | 'sucesso'

/**
 * /cadastro/:token — RF-22/23/24. Aluno sem sessão ainda; usa o cliente
 * próprio (@/lib/supabase-aluno.ts) pro signUp, nunca o do professor.
 */
export function CadastroAlunoPage() {
  const { token } = useParams<{ token: string }>()
  const [tela, setTela] = useState<Tela>('carregando')
  const [erro, setErro] = useState('')
  const [convite, setConvite] = useState<ConviteObterResposta | null>(null)

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  useEffect(() => {
    if (!token) return
    obterConvite(token)
      .then(({ data }) => {
        setConvite(data)
        setTela('formulario')
      })
      .catch((e) => {
        setErro(mensagemDeErro(e))
        setTela('erro')
      })
  }, [token])

  async function aoCriarConta(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')

    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    if (senha !== confirmarSenha) return setErro('As senhas não são iguais.')

    setTela('enviando')
    try {
      // `perfil: 'aluno'` NÃO é decorativo: o trigger on_auth_user_created
      // (migration 0002) cria uma linha em `professores` para todo signUp que
      // não se declare aluno. Sem este metadado, cada aluno cadastrado ganhava
      // também uma conta de professor funcional — ver migration 0009.
      const { data, error } = await supabaseAluno.auth.signUp({
        email,
        password: senha,
        options: { data: { perfil: 'aluno' } },
      })
      if (error) throw error

      if (!data.session) {
        // Projeto com confirmação de e-mail ligada — não temos como concluir
        // o convite agora (precisaríamos do token depois do clique no
        // e-mail). Limitação conhecida: exige "Confirm email" desligado.
        setErro('Confirme seu e-mail antes de continuar e depois entre em /entrar-aluno.')
        setTela('formulario')
        return
      }

      await concluirConvite(token!, data.session.access_token)
      setTela('sucesso')
    } catch (e) {
      setErro(mensagemDeErro(e))
      setTela('formulario')
    }
  }

  if (tela === 'carregando') {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-4">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (tela === 'erro') {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <div>
          <XCircle className="mx-auto h-10 w-10 text-rose-400" />
          <p className="mt-3 font-bold text-neutral-800">{erro}</p>
        </div>
      </div>
    )
  }

  if (tela === 'sucesso') {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-lg">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h1 className="mt-3 text-lg font-extrabold text-neutral-900">Conta criada, {convite?.alunoNome.split(' ')[0]}!</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Seu histórico com {convite?.professorNome} foi mantido. Agora você pode entrar quando quiser.
          </p>
          <Link
            to="/entrar-aluno"
            className="mt-5 block w-full rounded-2xl bg-neutral-900 py-3.5 text-sm font-bold text-white"
          >
            Entrar no meu painel
          </Link>
        </div>
      </div>
    )
  }

  const campo =
    'mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2'

  return (
    <TelaAluno>
      <form onSubmit={aoCriarConta} className="pt-4">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-violet-200 text-xl font-extrabold text-violet-800">
            {inicial(convite?.professorNome ?? '?')}
          </span>
          <p className="mt-2 text-sm font-medium text-neutral-500">
            Convite d{convite?.professorNome ? 'e' : 'o'}{' '}
            <b className="text-neutral-900">{convite?.professorNome}</b>
          </p>
          <h1 className="mt-1 text-xl font-extrabold text-neutral-900">
            Crie sua conta, {convite?.alunoNome.split(' ')[0]}
          </h1>
        </div>

        {/* O aluno precisa saber o que ganha em criar conta — sem isso o
            convite é só um formulário a mais no caminho. */}
        <div className="mt-5 space-y-3 rounded-3xl bg-white p-5 text-sm">
          <Beneficio Icone={Check} cor="bg-emerald-100 text-emerald-700">
            Todas as suas tarefas em um lugar
          </Beneficio>
          <Beneficio Icone={TrendingUp} cor="bg-violet-200 text-violet-700">
            Seu progresso e histórico completo
          </Beneficio>
          <Beneficio Icone={Bell} cor="bg-amber-100 text-amber-700">
            Lembretes de tarefas com prazo
          </Beneficio>
        </div>

        {erro && (
          <p className="mt-4 rounded-2xl bg-rose-100 px-4 py-3 text-sm font-medium text-rose-800">{erro}</p>
        )}

        <label className="mt-5 block">
          <span className="text-xs font-bold text-neutral-600">Seu e-mail</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={tela === 'enviando'}
              placeholder="voce@email.com"
              className={`${campo} pl-11`}
            />
          </div>
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">Crie uma senha</span>
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={tela === 'enviando'}
            className={campo}
          />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">Confirme a senha</span>
          <input
            type="password"
            required
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            disabled={tela === 'enviando'}
            className={campo}
          />
        </label>

        <div className="mt-4">
          <BotaoPrincipal tipo="submit" disabled={tela === 'enviando'}>
            {tela === 'enviando' && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar minha conta
          </BotaoPrincipal>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-neutral-400">
          Link de uso único · expira em 7 dias
          <br />
          Seu histórico com {convite?.professorNome} será mantido
        </p>
      </form>
    </TelaAluno>
  )
}

function Beneficio({
  Icone,
  cor,
  children,
}: {
  Icone: typeof Check
  cor: string
  children: React.ReactNode
}) {
  return (
    <p className="flex items-center gap-2.5 font-medium text-neutral-700">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${cor}`}>
        <Icone className="h-3.5 w-3.5" />
      </span>
      {children}
    </p>
  )
}
