import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Copy, Info, Loader2, X } from 'lucide-react'
import type { ResumoDaCopia } from '@/types/db'
import {
  useAlunos,
  useCopiarDadosDoAluno,
  useExcluirAluno,
  useExcluirLoginDoAluno,
  useRedefinirSenhaDoAluno,
} from './api'

export type AcaoDeConta = 'redefinir-senha' | 'excluir-login' | 'copiar-dados' | 'excluir-aluno'

/**
 * As saídas que o professor tem quando o login de um aluno dá problema, para
 * resolver sozinho. Cada uma abre explicando o que faz — e, principalmente, o
 * que NÃO faz — antes de pedir a confirmação: as quatro mexem em coisas que o
 * professor não vê (o login do aluno, o banco) e duas não têm volta.
 */
export function GerenciarContaModal({
  acao,
  alunoId,
  alunoNome,
  email,
  aoFechar,
}: {
  acao: AcaoDeConta
  alunoId: string
  alunoNome: string
  email: string | null
  aoFechar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl"
      >
        {acao === 'redefinir-senha' && (
          <RedefinirSenha alunoId={alunoId} alunoNome={alunoNome} email={email} aoFechar={aoFechar} />
        )}
        {acao === 'excluir-login' && (
          <ExcluirLogin alunoId={alunoId} alunoNome={alunoNome} email={email} aoFechar={aoFechar} />
        )}
        {acao === 'copiar-dados' && <CopiarDados alunoId={alunoId} alunoNome={alunoNome} aoFechar={aoFechar} />}
        {acao === 'excluir-aluno' && <ExcluirAluno alunoId={alunoId} alunoNome={alunoNome} aoFechar={aoFechar} />}
      </div>
    </div>
  )
}

function RedefinirSenha({
  alunoId,
  alunoNome,
  email,
  aoFechar,
}: {
  alunoId: string
  alunoNome: string
  email: string | null
  aoFechar: () => void
}) {
  const redefinir = useRedefinirSenhaDoAluno(alunoId)
  const [senha, setSenha] = useState('')
  const [copiado, setCopiado] = useState(false)
  const primeiroNome = alunoNome.split(' ')[0]

  if (redefinir.isSuccess) {
    const texto = `Oi ${primeiroNome}! Sua senha no Vocab Node foi trocada.\nE-mail: ${email}\nSenha nova: ${senha}\nEntre em ${window.location.origin}/entrar-aluno`
    return (
      <>
        <Cabecalho titulo="Senha redefinida" aoFechar={aoFechar} />
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          Pronto. Envie os dados abaixo para {primeiroNome}.
        </p>
        <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-600">{texto}</pre>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(texto)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 py-3 text-sm font-bold text-neutral-700"
        >
          {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copiado ? 'Copiado' : 'Copiar mensagem'}
        </button>
        <BotaoPrincipal aoClicar={aoFechar}>Concluir</BotaoPrincipal>
      </>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        redefinir.mutate(senha)
      }}
    >
      <Cabecalho titulo="Redefinir senha" aoFechar={aoFechar} />
      <Explicacao tom="info">
        Você escolhe uma senha nova para o login de <b>{alunoNome}</b> ({email}) e repassa a senha. A antiga
        para de funcionar na hora. <b>Nada muda na ficha</b>: tarefas, notas, aulas e pagamentos continuam iguais.
      </Explicacao>
      <p className="mt-3 text-xs text-neutral-500">
        Use quando o aluno esqueceu a senha. Se o erro continuar mesmo com a senha nova, use “Excluir login”.
      </p>
      <label className="mt-4 block">
        <span className="text-xs font-bold text-neutral-600">Senha nova</span>
        <input
          required
          minLength={6}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="off"
          placeholder="mínimo 6 caracteres"
          className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <Erro mensagem={redefinir.error?.message} />
      <Botoes
        aoCancelar={aoFechar}
        rotulo="Redefinir senha"
        pendente={redefinir.isPending}
        desabilitado={senha.length < 6}
      />
    </form>
  )
}

