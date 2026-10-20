import { useAlunos } from '@/features/alunos/api'
import type { Professor, TutorAcesso } from '@/types/db'
import { emReais, useSessoesDoMes, useTodasAsLicoes } from './api'
import { SessaoNaLista } from './SessaoNaLista'

/** Quantas práticas aparecem em "Resultados recentes" — o resto está na ficha de cada aluno. */
const RECENTES = 12

/**
 * O uso do mês e como foram as últimas práticas dos alunos. Os testes do
 * professor ("Experimentar como aluno") entram no custo, mas à parte: não são
 * resultado de ninguém.
 */
export function AbaResultadosDoTutor({ professor, acesso }: { professor: Professor; acesso: TutorAcesso }) {
  const { data: alunos } = useAlunos('ativo')
  const { data: licoes } = useTodasAsLicoes()
  const { data: sessoes } = useSessoesDoMes()

  const tituloDe = new Map((licoes ?? []).map((l) => [l.id, l.titulo]))
  const nomeDe = new Map((alunos ?? []).map((a) => [a.id, a.nome]))
  const dosAlunos = (sessoes ?? []).filter((s) => !s.teste)
  const testes = (sessoes ?? []).filter((s) => s.teste)
  const custo = (lista: typeof dosAlunos) => lista.reduce((total, s) => total + s.custo_usd, 0)
  const limite = Math.min(professor.tutor_sessoes_mes, acesso.max_sessoes_mes)

  return (
    <>
      <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Uso do mês</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Numero valor={String(dosAlunos.length)} rotulo={dosAlunos.length === 1 ? 'sessão dos alunos' : 'sessões dos alunos'} />
        <Numero valor={String(dosAlunos.filter((s) => s.concluida_em).length)} rotulo="terminadas até o fim" />
        <Numero valor={emReais(custo(dosAlunos))} rotulo={`custo de IA (US$ ${custo(dosAlunos).toFixed(2)})`} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Cada aluno pode fazer até {limite} sessões por mês.{' '}
        {testes.length > 0 &&
          `Seus testes: ${testes.length} ${testes.length === 1 ? 'sessão' : 'sessões'}, ${emReais(custo(testes))}. `}
        Durante o beta o custo é por nossa conta — o número está aqui para você ver quanto o tutor é usado.
      </p>

      <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Resultados recentes</h2>

      {dosAlunos.length === 0 ? (
        <div className="mt-3 rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center">
          <p className="font-bold text-neutral-700">Nenhuma prática neste mês</p>
          <p className="mt-1 text-sm text-neutral-500">
            Quando um aluno praticar com o tutor, o que ele disse sozinho e o que precisou de ajuda aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white">
          {dosAlunos.slice(0, RECENTES).map((s) => (
            <SessaoNaLista
              key={s.id}
              sessao={s}
              tituloDaLicao={tituloDe.get(s.licao_id) ?? 'Lição'}
              nomeDoAluno={(s.aluno_id && nomeDe.get(s.aluno_id)) || 'Aluno'}
            />
          ))}
        </ul>
      )}
    </>
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
