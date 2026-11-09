import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Loader2, MessageCircle, Search, UsersRound, X } from 'lucide-react'
import { useAlunos } from '@/features/alunos/api'
import { AtalhosDeTurma } from '@/features/turmas/AtalhosDeTurma'
import { useTurmasComMembros } from '@/features/turmas/api'
import { rotuloDosDestinos, useDestinos } from '@/features/turmas/turmas-do-envio'
import { linkWhatsapp } from '@/lib/whatsapp'
import type { Aluno } from '@/types/db'
import { todosOsItens, validarRoteiro } from '../../../../poc-tutor/src/validacao.ts'
import { useLiberacoesTutor, useLiberarLicao, useLicao, useTurmasDasLicoes } from './api'

type LicaoParaLiberar = { id: string; titulo: string; publicada: boolean; professor_id: string | null }

/**
 * "Liberar no tutor" — o mesmo gesto do envio de atividade (EnvioModal):
 * turmas e alunos, um botão. Abre com quem já tem a lição marcado, e o que
 * for desmarcado perde a lição. Liberar publica a lição em rascunho e liga o
 * tutor de quem recebe (0029).
 */
export function LiberarLicaoModal({ licao, aoFechar }: { licao: LicaoParaLiberar; aoFechar: () => void }) {
  const { data: alunos } = useAlunos('ativo')
  const { data: turmas } = useTurmasComMembros()
  const { data: liberacoes } = useLiberacoesTutor()
  const { data: turmasDasLicoes } = useTurmasDasLicoes()
  const { data: completa } = useLicao(licao.id)

  const carregado = alunos && turmas && liberacoes && turmasDasLicoes && completa

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">Liberar no tutor</h2>
            <p className="truncate text-sm text-neutral-500">
              {licao.titulo}
              {completa && ` · ${todosOsItens(completa.roteiro).length} exercícios`}
            </p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!carregado ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : (
          <Seletor
            licao={licao}
            alunos={alunos}
            // Quem tem a lição, entre os alunos ativos: arquivado não aparece nem perde nada.
            antesAlunos={alunos.filter((a) => liberacoes.get(a.id)?.has(licao.id)).map((a) => a.id)}
            antesTurmas={[...(turmasDasLicoes.get(licao.id) ?? [])]}
            membrosDe={(turmaIds) => turmas.filter((t) => turmaIds.includes(t.id)).flatMap((t) => t.alunoIds)}
            problemas={licao.publicada || !licao.professor_id ? [] : validarRoteiro(completa.roteiro)}
            aoFechar={aoFechar}
          />
        )}
      </div>
    </div>
  )
}

