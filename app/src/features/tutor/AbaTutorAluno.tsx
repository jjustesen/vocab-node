import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, Mic } from 'lucide-react'
import { Chave } from '@/components/Interruptor'
import { useProfessor } from '@/features/planos/api'
import type { Aluno, TutorAcesso } from '@/types/db'
import {
  inicioDoMesNoBrasil,
  useAlternarLicao,
  useAlternarTutor,
  useLiberacoesTutor,
  useLicoesTutor,
  useSessoesDoAluno,
} from './api'
import { SessaoNaLista } from './SessaoNaLista'

/**
 * A aba Tutor da ficha do aluno: a chave do tutor DESTE aluno, quais lições
 * da biblioteca ele pratica e como foram as práticas.
 */
export function AbaTutorAluno({ aluno, acesso, temConta }: { aluno: Aluno; acesso: TutorAcesso; temConta: boolean }) {
  const id = useId()
  const alternar = useAlternarTutor()
  const { data: licoes, isLoading: carregandoLicoes } = useLicoesTutor()
  const { data: liberacoes } = useLiberacoesTutor()
  const alternarLicao = useAlternarLicao()
  const { data: sessoes } = useSessoesDoAluno(aluno.id)
  const { data: professor } = useProfessor()
  const primeiroNome = aluno.nome.split(' ')[0]
  const liberadas = liberacoes?.get(aluno.id) ?? new Set<string>()
  const tituloDe = new Map((licoes ?? []).map((l) => [l.id, l.titulo]))
  const inicioDoMes = inicioDoMesNoBrasil()
  const doMes = (sessoes ?? []).filter((s) => s.iniciada_em >= inicioDoMes).length
  const limite = Math.min(professor?.tutor_sessoes_mes ?? acesso.max_sessoes_mes, acesso.max_sessoes_mes)

  return (
    <div className="mt-5 space-y-6">
      <div className="flex items-start gap-4 rounded-3xl bg-white p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
          <Mic className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="font-extrabold">
            Tutor {aluno.tutor_ativo ? 'ligado' : 'desligado'}
          </label>
          <p id={`${id}-descricao`} className="mt-1 text-sm text-neutral-500">
            Com o tutor ligado, {primeiroNome} vê o item Tutor no app e pratica em voz as lições marcadas abaixo.
            {!temConta && ` ${primeiroNome} ainda não tem conta: o tutor aparece quando entrar no app pela primeira vez.`}
          </p>
          {alternar.isError && <p className="mt-2 text-sm font-medium text-rose-700">{alternar.error.message}</p>}
        </div>
        <Chave
          id={id}
          descritoPor={`${id}-descricao`}
          ligado={aluno.tutor_ativo}
          aoMudar={(ligado) => alternar.mutate({ alunoId: aluno.id, ligado })}
          className="mt-1"
        />
      </div>

      <section>
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-neutral-500">
          Lições que {primeiroNome} pratica
        </h2>
        {carregandoLicoes ? (
          <div className="mt-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : !licoes?.length ? (
          <p className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-8 text-center text-sm text-neutral-500">
            Ainda não há lições publicadas na biblioteca do tutor.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
            {licoes.map((licao) => {
              const marcada = liberadas.has(licao.id)
              return (
                <li key={licao.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marcada}
                    onClick={() => alternarLicao.mutate({ alunoId: aluno.id, licaoId: licao.id, liberada: !marcada })}
                    className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-neutral-50"
                  >
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${
                        marcada ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                      }`}
                    >
                      {marcada && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-bold">{licao.titulo}</span>
                        {licao.nivel_cefr && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                            {licao.nivel_cefr}
                          </span>
                        )}
                        {/* A biblioteca é de todos; estas o professor fez com o material dele. */}
                        {licao.professor_id && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">sua</span>
                        )}
                      </span>
                      {licao.descricao && <span className="mt-0.5 block text-sm text-neutral-500">{licao.descricao}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {alternarLicao.isError && (
          <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            Não consegui salvar a lição. Verifique sua internet e tente de novo.
          </p>
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
    </div>
  )
}
