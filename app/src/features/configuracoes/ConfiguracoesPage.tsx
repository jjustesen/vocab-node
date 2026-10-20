import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DoorOpen, KeyRound, Loader2, Mic, Settings2 } from 'lucide-react'
import { Interruptor } from '@/components/Interruptor'
import { FormNovaSenha } from '@/features/auth/NovaSenha'
import { useProfessor } from '@/features/planos/api'
import { AbaTutor } from '@/features/tutor/AbaTutor'
import { useAcessoTutor } from '@/features/tutor/api'
import { useSalvarConfiguracoes } from './api'

type Aba = 'geral' | 'tutor'

const ABAS: { id: Aba; rotulo: string; Icone: typeof Settings2 }[] = [
  { id: 'geral', rotulo: 'Geral', Icone: Settings2 },
  { id: 'tutor', rotulo: 'Tutor', Icone: Mic },
]

/**
 * Configurações da plataforma, do professor.
 *
 * Nasceu com um item só — a sala de espera — e é de propósito uma lista de
 * cartões com interruptor: o próximo ajuste entra como mais um cartão, sem
 * redesenhar a página. O tutor ganhou aba própria porque é mais que um ajuste:
 * tem a lista de alunos, o uso do mês e os resultados. A aba só existe para
 * quem foi liberado no beta.
 */
export function ConfiguracoesPage() {
  const { data: professor, isLoading } = useProfessor()
  const { data: acessoTutor } = useAcessoTutor()
  const salvar = useSalvarConfiguracoes()
  // A aba vai na URL, como na turma: a ficha do aluno e o link "?aba=tutor"
  // caem direto nela.
  const [params, setParams] = useSearchParams()
  const abas = ABAS.filter((a) => a.id !== 'tutor' || acessoTutor)
  const aba: Aba = abas.some((a) => a.id === params.get('aba')) ? (params.get('aba') as Aba) : 'geral'
  const trocarAba = (nova: Aba) => setParams(nova === 'geral' ? {} : { aba: nova }, { replace: true })

  if (isLoading || !professor) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold">Configurações</h1>
      <p className="mt-0.5 text-sm text-neutral-500">Como a plataforma funciona para você e seus alunos.</p>

      {abas.length > 1 && (
        <div role="tablist" aria-label="Seções das configurações" className="mt-5 flex flex-wrap gap-1.5">
          {abas.map(({ id, rotulo, Icone }) => (
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
      )}

      {aba === 'tutor' && acessoTutor ? (
        <AbaTutor professor={professor} acesso={acessoTutor} />
      ) : (
        <>
          <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Aulas ao vivo</h2>

          <div className="mt-3 space-y-3">
            <Interruptor
              Icone={DoorOpen}
              titulo="Sala de espera"
              descricao="O aluno só entra na chamada depois que você admitir. Enquanto espera, ele não vê nem ouve a aula — e você recebe um aviso na sala com o nome dele. Vale para todas as suas salas, individuais e de turma."
              ligado={professor.sala_de_espera}
              aoMudar={(ligado) => salvar.mutate({ sala_de_espera: ligado })}
            />
          </div>

          {salvar.isError && (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              Não consegui salvar. Verifique sua internet e tente de novo.
            </p>
          )}

          <h2 className="mt-8 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Conta</h2>

          <div className="mt-3">
            <TrocarSenha />
          </div>
        </>
      )}
    </div>
  )
}

/** Fechado por padrão: é um ajuste raro, e três campos de senha abertos poluem a página. */
function TrocarSenha() {
  const [aberto, setAberto] = useState(false)
  const [trocada, setTrocada] = useState(false)

  return (
    <div className="rounded-3xl bg-white p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">Senha</p>
          <p className="mt-1 text-sm text-neutral-500">
            {trocada
              ? 'Senha trocada. Use a nova na próxima vez que entrar.'
              : 'Esqueceu a atual? Saia e use "Esqueci minha senha" na tela de login.'}
          </p>
        </div>
        {!aberto && (
          <button
            onClick={() => {
              setAberto(true)
              setTrocada(false)
            }}
            className="shrink-0 rounded-full bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200"
          >
            Trocar senha
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-2 max-w-sm sm:ml-14">
          <FormNovaSenha
            pedirSenhaAtual
            rotulo="Salvar nova senha"
            aoConcluir={() => {
              setAberto(false)
              setTrocada(true)
            }}
          />
          <button
            onClick={() => setAberto(false)}
            className="mt-2 w-full py-2 text-xs font-bold text-neutral-500"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