function ExcluirLogin({
  alunoId,
  alunoNome,
  email,
  aoFechar,
}: {
  alunoId: string
  alunoNome: string
  email: string | null
  aoFechar: () => void
}) {
  const excluir = useExcluirLoginDoAluno(alunoId)
  const primeiroNome = alunoNome.split(' ')[0]

  if (excluir.isSuccess) {
    return (
      <>
        <Cabecalho titulo="Login excluído" aoFechar={aoFechar} />
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
          O login de {primeiroNome} foi apagado e o histórico continua na ficha.
        </p>
        <p className="mt-3 text-sm text-neutral-500">
          Agora use <b>Gerar link de cadastro</b> no topo da ficha e envie para {primeiroNome} criar o acesso de novo
          — pode ser com o mesmo e-mail.
        </p>
        <BotaoPrincipal aoClicar={aoFechar}>Entendi</BotaoPrincipal>
      </>
    )
  }

  return (
    <>
      <Cabecalho titulo="Excluir login" aoFechar={aoFechar} />
      <Explicacao tom="aviso">
        Apaga o login de <b>{alunoNome}</b> ({email}). A sessão aberta cai na hora e não dá mais para entrar com esse
        e-mail e senha. <b>A ficha fica</b>: tarefas, notas, aulas e pagamentos continuam aqui.
      </Explicacao>
      <p className="mt-3 text-xs text-neutral-500">
        Use quando o aluno não consegue entrar de jeito nenhum. Depois, gere um link de cadastro para o aluno criar o acesso de
        novo (o e-mail fica livre) e o acesso volta a esta mesma ficha.
      </p>
      <Erro mensagem={excluir.error?.message} />
      <Botoes aoCancelar={aoFechar} rotulo="Excluir login" perigo pendente={excluir.isPending} aoConfirmar={() => excluir.mutate()} />
    </>
  )
}

function CopiarDados({ alunoId, alunoNome, aoFechar }: { alunoId: string; alunoNome: string; aoFechar: () => void }) {
  const navegar = useNavigate()
  const { data: ativos } = useAlunos('ativo')
  const { data: arquivados } = useAlunos('arquivado')
  const copiar = useCopiarDadosDoAluno(alunoId)
  const [destinoId, setDestinoId] = useState('')

  const candidatos = [...(ativos ?? []), ...(arquivados ?? [])].filter((a) => a.id !== alunoId)
  const destino = candidatos.find((a) => a.id === destinoId)

  if (copiar.data && destino) {
    return (
      <>
        <Cabecalho titulo="Dados copiados" aoFechar={aoFechar} />
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
          {destino.nome} recebeu os dados de {alunoNome}.
        </p>
        <ResumoCopia resumo={copiar.data} />
        <p className="mt-3 text-xs text-neutral-500">
          Confira a ficha de {destino.nome}. Estando tudo certo, você pode excluir {alunoNome}; até lá, as aulas e
          mensalidades aparecem nos dois.
        </p>
        <BotaoPrincipal
          aoClicar={() => {
            aoFechar()
            navegar(`/alunos/${destino.id}`)
          }}
        >
          Abrir ficha de {destino.nome.split(' ')[0]}
        </BotaoPrincipal>
      </>
    )
  }

  return (
    <>
      <Cabecalho titulo="Copiar dados para outro aluno" aoFechar={aoFechar} />
      <Explicacao tom="info">
        Copia tudo de <b>{alunoNome}</b> para o aluno que você escolher: tarefas com notas e respostas, trilhas,
        turmas, materiais, aulas com anotações e pagamentos. Na ficha do destino, só os campos vazios são preenchidos.{' '}
        <b>Nada muda em {alunoNome}</b>, e o destino continua com o próprio login.
      </Explicacao>
      <p className="mt-3 text-xs text-neutral-500">
        Use para migrar um aluno cuja conta deu problema: cadastre o aluno de novo, copie os dados para o cadastro novo, confira e só
        então exclua o antigo.
      </p>
      <label className="mt-4 block">
        <span className="text-xs font-bold text-neutral-600">Copiar para</span>
        <select
          value={destinoId}
          onChange={(e) => setDestinoId(e.target.value)}
          className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
        >
          <option value="">Escolha o aluno de destino…</option>
          {candidatos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
              {a.status === 'arquivado' ? ' (arquivado)' : ''}
              {a.email ? ` · ${a.email}` : ''}
            </option>
          ))}
        </select>
      </label>
      <Erro mensagem={copiar.error?.message} />
      <Botoes
        aoCancelar={aoFechar}
        rotulo="Copiar dados"
        pendente={copiar.isPending}
        desabilitado={!destinoId}
        aoConfirmar={() => copiar.mutate(destinoId)}
      />
    </>
  )
}