function Seletor({
  licao,
  alunos,
  antesAlunos,
  antesTurmas,
  membrosDe,
  problemas,
  aoFechar,
}: {
  licao: LicaoParaLiberar
  alunos: Aluno[]
  antesAlunos: string[]
  antesTurmas: string[]
  membrosDe: (turmaIds: string[]) => string[]
  problemas: string[]
  aoFechar: () => void
}) {
  const pelasTurmasDeAntes = new Set(membrosDe(antesTurmas))
  const destinos = useDestinos({
    turmasIniciais: antesTurmas,
    alunosIniciais: antesAlunos.filter((id) => !pelasTurmasDeAntes.has(id)),
  })
  const liberar = useLiberarLicao()
  const [busca, setBusca] = useState('')
  const [novos, setNovos] = useState<string[] | null>(null)

  const tinha = new Set(antesAlunos)
  const ativos = new Set(alunos.map((a) => a.id))
  const depoisAlunos = [...new Set([...destinos.pelaTurma.keys(), ...destinos.avulsos])].filter((id) => ativos.has(id))
  const mudou =
    depoisAlunos.length !== antesAlunos.length ||
    depoisAlunos.some((id) => !tinha.has(id)) ||
    destinos.turmaIds.length !== antesTurmas.length ||
    destinos.turmaIds.some((id) => !antesTurmas.includes(id))
  const rascunho = !licao.publicada && Boolean(licao.professor_id)

  const termo = busca.trim().toLowerCase()
  const visiveis = alunos.filter((a) => !termo || a.nome.toLowerCase().includes(termo) || destinos.marcado(a.id))

  async function confirmar() {
    const recebidos = await liberar.mutateAsync({
      licao,
      antes: { turmaIds: antesTurmas, alunoIds: antesAlunos },
      depois: { turmaIds: destinos.turmaIds, alunoIds: depoisAlunos },
    })
    if (depoisAlunos.length === 0 && destinos.turmaIds.length === 0) return aoFechar()
    setNovos(recebidos)
  }

  if (novos) {
    const quem = alunos.filter((a) => novos.includes(a.id))
    return (
      <div className="mt-4 space-y-3">
        <p className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          Liberado! A lição já aparece no Tutor do app de cada aluno.
          {destinos.turmaIds.length > 0 && ' Quem entrar na turma depois recebe também.'}
        </p>
        {quem.length > 0 && (
          <div className="max-h-60 space-y-1.5 overflow-y-auto">
            {quem.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-extrabold text-neutral-500">
                  {a.nome.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{a.nome}</span>
                <a
                    href={linkWhatsapp(
                      `Liberei uma lição nova no tutor do app pra você praticar inglês falando: ${licao.titulo}. É só abrir o app e tocar em Tutor.`,
                      a.telefone,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    title={`Avisar ${a.nome} pelo WhatsApp`}
                    className="shrink-0 rounded-xl bg-emerald-500 p-2 text-white"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
              </div>
            ))}
          </div>
        )}
        <button onClick={aoFechar} className="w-full rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white">
          Concluir
        </button>
      </div>
    )
  }

  if (problemas.length > 0) {
    return (
      <div className="mt-4">
        <p className="flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Esta lição ainda tem {problemas.length} {problemas.length === 1 ? 'problema' : 'problemas'} que quebrariam a aula.
            Corrija no editor antes de liberar.
          </span>
        </p>
        <Link
          to={`/tutor/licoes/${licao.id}`}
          className="mt-5 flex w-full items-center justify-center rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white"
        >
          Abrir no editor
        </Link>
      </div>
    )
  }

  return (
    <>
      <p className="mt-4 text-xs font-bold text-neutral-600">Para quem vai</p>
      <div className="mt-2">
        <AtalhosDeTurma destinos={destinos} />
      </div>
      {alunos.length > 0 && (
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno..."
            className="w-full rounded-2xl bg-neutral-100 py-2.5 pl-10 pr-3 text-sm outline-none ring-neutral-900 focus:ring-2"
          />
        </div>
      )}
      <div className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto">
        {alunos.length === 0 && (
          <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">Nenhum aluno cadastrado ainda.</p>
        )}
        {alunos.length > 0 && visiveis.length === 0 && (
          <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">Nenhum aluno com esse nome.</p>
        )}
        {visiveis.map((a) => {
          const marcado = destinos.marcado(a.id)
          const turma = destinos.pelaTurma.get(a.id)
          const jaPratica = tinha.has(a.id) && marcado
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => destinos.alternarAluno(a.id)}
              disabled={Boolean(turma)}
              title={turma ? `Recebe pela turma ${turma}` : undefined}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition disabled:cursor-default ${
                turma ? 'bg-violet-100' : marcado ? 'bg-neutral-900' : 'bg-neutral-50'
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                  marcado ? 'bg-amber-300 text-neutral-900' : 'bg-white text-neutral-500'
                }`}
              >
                {a.nome.charAt(0).toUpperCase()}
              </span>
              <span
                className={`min-w-0 flex-1 text-sm font-bold ${
                  turma ? 'text-violet-900' : marcado ? 'text-white' : 'text-neutral-700'
                }`}
              >
                {a.nome}
                {a.nivel_cefr && <span className="text-neutral-400"> · {a.nivel_cefr}</span>}
                {(turma || jaPratica) && (
                  <span
                    className={`flex items-center gap-1 text-[11px] font-medium ${turma ? 'text-violet-700' : 'text-neutral-400'}`}
                  >
                    {turma && <UsersRound className="h-3 w-3" />}
                    {[turma && `pela turma ${turma}`, jaPratica && 'já pratica'].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              {marcado && !turma && (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white">
                  <Check className="h-3.5 w-3.5 text-neutral-900" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-4 rounded-2xl bg-neutral-100 px-4 py-2.5 text-xs text-neutral-600">
        {rascunho && <b>A lição está em rascunho: ao liberar, ela é publicada. </b>}
        Quem receber passa a ver <b>Tutor</b> no app. Para tirar de alguém, toque de novo no nome.
      </p>

      {liberar.error && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{liberar.error.message}</p>
      )}
      <button
        onClick={() => void confirmar()}
        disabled={!mudou || liberar.isPending}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
      >
        {liberar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        <span className="truncate">
          {!mudou
            ? destinos.vazio
              ? 'Escolha para quem vai'
              : 'Nada mudou'
            : destinos.vazio
              ? 'Tirar de todos'
              : `Liberar para ${rotuloDosDestinos(destinos)}`}
        </span>
      </button>
    </>
  )
}
