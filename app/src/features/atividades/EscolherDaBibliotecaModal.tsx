import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, Search, X } from 'lucide-react'
import { useAtividades, useEnviarAtividade, type AtividadeComEnvio, type EnvioResultado } from './api'
import { LinkDoAluno } from './EnvioModal'
import { CORES_NIVEL, visualDaHabilidade } from './visual-atividade'
import { useHistoricoDoAluno } from '@/features/alunos/api'
import { ROTULO_HABILIDADE } from '@/types/questao'
import type { Aluno } from '@/types/db'

/**
 * O inverso do EnvioModal: lá o professor parte de uma atividade e escolhe
 * alunos; aqui parte do aluno e escolhe uma atividade que já existe. Sem isso,
 * reaproveitar uma atividade obrigava a sair da ficha, achar a atividade na
 * biblioteca e reencontrar o aluno na lista de envio.
 */
export function EscolherDaBibliotecaModal({ aluno, aoFechar }: { aluno: Aluno; aoFechar: () => void }) {
  const [escolhida, setEscolhida] = useState<AtividadeComEnvio | null>(null)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl bg-white p-7 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              {escolhida && (
                <button
                  onClick={() => setEscolhida(null)}
                  title="Voltar para a lista"
                  className="-ml-1 shrink-0 text-neutral-400"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              Enviar atividade
            </h2>
            <p className="truncate text-sm text-neutral-500">
              para {aluno.nome}
              {aluno.nivel_cefr && ` · ${aluno.nivel_cefr}`}
            </p>
          </div>
          <button onClick={aoFechar} className="shrink-0 text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {escolhida ? (
          <Confirmacao atividade={escolhida} aluno={aluno} aoFechar={aoFechar} />
        ) : (
          <ListaDeAtividades aluno={aluno} aoEscolher={setEscolhida} aoFechar={aoFechar} />
        )}
      </div>
    </div>
  )
}

