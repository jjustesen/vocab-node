import { useId } from 'react'
import { Link } from 'react-router-dom'
import { AudioLines, CalendarDays, ChevronRight, Ear } from 'lucide-react'
import { Interruptor } from '@/components/Interruptor'
import { useSalvarConfiguracoes } from '@/features/configuracoes/api'
import type { Professor, TutorAcesso } from '@/types/db'

/** Como o tutor se comporta com todos os alunos do professor. */
export function AbaPreferenciasDoTutor({ professor, acesso }: { professor: Professor; acesso: TutorAcesso }) {
  const salvar = useSalvarConfiguracoes()
  return (
    <>
      <div className="mt-8 space-y-3">
        <Interruptor
          Icone={AudioLines}
          titulo="Voz natural"
          descricao="O tutor fala com uma voz gerada por IA, que troca de português para inglês sem mudar de voz. Desligada, ele usa a voz do celular ou do computador do aluno — sem custo, mas bem mais robótica."
          ligado={professor.tutor_voz_natural}
          aoMudar={(ligado) => salvar.mutate({ tutor_voz_natural: ligado })}
        />
        <Link
          to="/tutor/vozes"
          className="flex items-center justify-between gap-3 rounded-3xl bg-white px-5 py-4 text-sm font-bold text-violet-700 hover:bg-violet-50"
        >
          Comparar vozes de outros serviços
          <ChevronRight className="h-4 w-4" />
        </Link>
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
          Uma sessão é uma lição do começo ao fim. O beta permite até {maximo}.
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