function ExcluirAluno({ alunoId, alunoNome, aoFechar }: { alunoId: string; alunoNome: string; aoFechar: () => void }) {
  const navegar = useNavigate()
  const excluir = useExcluirAluno(alunoId)
  const [confirmacao, setConfirmacao] = useState('')
  // Digitar o nome é o freio: é a única ação desta tela sem volta nenhuma.
  const confere = confirmacao.trim().toLowerCase() === alunoNome.trim().toLowerCase()

  return (
    <>
      <Cabecalho titulo="Excluir aluno" aoFechar={aoFechar} />
      <Explicacao tom="perigo">
        Apaga <b>{alunoNome}</b> de vez: o login, a ficha e tudo o que está nela — tarefas, notas, respostas e áudios,
        aulas e anotações, pagamentos, vínculos com trilhas, turmas e materiais. <b>Não dá para desfazer.</b>
      </Explicacao>
      <p className="mt-3 text-xs text-neutral-500">
        Quer só que o aluno volte a conseguir entrar? Use “Excluir login”, que mantém o histórico. Vai migrar para outro
        aluno? Use “Copiar dados” antes. Para só tirar da lista, “Arquivar aluno” basta.
      </p>
      <label className="mt-4 block">
        <span className="text-xs font-bold text-neutral-600">
          Digite <b>{alunoNome}</b> para confirmar
        </span>
        <input
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <Erro mensagem={excluir.error?.message} />
      <Botoes
        aoCancelar={aoFechar}
        rotulo="Excluir para sempre"
        perigo
        pendente={excluir.isPending}
        desabilitado={!confere}
        aoConfirmar={async () => {
          await excluir.mutateAsync()
          aoFechar()
          navegar('/alunos', { replace: true })
        }}
      />
    </>
  )
}

function ResumoCopia({ resumo }: { resumo: ResumoDaCopia }) {
  const linhas: [string, number][] = [
    ['tarefas', resumo.tarefas],
    ['respostas', resumo.respostas],
    ['trilhas', resumo.trilhas],
    ['turmas', resumo.turmas],
    ['materiais', resumo.materiais],
    ['aulas', resumo.aulas],
    ['pagamentos', resumo.pagamentos],
  ]
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
      {linhas.map(([rotulo, n]) => (
        <div key={rotulo} className="flex justify-between rounded-xl bg-neutral-50 px-3 py-2">
          <span className="text-neutral-500">{rotulo}</span>
          <span className="font-extrabold text-neutral-800">{n}</span>
        </div>
      ))}
    </div>
  )
}

function Cabecalho({ titulo, aoFechar }: { titulo: string; aoFechar: () => void }) {
  return (
    <div className="flex items-start justify-between">
      <h2 className="text-lg font-extrabold">{titulo}</h2>
      <button type="button" onClick={aoFechar} className="text-neutral-400">
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

function Explicacao({ tom, children }: { tom: 'info' | 'aviso' | 'perigo'; children: ReactNode }) {
  const cores = {
    info: 'bg-violet-50 text-violet-900',
    aviso: 'bg-amber-50 text-amber-900',
    perigo: 'bg-rose-50 text-rose-900',
  }[tom]
  const Icone = tom === 'info' ? Info : AlertTriangle
  return (
    <div className={`mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm ${cores}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  )
}

function Erro({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null
  return <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">{mensagem}</p>
}

function Botoes({
  aoCancelar,
  aoConfirmar,
  rotulo,
  perigo = false,
  pendente,
  desabilitado = false,
}: {
  aoCancelar: () => void
  /** Sem `aoConfirmar`, o botão é o submit do formulário em volta. */
  aoConfirmar?: () => void
  rotulo: string
  perigo?: boolean
  pendente: boolean
  desabilitado?: boolean
}) {
  return (
    <div className="mt-5 flex gap-2">
      <button
        type="button"
        onClick={aoCancelar}
        className="flex-1 rounded-full border border-neutral-300 py-3 text-sm font-bold text-neutral-700"
      >
        Cancelar
      </button>
      <button
        type={aoConfirmar ? 'button' : 'submit'}
        onClick={aoConfirmar}
        disabled={pendente || desabilitado}
        className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-extrabold text-white disabled:opacity-50 ${
          perigo ? 'bg-rose-600' : 'bg-neutral-900'
        }`}
      >
        {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
        {rotulo}
      </button>
    </div>
  )
}

function BotaoPrincipal({ aoClicar, children }: { aoClicar: () => void; children: ReactNode }) {
  return (
    <button
      onClick={aoClicar}
      className="mt-4 w-full rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white"
    >
      {children}
    </button>
  )
}
