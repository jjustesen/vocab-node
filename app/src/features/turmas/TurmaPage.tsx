import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserMinus,
  Users,
  Video,
  X,
} from 'lucide-react'
import { BotaoApagar } from '@/components/BotaoApagar'
import { useAlunos, useAlunosComConta } from '@/features/alunos/api'
import { linkDaSala, useCriarSalaDaTurma, useSalaDaTurma } from '@/features/sala/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import type { Aluno } from '@/types/db'
import { MateriaisDaTurma } from './MateriaisDaTurma'
import {
  useAlunosDaTurma,
  useExcluirTurma,
  useMudarAlunoDaTurma,
  useRenomearTurma,
  useTurma,
} from './api'

/**
 * A turma: quem entra, e por qual link.
 *
 * ── Por que esta tela existe separada da lista ──────────────────────────────
 *
 * A primeira versão punha isto dentro de um acordeão na lista, com um checkbox
 * por aluno. Funciona com dez alunos e desmonta com trezentos: a lista de
 * marcar vira uma rolagem infinita onde a informação que importa — QUEM já
 * está na turma — fica diluída entre todo mundo que não está.
 *
 * A inversão é essa: a turma mostra os MEMBROS, e adicionar é uma busca. Quem
 * está dentro cabe na tela; quem está fora só aparece quando você procura.
 *
 * ── O limite desta abordagem ────────────────────────────────────────────────
 *
 * A busca filtra no cliente, sobre a lista de alunos que o app já carrega.
 * Isso é instantâneo e sem round-trip até algumas centenas de alunos. Passando
 * disso, o certo é trocar por uma consulta `ilike` com debounce no servidor —
 * o formato da tela não muda, só a origem de `candidatos`.
 */

/** Acima disto a lista de "quem falta" some e só a busca traz gente. */
const LIMITE_PARA_MOSTRAR_TODOS = 12
/** Quantos resultados de busca aparecem por vez. */
const MAX_RESULTADOS = 8

export function TurmaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: turma, isLoading } = useTurma(id)
  const excluir = useExcluirTurma()

  if (isLoading) {
    return (
      <div className="mt-16 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (!turma) {
    return (
      <p className="mt-10 text-center text-sm text-neutral-500">
        Turma não encontrada.{' '}
        <Link to="/turmas" className="font-bold underline">
          Voltar
        </Link>
      </p>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-neutral-500">
        <Link to="/turmas" className="hover:underline">
          Turmas
        </Link>{' '}
        / {turma.nome}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <NomeDaTurma turmaId={turma.id} nome={turma.nome} />

        <div className="flex items-center gap-2">
          <Link
            to={`/sala/turma/${turma.id}`}
            className="flex items-center gap-1.5 rounded-full bg-violet-300 px-4 py-2 text-xs font-extrabold text-neutral-900"
          >
            <Video className="h-3.5 w-3.5" /> Entrar na sala
          </Link>
          {/*
            Apagar a turma leva a sala junto (cascade em 0015): o link morre com
            ela, e quem já o tem salvo bate numa porta que não existe mais. Daí
            a confirmação dizer o que se perde, e não só "tem certeza?".
          */}
          <span className="rounded-full bg-white px-1">
            <BotaoApagar
              titulo="Apagar turma"
              confirmacao="Apagar? o link para de funcionar"
              pendente={excluir.isPending}
              aoConfirmar={() => excluir.mutate(turma.id, { onSuccess: () => navigate('/turmas') })}
            />
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Membros turmaId={turma.id} />
          {/*
            Materiais depende de QUEM está na turma, então vem depois: a lista
            de membros é o que define para onde o arquivo vai.
          */}
          <MateriaisDaTurmaCarregando turmaId={turma.id} />
        </div>
        <LinkDaTurma turmaId={turma.id} />
      </div>
    </div>
  )
}

/**
 * Um passo a mais só para esperar os membros: `MateriaisDaTurma` precisa dos
 * ids para perguntar "quem já tem o quê", e chamá-lo com a lista vazia faria
 * a tela piscar "adicione alunos" antes de a turma carregar.
 */
function MateriaisDaTurmaCarregando({ turmaId }: { turmaId: string }) {
  const { data: membros, isLoading } = useAlunosDaTurma(turmaId)
  if (isLoading) return null
  return <MateriaisDaTurma alunos={(membros ?? []).map((a) => ({ id: a.id, nome: a.nome }))} />
}

function NomeDaTurma({ turmaId, nome }: { turmaId: string; nome: string }) {
  const renomear = useRenomearTurma(turmaId)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(nome)

  if (!editando) {
    return (
      <button
        onClick={() => {
          setValor(nome)
          setEditando(true)
        }}
        className="group flex items-center gap-2 text-left"
      >
        <h1 className="text-xl font-extrabold text-neutral-900">{nome}</h1>
        <Pencil className="h-3.5 w-3.5 text-neutral-300 transition group-hover:text-neutral-600" />
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valor.trim()) renomear.mutate(valor, { onSuccess: () => setEditando(false) })
      }}
      className="flex items-center gap-2"
    >
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => setEditando(false)}
        className="rounded-xl bg-white px-3 py-1.5 text-lg font-extrabold text-neutral-900 outline-none focus:ring-2 focus:ring-violet-400"
      />
    </form>
  )
}

