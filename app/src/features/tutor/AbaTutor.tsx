import { useId } from 'react'
import { Link } from 'react-router-dom'
import { AudioLines, CalendarDays, Ear, Loader2 } from 'lucide-react'
import { Chave, Interruptor } from '@/components/Interruptor'
import { useAlunos } from '@/features/alunos/api'
import { useSalvarConfiguracoes } from '@/features/configuracoes/api'
import { corDoAvatar, inicial } from '@/lib/avatar'
import type { Professor, TutorAcesso } from '@/types/db'
import {
  emReais,
  formatarCusto,
  useAlternarTutor,
  useLiberacoesTutor,
  useLicoesTutor,
  useSessoesDoMes,
} from './api'
import { SessaoNaLista } from './SessaoNaLista'

/** Quantas práticas aparecem em "Resultados recentes" — o resto está na ficha de cada aluno. */
const RECENTES = 8

/**
 * A aba Tutor de Configurações: quem tem o tutor, como ele se comporta, quanto
 * foi usado no mês e como foram as últimas práticas. Só aparece para quem foi
 * liberado no beta (`tutor_acesso`).
 */
export function AbaTutor({ professor, acesso }: { professor: Professor; acesso: TutorAcesso }) {
  const salvar = useSalvarConfiguracoes()
  const { data: alunos, isLoading } = useAlunos('ativo')
  const { data: licoes } = useLicoesTutor()
  const { data: liberacoes } = useLiberacoesTutor()
  const { data: sessoes } = useSessoesDoMes()
  const alternar = useAlternarTutor()

  const comTutor = (alunos ?? []).filter((a) => a.tutor_ativo).length
  const tituloDe = new Map((licoes ?? []).map((l) => [l.id, l.titulo]))
  const nomeDe = new Map((alunos ?? []).map((a) => [a.id, a.nome]))
  const doMes = sessoes ?? []
  const custoDoMes = doMes.reduce((total, s) => total + s.custo_usd, 0)
  const porAluno = new Map<string, { sessoes: number; custo: number }>()
  for (const s of doMes) {
    const atual = porAluno.get(s.aluno_id) ?? { sessoes: 0, custo: 0 }
    porAluno.set(s.aluno_id, { sessoes: atual.sessoes + 1, custo: atual.custo + s.custo_usd })
  }
  const limiteDoProfessor = Math.min(professor.tutor_sessoes_mes, acesso.max_sessoes_mes)

  return (
    <>
      <div className="mt-6 rounded-3xl bg-violet-200 p-5">
        <p className="text-xs font-extrabold uppercase tracking-wide text-violet-800/70">Beta do tutor</p>
        <p className="mt-1 text-sm text-violet-950">
          O tutor conversa com o aluno em voz, nas lições que você liberar para ele, e corrige como você corrigiria: uma
          coisa de cada vez, com pistas em vez da resposta. No beta, vale para até{' '}
          <strong>{acesso.max_alunos} alunos</strong>.
        </p>
      </div>

      <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">
        Alunos com tutor{' '}
        <span className="text-neutral-400">
          · {comTutor} de {acesso.max_alunos}
        </span>
      </h2>

      {alternar.isError && (
        <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{alternar.error.message}</p>
      )}

      {isLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : !alunos?.length ? (
        <div className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center">
          <p className="font-bold text-neutral-700">Nenhum aluno ativo ainda</p>
          <p className="mt-1 text-sm text-neutral-500">Cadastre um aluno em Alunos para ligar o tutor para ele.</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {alunos.map((aluno) => {
            const nLicoes = liberacoes?.get(aluno.id)?.size ?? 0
            const uso = porAluno.get(aluno.id)
            const cheio = !aluno.tutor_ativo && comTutor >= acesso.max_alunos
            return (
              <li key={aluno.id} className="flex items-center gap-3 px-5 py-3.5">
                {/* A chave fica FORA do link: clicar nela liga o tutor, não abre a ficha. */}
                <Link to={`/alunos/${aluno.id}?aba=tutor`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${corDoAvatar(aluno.id)}`}
                  >
                    {inicial(aluno.nome)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{aluno.nome}</span>
                    <span className="block text-xs text-neutral-500">
                      {aluno.tutor_ativo
                        ? `${nLicoes} ${nLicoes === 1 ? 'lição' : 'lições'} · ${uso?.sessoes ?? 0} ${
                            uso?.sessoes === 1 ? 'sessão' : 'sessões'
                          } no mês${uso?.custo ? ` · ${formatarCusto(uso.custo)}` : ''}`
                        : 'tutor desligado'}
                    </span>
                  </span>
                </Link>
                <Chave
                  rotulo={`Tutor de ${aluno.nome}`}
                  ligado={aluno.tutor_ativo}
                  desabilitado={cheio}
                  aoMudar={(ligado) => alternar.mutate({ alunoId: aluno.id, ligado })}
                />
              </li>
            )
          })}
        </ul>
      )}
      {comTutor > 0 && !licoes?.length && (
        <p className="mt-3 text-sm text-neutral-500">Ainda não há lições publicadas na biblioteca. Elas aparecem aqui assim que entrarem.</p>
      )}

      <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Preferências</h2>

      <div className="mt-3 space-y-3">
        <Interruptor
          Icone={AudioLines}
          titulo="Voz natural"
          descricao="O tutor fala com uma voz gerada por IA, que troca de português para inglês sem mudar de voz. Desligada, ele usa a voz do celular ou do computador do aluno — sem custo, mas bem mais robótica."
          ligado={professor.tutor_voz_natural}
          aoMudar={(ligado) => salvar.mutate({ tutor_voz_natural: ligado })}
        />
        <Interruptor
          Icone={Ear}
          titulo="Microfone automático"
          descricao="Depois de cada fala do tutor o microfone abre sozinho e fecha quando o aluno para de falar. Desligado, o aluno toca no botão para responder."
          ligado={professor.tutor_escuta_automatica}
          aoMudar={(ligado) => salvar.mutate({ tutor_escuta_automatica: ligado })}
        />
        <SessoesPorMes
          valor={professor.tutor_sessoes_mes}
          maximo={acesso.max_sessoes_mes}
          aoMudar={(n) => salvar.mutate({ tutor_sessoes_mes: n })}
        />
      </div>

      {salvar.isError && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Não consegui salvar. Verifique sua internet e tente de novo.
        </p>
      )}

      <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Uso do mês</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Numero valor={String(doMes.length)} rotulo={doMes.length === 1 ? 'sessão' : 'sessões'} />
        <Numero valor={String(doMes.filter((s) => s.concluida_em).length)} rotulo="terminadas até o fim" />
        <Numero valor={emReais(custoDoMes)} rotulo={`custo de IA (US$ ${custoDoMes.toFixed(2)})`} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Cada aluno pode fazer até {limiteDoProfessor} sessões por mês. Durante o beta o custo é por nossa conta — o número
        está aqui para você ver quanto o tutor é usado.
      </p>

      <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Resultados recentes</h2>

      {doMes.length === 0 ? (
        <div className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center">
          <p className="font-bold text-neutral-700">Nenhuma prática neste mês</p>
          <p className="mt-1 text-sm text-neutral-500">
            Quando um aluno praticar com o tutor, o que ele disse sozinho e o que precisou de ajuda aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {doMes.slice(0, RECENTES).map((s) => (
            <SessaoNaLista
              key={s.id}
              sessao={s}
              tituloDaLicao={tituloDe.get(s.licao_id) ?? 'Lição'}
              nomeDoAluno={nomeDe.get(s.aluno_id) ?? 'Aluno'}
            />
          ))}
        </ul>
      )}
    </>
  )
}

/** As opções do limite por aluno, cortadas no máximo do beta. */
const OPCOES_SESSOES = [5, 10, 15, 20, 30, 40, 60]

function SessoesPorMes({ valor, maximo, aoMudar }: { valor: number; maximo: number; aoMudar: (n: number) => void }) {
  const id = useId()
  const opcoes = [...new Set([...OPCOES_SESSOES.filter((n) => n <= maximo), Math.min(valor, maximo), maximo])].sort(
    (a, b) => a - b,
  )
  return (
    <div className="flex items-start gap-4 rounded-3xl bg-white p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
        <CalendarDays className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="font-extrabold">
          Sessões por aluno por mês
        </label>
        <p className="mt-1 text-sm text-neutral-500">
          Uma sessão é uma lição do começo ao fim, uns 15 minutos. O beta permite até {maximo}.
        </p>
      </div>
      <select
        id={id}
        value={Math.min(valor, maximo)}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="mt-1 shrink-0 rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm font-bold"
      >
        {opcoes.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  )
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="rounded-3xl bg-white p-5">
      <p className="text-2xl font-extrabold">{valor}</p>
      <p className="mt-0.5 text-xs font-semibold text-neutral-500">{rotulo}</p>
    </div>
  )
}