function ListaDeAtividades({
  aluno,
  aoEscolher,
  aoFechar,
}: {
  aluno: Aluno
  aoEscolher: (a: AtividadeComEnvio) => void
  aoFechar: () => void
}) {
  const { data: atividades, isLoading } = useAtividades()
  const { data: historico } = useHistoricoDoAluno(aluno.id)
  const [busca, setBusca] = useState('')

  // Quantas vezes esta atividade já foi para ESTE aluno. Reenviar é permitido
  // (cria nova tentativa, RF-80/127), mas o professor precisa saber que está
  // repetindo antes de clicar, não depois.
  const enviosPorAtividade = new Map<string, number>()
  for (const item of historico ?? []) {
    enviosPorAtividade.set(item.atividadeId, (enviosPorAtividade.get(item.atividadeId) ?? 0) + 1)
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = (atividades ?? []).filter(
    (a) =>
      !termo ||
      a.titulo.toLowerCase().includes(termo) ||
      a.habilidades.some((h) => h.toLowerCase().includes(termo)),
  )

  if (isLoading) {
    return (
      <div className="grid place-items-center py-12 text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if ((atividades?.length ?? 0) === 0) {
    return (
      <div className="mt-6 rounded-2xl bg-neutral-50 px-4 py-6 text-center">
        <p className="text-sm font-bold text-neutral-700">Sua biblioteca está vazia</p>
        <p className="mt-1 text-xs text-neutral-500">
          Gere uma atividade com IA ou crie do zero — depois ela fica disponível aqui para qualquer aluno.
        </p>
        <Link
          to="/atividades/gerar"
          onClick={aoFechar}
          className="mt-4 inline-block rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-extrabold text-white"
        >
          Gerar com IA
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="relative mt-4 shrink-0">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título ou habilidade..."
          className="w-full rounded-2xl bg-neutral-100 py-2.5 pl-10 pr-3 text-sm outline-none ring-neutral-900 focus:ring-2"
        />
      </div>

      <div className="-mr-2 mt-2 flex-1 space-y-1.5 overflow-y-auto pr-2">
        {visiveis.length === 0 && (
          <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
            Nenhuma atividade encontrada.
          </p>
        )}
        {visiveis.map((a) => (
          <ItemAtividade
            key={a.id}
            atividade={a}
            jaEnviada={enviosPorAtividade.get(a.id) ?? 0}
            aoEscolher={() => aoEscolher(a)}
          />
        ))}
      </div>
    </>
  )
}

function ItemAtividade({
  atividade,
  jaEnviada,
  aoEscolher,
}: {
  atividade: AtividadeComEnvio
  jaEnviada: number
  aoEscolher: () => void
}) {
  const visual = visualDaHabilidade(atividade.habilidades)
  // Atividade sem questão nenhuma geraria um link que abre numa tarefa vazia —
  // é rascunho em aberto, não conteúdo enviável. Fica visível, mas travada.
  const vazia = atividade.questoes === 0
  const rotuloHabilidades = atividade.habilidades
    .map((h) => ROTULO_HABILIDADE[h as keyof typeof ROTULO_HABILIDADE] ?? h)
    .join(' · ')

  return (
    <button
      type="button"
      disabled={vazia}
      onClick={aoEscolher}
      className="flex w-full items-center gap-3 rounded-2xl bg-neutral-50 px-3 py-2.5 text-left transition enabled:hover:bg-neutral-100 disabled:opacity-50"
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${visual.cor}`}>
        <visual.Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-neutral-900">{atividade.titulo}</span>
        <span className="block truncate text-xs font-medium text-neutral-400">
          {rotuloHabilidades && `${rotuloHabilidades} · `}
          {vazia ? 'sem questões' : `${atividade.questoes} ${atividade.questoes === 1 ? 'questão' : 'questões'}`}
          {jaEnviada > 0 && ` · já enviada ${jaEnviada}×`}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold ${CORES_NIVEL[atividade.nivel]}`}
      >
        {atividade.nivel}
      </span>
    </button>
  )
}

/**
 * Passo 2, em componente próprio porque `useEnviarAtividade` recebe o id na
 * chamada do hook — só dá para instanciá-lo depois que a atividade foi
 * escolhida.
 */
function Confirmacao({
  atividade,
  aluno,
  aoFechar,
}: {
  atividade: AtividadeComEnvio
  aluno: Aluno
  aoFechar: () => void
}) {
  const enviar = useEnviarAtividade(atividade.id)
  const [prazo, setPrazo] = useState('')
  const [resultado, setResultado] = useState<EnvioResultado | null>(null)

  async function confirmar() {
    const [enviado] = await enviar.mutateAsync({ alunos: [aluno], prazo: prazo || undefined })
    setResultado(enviado)
  }

  if (resultado) {
    return (
      <div className="mt-4 space-y-3 overflow-y-auto">
        <p className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          Enviado! O link abaixo é exclusivo deste aluno.
        </p>
        <LinkDoAluno resultado={resultado} atividadeTitulo={atividade.titulo} />
        <button
          onClick={aoFechar}
          className="mt-2 w-full rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white"
        >
          Concluir
        </button>
      </div>
    )
  }

  const visual = visualDaHabilidade(atividade.habilidades)

  return (
    <div className="mt-4 overflow-y-auto">
      <div className="flex items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${visual.cor}`}>
          <visual.Icone className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold text-neutral-900">{atividade.titulo}</span>
          <span className="block text-xs font-medium text-neutral-400">
            {atividade.nivel} · {atividade.questoes}{' '}
            {atividade.questoes === 1 ? 'questão' : 'questões'}
          </span>
        </span>
      </div>

      <label className="mt-4 flex items-center gap-2 rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-700">
        Prazo <span className="font-normal text-neutral-400">(opcional)</span>
        <input
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          className="ml-auto bg-transparent text-sm outline-none"
        />
      </label>

      {enviar.error && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          {(enviar.error as Error).message}
        </p>
      )}

      <button
        onClick={confirmar}
        disabled={enviar.isPending}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
      >
        {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Enviar para {aluno.nome.split(' ')[0]}
      </button>
    </div>
  )
}
