import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, Mic, Plus, UsersRound, X } from 'lucide-react'
import { useProfessor } from '@/features/planos/api'
import { useTurmasComMembros } from '@/features/turmas/api'
import type { Aluno } from '@/types/db'
import {
  inicioDoMesNoBrasil,
  type LicaoNaLista,
  useLiberacoesTutor,
  useLiberarParaAluno,
  useSessoesDoAluno,
  useTirarLicaoDoAluno,
  useTodasAsLicoes,
  useTurmasDasLicoes,
} from './api'
import { SessaoNaLista } from './SessaoNaLista'

/**
 * A aba Tutor da ficha do aluno: as lições que ele tem e como foram as
 * práticas. Não há chave: o aluno vê o Tutor no app quando tem pelo menos uma
 * lição liberada (0029).
 */
export function AbaTutorAluno({ aluno, temConta }: { aluno: Aluno; temConta: boolean }) {
  const { data: licoes, isLoading: carregandoLicoes } = useTodasAsLicoes()
  const { data: liberacoes } = useLiberacoesTutor()
  const { data: turmasDasLicoes } = useTurmasDasLicoes()
  const { data: turmas } = useTurmasComMembros()
  const tirar = useTirarLicaoDoAluno()
  const { data: sessoes } = useSessoesDoAluno(aluno.id)
  const { data: professor } = useProfessor()
  const [escolhendo, setEscolhendo] = useState(false)

  const primeiroNome = aluno.nome.split(' ')[0]
  const liberadas = liberacoes?.get(aluno.id) ?? new Set<string>()
  const minhasLicoes = (licoes ?? []).filter((l) => liberadas.has(l.id))
  const tituloDe = new Map((licoes ?? []).map((l) => [l.id, l.titulo]))
  const turmasDoAluno = (turmas ?? []).filter((t) => t.alunoIds.includes(aluno.id))
  /** A turma do aluno pela qual a lição chegou, se veio por uma. */
  const turmaDaLicao = (licaoId: string) =>
    turmasDoAluno.find((t) => turmasDasLicoes?.get(licaoId)?.has(t.id))?.nome
  const inicioDoMes = inicioDoMesNoBrasil()
  const doMes = (sessoes ?? []).filter((s) => s.iniciada_em >= inicioDoMes).length
  // A única trava do tutor: as sessões por mês que o professor escolheu (0028).
  const limite = professor?.tutor_sessoes_mes ?? 20

  return (
    <div className="mt-5 space-y-6">
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-neutral-500">Lições no tutor</h2>
          <button
            type="button"
            onClick={() => setEscolhendo(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Liberar lição
          </button>
        </div>
        {carregandoLicoes ? (
          <div className="mt-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : minhasLicoes.length === 0 ? (
          <p className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-8 text-center text-sm text-neutral-500">
            {primeiroNome} ainda não tem lições no tutor. Ao liberar a primeira, o Tutor aparece no app.
            {!temConta && ` ${primeiroNome} ainda não tem conta: o tutor aparece quando entrar no app pela primeira vez.`}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
            {minhasLicoes.map((licao) => {
              const turma = turmaDaLicao(licao.id)
              const praticas = (sessoes ?? []).filter((s) => s.licao_id === licao.id).length
              return (
                <li key={licao.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                    <Mic className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{licao.titulo}</span>
                    <span className={`flex items-center gap-1 text-xs ${turma ? 'text-violet-700' : 'text-neutral-500'}`}>
                      {turma && <UsersRound className="h-3 w-3" />}
                      {turma ? `pela turma ${turma}` : 'liberada só para ' + primeiroNome}
                      {' · '}
                      {praticas === 0 ? 'ainda não praticou' : `${praticas} ${praticas === 1 ? 'prática' : 'práticas'}`}
                    </span>
                  </span>
                  {/* A lição da turma sai pela turma (Liberar na lição), não aluno por aluno. */}
                  {!turma && (
                    <button
                      type="button"
                      onClick={() => tirar.mutate({ alunoId: aluno.id, licaoId: licao.id })}
                      disabled={tirar.isPending}
                      className="rounded-full px-3 py-1.5 text-xs font-bold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      Remover
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {tirar.isError && (
          <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{tirar.error.message}</p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-neutral-500">
          Práticas{' '}
          <span className="text-neutral-400">
            · {doMes} de {limite} no mês
          </span>
        </h2>
        {!sessoes?.length ? (
          <p className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-8 text-center text-sm text-neutral-500">
            {primeiroNome} ainda não praticou com o tutor.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
            {sessoes.map((s) => (
              <SessaoNaLista key={s.id} sessao={s} tituloDaLicao={tituloDe.get(s.licao_id) ?? 'Lição'} />
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Limite de sessões, voz e microfone ficam em{' '}
          <Link to="/tutor?aba=preferencias" className="font-bold text-neutral-700 underline">
            Tutor → Preferências
          </Link>
          .
        </p>
      </section>

      {escolhendo && (
        <EscolherLicoes
          aluno={aluno}
          licoes={(licoes ?? []).filter((l) => !liberadas.has(l.id))}
          aoFechar={() => setEscolhendo(false)}
        />
      )}
    </div>
  )
}

/** "Liberar lição" na ficha: o mesmo gesto, ao contrário — um aluno, várias lições. */
function EscolherLicoes({ aluno, licoes, aoFechar }: { aluno: Aluno; licoes: LicaoNaLista[]; aoFechar: () => void }) {
  const liberar = useLiberarParaAluno()
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const primeiroNome = aluno.nome.split(' ')[0]
  const escolhidas = licoes.filter((l) => marcadas.has(l.id))
  const rascunhos = escolhidas.filter((l) => l.professor_id && !l.publicada).length

  function alternar(id: string) {
    setMarcadas((atuais) => {
      const novas = new Set(atuais)
      if (novas.has(id)) novas.delete(id)
      else novas.add(id)
      return novas
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/60 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Liberar no tutor</h2>
            <p className="text-sm text-neutral-500">Para {aluno.nome}</p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="text-neutral-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
          {licoes.length === 0 && (
            <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
              {primeiroNome} já tem todas as lições.{' '}
              <Link to="/tutor/licoes/nova" className="font-bold underline">
                Criar uma nova
              </Link>
            </p>
          )}
          {licoes.map((l) => {
            const marcada = marcadas.has(l.id)
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => alternar(l.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition ${
                  marcada ? 'bg-neutral-900' : 'bg-neutral-50'
                }`}
              >
                <span className={`min-w-0 flex-1 text-sm font-bold ${marcada ? 'text-white' : 'text-neutral-700'}`}>
                  {l.titulo}
                  {l.nivel_cefr && <span className="text-neutral-400"> · {l.nivel_cefr}</span>}
                  <span className={`block text-[11px] font-medium ${marcada ? 'text-neutral-300' : 'text-neutral-400'}`}>
                    {!l.professor_id ? 'Biblioteca' : l.publicada ? 'Sua' : 'Sua · rascunho'}
                  </span>
                </span>
                {marcada && (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white">
                    <Check className="h-3.5 w-3.5 text-neutral-900" />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {rascunhos > 0 && (
          <p className="mt-4 rounded-2xl bg-neutral-100 px-4 py-2.5 text-xs text-neutral-600">
            {rascunhos === 1 ? 'Uma lição está' : `${rascunhos} lições estão`} em rascunho: ao liberar, é publicada.
          </p>
        )}
        {liberar.error && (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{liberar.error.message}</p>
        )}
        <button
          onClick={() => liberar.mutate({ alunoId: aluno.id, licoes: escolhidas }, { onSuccess: aoFechar })}
          disabled={escolhidas.length === 0 || liberar.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {liberar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {escolhidas.length === 0
            ? 'Escolha as lições'
            : `Liberar ${escolhidas.length} ${escolhidas.length === 1 ? 'lição' : 'lições'} para ${primeiroNome}`}
        </button>
      </div>
    </div>
  )
}
