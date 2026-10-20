import { useSearchParams } from 'react-router-dom'
import { BookOpen, ChartColumn, Loader2, SlidersHorizontal, Users } from 'lucide-react'
import { useProfessor } from '@/features/planos/api'
import { useAcessoTutor } from './api'
import { AbaAlunosDoTutor } from './AbaAlunosDoTutor'
import { AbaLicoes } from './AbaLicoes'
import { AbaPreferenciasDoTutor } from './AbaPreferenciasDoTutor'
import { AbaResultadosDoTutor } from './AbaResultadosDoTutor'

type Aba = 'licoes' | 'alunos' | 'resultados' | 'preferencias'

const ABAS: { id: Aba; rotulo: string; Icone: typeof Users }[] = [
  { id: 'licoes', rotulo: 'Lições', Icone: BookOpen },
  { id: 'alunos', rotulo: 'Alunos', Icone: Users },
  { id: 'resultados', rotulo: 'Resultados', Icone: ChartColumn },
  { id: 'preferencias', rotulo: 'Preferências', Icone: SlidersHorizontal },
]

/**
 * /tutor — a casa do tutor oral para o professor no beta: as lições (as dele,
 * geradas pela IA e editáveis, e as da biblioteca), quem tem o tutor ligado,
 * o uso e os resultados, e como o tutor se comporta.
 *
 * A aba vai na URL, como na turma: a ficha do aluno e o editor de lições
 * apontam direto para uma delas.
 */
export function TutorPage() {
  const { data: professor, isLoading } = useProfessor()
  const { data: acesso, isLoading: carregandoAcesso } = useAcessoTutor()
  const [params, setParams] = useSearchParams()
  const aba: Aba = ABAS.some((a) => a.id === params.get('aba')) ? (params.get('aba') as Aba) : 'licoes'
  const trocarAba = (nova: Aba) => setParams(nova === 'licoes' ? {} : { aba: nova }, { replace: true })

  if (isLoading || carregandoAcesso || !professor) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (!acesso) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center">
        <p className="font-bold text-neutral-700">O tutor está em beta fechado</p>
        <p className="mt-1 text-sm text-neutral-500">Ele ainda não foi liberado para a sua conta.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold">Tutor</h1>
      <p className="mt-0.5 text-sm text-neutral-500">
        O tutor conversa com o aluno em voz, nas lições que você liberar, e corrige como você corrigiria: uma coisa de cada
        vez, com pistas em vez da resposta.
      </p>

      <div role="tablist" aria-label="Seções do tutor" className="mt-5 flex flex-wrap gap-1.5">
        {ABAS.map(({ id, rotulo, Icone }) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => trocarAba(id)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
              aba === id ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Icone className="h-4 w-4" />
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'licoes' && <AbaLicoes />}
      {aba === 'alunos' && <AbaAlunosDoTutor acesso={acesso} />}
      {aba === 'resultados' && <AbaResultadosDoTutor professor={professor} acesso={acesso} />}
      {aba === 'preferencias' && <AbaPreferenciasDoTutor professor={professor} acesso={acesso} />}
    </div>
  )
}
