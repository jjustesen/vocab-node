import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, Hourglass, Loader2, Lock, Mail, XCircle } from 'lucide-react'
import { supabaseAluno } from '@/lib/supabase-aluno'
import { mensagemDeErro } from '@/lib/api-tarefa'
import { inicial } from '@/lib/avatar'
import { useAlunoAuth } from '@/features/aluno-auth/AlunoAuthProvider'
import { BotaoPrincipal, Chip, TelaAluno } from '@/features/tarefa/visual'
import { entrarPeloLinkAberto, obterLinkAberto, type LinkAbertoInfo } from './api'

type Modo = 'escolha' | 'cadastro' | 'login'

/**
 * /a/:token — link ABERTO da atividade (0010_link_aberto.sql), a rota que o
 * professor compartilha com quem ainda não é aluno.
 *
 * A regra das 12h mora no servidor; aqui só mudamos a conversa:
 *   - janela aberta  → "crie sua conta e comece" (ou entre, se já tem);
 *   - janela fechada → só login; quem não tem conta pede novo link;
 *   - já logado      → um clique e a atividade é dele.
 */
export function LinkAbertoPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session, carregando: carregandoSessao } = useAlunoAuth()

  const [info, setInfo] = useState<LinkAbertoInfo | null>(null)
  const [erroFatal, setErroFatal] = useState('')
  const [modo, setModo] = useState<Modo>('escolha')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  // A vitrine depende de saber se há sessão (para o atalho "você já está
  // logado"), então espera o provider resolver antes da primeira chamada.
  useEffect(() => {
    if (!token || carregandoSessao) return
    obterLinkAberto(token, session?.access_token)
      .then(({ data }) => setInfo(data))
      .catch((e) => setErroFatal(mensagemDeErro(e)))
    // `session` fica de fora de propósito: após login/cadastro navegamos
    // embora — refazer a vitrine aqui só piscaria a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, carregandoSessao])

  async function concluirComSessao(accessToken: string, nomeParaCadastro?: string) {
    const { data } = await entrarPeloLinkAberto(token!, accessToken, nomeParaCadastro)
    navigate(`/painel/tarefa/${data.atribuicaoId}`, { replace: true })
  }

  async function aoComecarLogado() {
    setErro('')
    setEnviando(true)
    try {
      await concluirComSessao(session!.access_token)
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  async function aoCriarConta(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    if (senha !== confirmarSenha) return setErro('As senhas não são iguais.')

    setEnviando(true)
    try {
      // `perfil: 'aluno'` NÃO é decorativo — sem ele o trigger de signUp cria
      // uma conta de PROFESSOR para o aluno (ver migrations 0002/0009).
      const { data, error } = await supabaseAluno.auth.signUp({
        email,
        password: senha,
        options: { data: { perfil: 'aluno', nome } },
      })
      if (error) throw error
      if (!data.session) {
        // Projeto com confirmação de e-mail ligada — mesma limitação do
        // convite (ver CadastroAlunoPage).
        setErro('Confirme seu e-mail antes de continuar e depois abra este link de novo.')
        setEnviando(false)
        return
      }
      await concluirComSessao(data.session.access_token, nome)
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  async function aoEntrar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const { data, error } = await supabaseAluno.auth.signInWithPassword({ email, password: senha })
      if (error) throw new Error('E-mail ou senha incorretos.')
      await concluirComSessao(data.session.access_token)
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  async function usarOutraConta() {
    await supabaseAluno.auth.signOut()
    setErro('')
    setInfo((atual) => (atual ? { ...atual, sessao: null } : atual))
  }

  if (erroFatal) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-6 text-center">
        <div>
          <XCircle className="mx-auto h-10 w-10 text-rose-400" />
          <p className="mt-3 font-bold text-neutral-800">{erroFatal}</p>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const sessao = session ? info.sessao : null

  return (
    <TelaAluno comFormas>
      <div className="pt-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-violet-200 text-xl font-extrabold text-violet-800">
          {inicial(info.professorNome)}
        </span>
        <p className="mt-2 text-sm font-medium text-neutral-500">
          Atividade de <b className="text-neutral-900">{info.professorNome}</b>
        </p>
        <h1 className="mt-1 text-balance text-xl font-extrabold text-neutral-900">{info.atividadeTitulo}</h1>
        <div className="mt-2.5 flex justify-center gap-2">
          <Chip>{info.questoes} questões</Chip>
          <Chip cor="bg-violet-100 text-violet-700">Nível {info.nivel}</Chip>
        </div>
        <div className="mt-3">
          {info.cadastroAberto ? (
            <SeloJanela expiraEm={info.cadastroExpiraEm} />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-200 px-3 py-1 text-xs font-bold text-neutral-600">
              <Lock className="h-3 w-3" /> Cadastro encerrado
            </span>
          )}
        </div>
      </div>

      {erro && (
        <p className="mt-5 rounded-2xl bg-rose-100 px-4 py-3 text-sm font-medium text-rose-800">{erro}</p>
      )}

      {/* ── Já logado ─────────────────────────────────────────────────── */}
      {sessao && (
        <div className="mt-6">
          {sessao.vinculada ? (
            <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Você está logado como {sessao.alunoNome?.split(' ')[0]}
            </p>
          ) : info.cadastroAberto ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-center text-sm text-neutral-600">
              Você está logado como <b className="text-neutral-900">{sessao.email}</b>. Ao começar, você
              vira aluno de {info.professorNome}.
            </p>
          ) : (
            <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm font-medium text-rose-800">
              Sua conta ({sessao.email}) não é aluna de {info.professorNome}, e o período de cadastro
              deste link terminou. Peça um novo link, ou entre com outra conta.
            </p>
          )}

          {(sessao.vinculada || info.cadastroAberto) && (
            <div className="mt-4">
              <BotaoPrincipal onClick={aoComecarLogado} disabled={enviando}>
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                Começar atividade
              </BotaoPrincipal>
            </div>
          )}

          <button onClick={usarOutraConta} className="mt-4 w-full text-center text-xs font-bold text-neutral-400">
            Entrar com outra conta
          </button>
        </div>
      )}

      {/* ── Sem sessão ────────────────────────────────────────────────── */}
      {!sessao && modo === 'escolha' && (
        <div className="mt-6">
          {info.cadastroAberto ? (
            <>
              <BotaoPrincipal onClick={() => setModo('cadastro')}>Criar conta e começar</BotaoPrincipal>
              <div className="my-4 flex items-center gap-3 text-xs font-bold text-neutral-400">
                <span className="h-px flex-1 bg-neutral-200" />
                ou
                <span className="h-px flex-1 bg-neutral-200" />
              </div>
              <button
                onClick={() => setModo('login')}
                className="w-full rounded-full border-[1.5px] border-neutral-300 bg-white py-3.5 text-base font-extrabold text-neutral-900"
              >
                Já tenho conta — Entrar
              </button>
              <p className="mt-4 text-center text-xs font-medium text-neutral-400">
                Leva menos de 1 minuto. Seu progresso fica salvo na sua conta.
              </p>
            </>
          ) : (
            <>
              <p className="rounded-2xl bg-white px-4 py-3 text-sm leading-relaxed text-neutral-600">
                O período de cadastro deste link terminou. Se você já tem conta, é só entrar. Ainda não
                tem? Peça um novo link a {info.professorNome}.
              </p>
              <FormLogin
                email={email}
                senha={senha}
                setEmail={setEmail}
                setSenha={setSenha}
                enviando={enviando}
                aoEnviar={aoEntrar}
              />
            </>
          )}
        </div>
      )}

      {!sessao && modo === 'cadastro' && (
        <form onSubmit={aoCriarConta} className="mt-6">
          <BotaoVoltar aoVoltar={() => setModo('escolha')} />
          <Campo rotulo="Seu nome" tipo="text" valor={nome} aoMudar={setNome} desabilitado={enviando} />
          <Campo rotulo="Seu e-mail" tipo="email" valor={email} aoMudar={setEmail} desabilitado={enviando} comIconeEmail />
          <Campo rotulo="Crie uma senha" tipo="password" valor={senha} aoMudar={setSenha} desabilitado={enviando} />
          <Campo
            rotulo="Confirme a senha"
            tipo="password"
            valor={confirmarSenha}
            aoMudar={setConfirmarSenha}
            desabilitado={enviando}
          />
          <div className="mt-4">
            <BotaoPrincipal tipo="submit" disabled={enviando}>
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar conta e começar
            </BotaoPrincipal>
          </div>
          <p className="mt-3 text-center text-xs font-medium text-neutral-400">
            Você entra como aluno de {info.professorNome}.
          </p>
        </form>
      )}

      {!sessao && modo === 'login' && (
        <div className="mt-6">
          <BotaoVoltar aoVoltar={() => setModo('escolha')} />
          <FormLogin
            email={email}
            senha={senha}
            setEmail={setEmail}
            setSenha={setSenha}
            enviando={enviando}
            aoEnviar={aoEntrar}
          />
        </div>
      )}
    </TelaAluno>
  )
}

/** "Cadastro aberto por mais 7h 32min" — reconta a cada minuto. */
function SeloJanela({ expiraEm }: { expiraEm: string }) {
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
      <Hourglass className="h-3 w-3" /> Cadastro aberto por mais {restante}
    </span>
  )
}

function BotaoVoltar({ aoVoltar }: { aoVoltar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoVoltar}
      className="mb-3 flex items-center gap-1 text-xs font-bold text-neutral-400"
    >
      <ChevronLeft className="h-3.5 w-3.5" /> Voltar
    </button>
  )
}

function Campo({
  rotulo,
  tipo,
  valor,
  aoMudar,
  desabilitado,
  comIconeEmail = false,
}: {
  rotulo: string
  tipo: 'text' | 'email' | 'password'
  valor: string
  aoMudar: (valor: string) => void
  desabilitado: boolean
  comIconeEmail?: boolean
}) {
  return (
    <label className="mt-3 block">
      <span className="text-xs font-bold text-neutral-600">{rotulo}</span>
      <div className="relative">
        {comIconeEmail && (
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        )}
        <input
          type={tipo}
          required
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          disabled={desabilitado}
          className={`mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm outline-none ring-neutral-900 focus:ring-2 ${
            comIconeEmail ? 'pl-11' : ''
          }`}
        />
      </div>
    </label>
  )
}

function FormLogin({
  email,
  senha,
  setEmail,
  setSenha,
  enviando,
  aoEnviar,
}: {
  email: string
  senha: string
  setEmail: (v: string) => void
  setSenha: (v: string) => void
  enviando: boolean
  aoEnviar: (evento: React.FormEvent) => void
}) {
  return (
    <form onSubmit={aoEnviar}>
      <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} desabilitado={enviando} comIconeEmail />
      <Campo rotulo="Senha" tipo="password" valor={senha} aoMudar={setSenha} desabilitado={enviando} />
      <div className="mt-4">
        <BotaoPrincipal tipo="submit" disabled={enviando}>
          {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
          Entrar e abrir atividade
        </BotaoPrincipal>
      </div>
    </form>
  )
}
