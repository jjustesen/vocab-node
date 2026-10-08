import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { Bell, Check, CheckCircle2, Hourglass, Loader2, Mail, TrendingUp, XCircle } from 'lucide-react'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { mensagemDeErro } from '@/lib/api-tarefa'
import { inicial } from '@/lib/avatar'
import { BotaoPrincipal, TelaAluno } from '@/features/tarefa/visual'
import { Beneficio } from './CadastroAlunoPage'
import { concluirLinkDeCadastro, obterLinkDeCadastro, type LinkCadastroInfo } from './api'

type Tela = 'carregando' | 'erro' | 'formulario' | 'enviando' | 'entrar-manual'

/**
 * /cadastro/professor/:token — link de cadastro do professor (0019). Quem
 * abre ainda não é aluno de ninguém: aqui nasce a ficha em `alunos` e a conta
 * de login, tudo numa chamada (link-cadastro-concluir). Depois entramos com o
 * cliente do ALUNO (@/lib/supabase-aluno), nunca o do professor, e seguimos
 * direto para o painel.
 *
 * Não colide com /cadastro/:token (convite individual): `:token` casa um
 * segmento só, e o React Router prefere o segmento estático "professor".
 */
export function CadastroPeloLinkPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [tela, setTela] = useState<Tela>('carregando')
  const [erro, setErro] = useState('')
  const [jaCadastrado, setJaCadastrado] = useState(false)
  const [info, setInfo] = useState<LinkCadastroInfo | null>(null)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  useEffect(() => {
    if (!token) return
    obterLinkDeCadastro(token)
      .then(({ data }) => {
        setInfo(data)
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
    setJaCadastrado(false)

    if (!nome.trim()) return setErro('Informe seu nome.')
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    if (senha !== confirmarSenha) return setErro('As senhas não são iguais.')

    setTela('enviando')
    try {
      await concluirLinkDeCadastro(token!, { nome: nome.trim(), email: email.trim(), senha })
    } catch (e) {
      // 409 com este código = a pessoa já é aluna DESTE professor; a saída
      // útil é o login, não outro e-mail.
      if (axios.isAxiosError(e) && (e.response?.data as { codigo?: string } | undefined)?.codigo === 'ja_cadastrado') {
        setJaCadastrado(true)
      }
      setErro(mensagemDeErro(e))
      setTela('formulario')
      return
    }

    // A conta já existe neste ponto. Se o login falhar (rede, por exemplo),
    // não dá para "tentar o cadastro de novo" — o e-mail já está em uso —,
    // então caímos numa tela que manda para /entrar-aluno.
    const { error } = await supabaseAluno.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) {
      setTela('entrar-manual')
      return
    }
    navigate('/painel', { replace: true })
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
          <Link to="/entrar-aluno" className="mt-4 inline-block text-sm font-bold text-neutral-500 underline">
            Já tenho conta — entrar
          </Link>
        </div>
      </div>
    )
  }

  if (tela === 'entrar-manual') {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-lg">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h1 className="mt-3 text-lg font-extrabold text-neutral-900">Conta criada, {nome.trim().split(' ')[0]}!</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Agora você é aluno de {info?.professorNome}. Entre com o e-mail e a senha que acabou de criar.
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

  const enviando = tela === 'enviando'
  const campo = 'mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2'

  return (
    <TelaAluno>
      <form onSubmit={aoCriarConta} className="pt-4">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-violet-200 text-xl font-extrabold text-violet-800">
            {inicial(info?.professorNome ?? '?')}
          </span>
          <p className="mt-2 text-sm font-medium text-neutral-500">
            Convite de <b className="text-neutral-900">{info?.professorNome}</b>
          </p>
          <h1 className="mt-1 text-xl font-extrabold text-neutral-900">Crie sua conta de aluno</h1>
          {info && (
            <div className="mt-3">
              <SeloValidade expiraEm={info.expiraEm} />
            </div>
          )}
        </div>

        {info?.semVagas && (
          <p className="mt-5 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">
            {info.professorNome} está sem vagas para novos alunos no momento. Avise o professor — assim que
            ele liberar uma vaga, este mesmo link volta a funcionar.
          </p>
        )}

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
          <div className="mt-4 rounded-2xl bg-rose-100 px-4 py-3 text-sm font-medium text-rose-800">
            {erro}
            {jaCadastrado && (
              <Link to="/entrar-aluno" className="mt-1 block font-bold underline">
                Entrar na minha conta
              </Link>
            )}
          </div>
        )}

        <label className="mt-5 block">
          <span className="text-xs font-bold text-neutral-600">Seu nome</span>
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={enviando}
            maxLength={120}
            autoComplete="name"
            className={campo}
          />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">Seu e-mail</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enviando}
              autoComplete="email"
              placeholder="voce@email.com"
              className={`${campo} pl-11`}
            />
          </div>
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-bold text-neutral-600">Senha (se já tem conta, use a atual)</span>
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={enviando}
            autoComplete="new-password"
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
            disabled={enviando}
            autoComplete="new-password"
            className={campo}
          />
        </label>

        <div className="mt-4">
          <BotaoPrincipal tipo="submit" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar minha conta
          </BotaoPrincipal>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-neutral-400">
          Já tem conta?{' '}
          <Link to="/entrar-aluno" className="font-bold text-neutral-600 underline">
            Entrar
          </Link>
        </p>
      </form>
    </TelaAluno>
  )
}

/** "Link válido por mais 7h 32min" — reconta a cada minuto. */
function SeloValidade({ expiraEm }: { expiraEm: string }) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const restante = useMemo(() => {
    const ms = Math.max(0, new Date(expiraEm).getTime() - agora)
    const horas = Math.floor(ms / 3_600_000)
    const minutos = Math.floor((ms % 3_600_000) / 60_000)
    return horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`
  }, [expiraEm, agora])

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
      <Hourglass className="h-3 w-3" /> Link válido por mais {restante}
    </span>
  )
}