function Membros({ turmaId }: { turmaId: string }) {
  const { data: todos } = useAlunos('ativo')
  const { data: membros, isLoading } = useAlunosDaTurma(turmaId)
  const { data: comConta } = useAlunosComConta()
  const mudar = useMudarAlunoDaTurma(turmaId)

  const [busca, setBusca] = useState('')
  const buscaRef = useRef<HTMLInputElement>(null)

  const dentro = useMemo(() => new Set((membros ?? []).map((a) => a.id)), [membros])
  const fora = useMemo(() => (todos ?? []).filter((a) => !dentro.has(a.id)), [todos, dentro])

  const termo = busca.trim().toLowerCase()
  const encontrados = useMemo(() => {
    if (!termo) return []
    return fora.filter(
      (a) => a.nome.toLowerCase().includes(termo) || (a.email ?? '').toLowerCase().includes(termo),
    )
  }, [fora, termo])

  /**
   * Com poucos alunos, obrigar a digitar para achar alguém é burocracia: a
   * lista inteira cabe na tela. Com muitos, mostrar todo mundo é exatamente o
   * problema que esta tela veio resolver. A régua troca sozinha.
   */
  const sugestoes = termo ? encontrados : fora.length <= LIMITE_PARA_MOSTRAR_TODOS ? fora : []
  const visiveis = sugestoes.slice(0, MAX_RESULTADOS)

  /** A mesma regra da porta da sala — e-mail na ficha OU conta (ver 0015). */
  const entraPeloLink = (a: Aluno) => Boolean(a.email) || Boolean(comConta?.has(a.id))
  const semAcesso = (membros ?? []).filter((a) => !entraPeloLink(a))

  function adicionar(alunoId: string) {
    mudar.mutate({ alunoId, dentro: true })
    setBusca('')
    buscaRef.current?.focus()
  }

  return (
    <div className="rounded-3xl bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold text-neutral-900">
          Quem entra nesta turma{' '}
          <span className="text-neutral-400">· {membros?.length ?? 0}</span>
        </h2>
      </div>

      {/* Adicionar é BUSCAR. O campo fica no topo porque é a ação, e a lista
          embaixo porque é o estado. */}
      <div className="mt-3 flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-neutral-400" />
        <input
          ref={buscaRef}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            // Enter adiciona o primeiro resultado: quem sabe o nome digita
            // três letras e aperta Enter, sem tirar a mão do teclado.
            if (e.key === 'Enter' && visiveis[0]) {
              e.preventDefault()
              adicionar(visiveis[0].id)
            }
            if (e.key === 'Escape') setBusca('')
          }}
          placeholder="Buscar aluno por nome ou e-mail…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            title="Limpar busca"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {visiveis.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-neutral-200">
          {visiveis.map((aluno) => (
            <li key={aluno.id}>
              <button
                onClick={() => adicionar(aluno.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-50"
              >
                <Avatar aluno={aluno} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">
                    {aluno.nome}
                  </span>
                  <Contato aluno={aluno} temConta={Boolean(comConta?.has(aluno.id))} />
                </span>
                <Plus className="h-4 w-4 shrink-0 text-neutral-400" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {termo && encontrados.length === 0 && (
        <p className="mt-2 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
          Nenhum aluno fora da turma para “{busca}”.
        </p>
      )}

      {sugestoes.length > MAX_RESULTADOS && (
        <p className="mt-2 px-1 text-[11px] text-neutral-400">
          Mostrando {MAX_RESULTADOS} de {sugestoes.length} — refine a busca para ver os outros.
        </p>
      )}

      {!termo && fora.length > LIMITE_PARA_MOSTRAR_TODOS && (
        <p className="mt-2 px-1 text-[11px] text-neutral-400">
          {fora.length} alunos fora desta turma. Busque pelo nome para adicionar.
        </p>
      )}

      <div className="mt-5">
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
          </div>
        )}

        {membros && membros.length === 0 && (
          <div className="rounded-2xl bg-neutral-50 px-4 py-6 text-center">
            <Users className="mx-auto h-5 w-5 text-neutral-300" />
            <p className="mt-2 text-xs text-neutral-500">
              Ninguém na turma ainda. Busque acima para adicionar.
            </p>
          </div>
        )}

        <ul className="divide-y divide-neutral-100">
          {membros?.map((aluno) => (
            <li key={aluno.id} className="flex items-center gap-3 py-2.5">
              <Avatar aluno={aluno} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {aluno.nome}
                </span>
                <Contato aluno={aluno} temConta={Boolean(comConta?.has(aluno.id))} />
              </span>
              <button
                onClick={() => mudar.mutate({ alunoId: aluno.id, dentro: false })}
                title={`Tirar ${aluno.nome.split(' ')[0]} da turma`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-300 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <UserMinus className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {semAcesso.length > 0 && (
        <p className="mt-4 flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {semAcesso.length === 1
              ? `${semAcesso[0].nome.split(' ')[0]} não vai conseguir entrar pelo link`
              : `${semAcesso.length} alunos não vão conseguir entrar pelo link`}
            : é pelo e-mail que a sala reconhece quem chega sem conta. Preencha o e-mail na ficha
            deles.
          </span>
        </p>
      )}
    </div>
  )
}

function Avatar({ aluno }: { aluno: Aluno }) {
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${corDoAvatar(
        aluno.id,
      )}`}
    >
      {inicial(aluno.nome)}
    </span>
  )
}

/**
 * O contato do aluno DO PONTO DE VISTA DA PORTA DA SALA — não é só exibir o
 * e-mail. "entra pela conta" é informação de acesso: aquele aluno nem vai
 * digitar e-mail, porque entra logado.
 */
function Contato({ aluno, temConta }: { aluno: Aluno; temConta: boolean }) {
  if (aluno.email) {
    return <span className="block truncate text-[11px] text-neutral-400">{aluno.email}</span>
  }
  if (temConta) {
    return <span className="block text-[11px] font-medium text-emerald-600">entra pela conta</span>
  }
  return <span className="block text-[11px] font-medium text-amber-700">sem e-mail cadastrado</span>
}

function LinkDaTurma({ turmaId }: { turmaId: string }) {
  const { data: sala, isLoading } = useSalaDaTurma(turmaId)
  const criar = useCriarSalaDaTurma(turmaId)
  const [copiado, setCopiado] = useState(false)
  const [armado, setArmado] = useState(false)

  const link = criar.data ?? (sala?.token ? linkDaSala(sala.token) : null)

  async function copiar() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (isLoading) return null

  return (
    <div className="h-fit rounded-3xl bg-neutral-900 p-5 text-white">
      <p className="flex items-center gap-1.5 text-xs font-bold text-violet-300">
        <Video className="h-3.5 w-3.5" /> Link da turma
      </p>

      {!link ? (
        <>
          <p className="mt-2 text-xs text-neutral-400">
            O link é o mesmo toda semana — combine uma vez e a turma inteira entra direto, sem
            instalar nada.
          </p>
          <button
            onClick={() => criar.mutate()}
            disabled={criar.isPending}
            className="mt-3 flex items-center gap-1.5 rounded-full bg-violet-300 px-4 py-2 text-xs font-extrabold text-neutral-900 disabled:opacity-50"
          >
            {criar.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Video className="h-3.5 w-3.5" />
            )}
            Criar a sala
          </button>
        </>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-lg bg-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300"
            />
            <button
              onClick={copiar}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-300 px-2.5 py-1.5 text-[11px] font-bold text-neutral-900"
            >
              {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            Quem abrir precisa se identificar com um e-mail já cadastrado nesta turma — o link
            sozinho não abre a porta.
          </p>
          {/*
            Dois cliques, e não `confirm()`: trocar o link derruba o acesso de
            todo mundo que já o tem salvo, e um diálogo do navegador pode estar
            suprimido sem a pessoa saber (ver `BotaoApagar`).
          */}
          <button
            onClick={() => (armado ? criar.mutate(undefined, { onSettled: () => setArmado(false) }) : setArmado(true))}
            onBlur={() => setArmado(false)}
            className={`mt-3 flex items-center gap-1 text-[11px] font-medium transition ${
              armado ? 'text-amber-300' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <RefreshCw className="h-3 w-3" />
            {armado ? 'Confirmar? o link atual para de funcionar' : 'Gerar novo link'}
          </button>
        </>
      )}
    </div>
  )
}
