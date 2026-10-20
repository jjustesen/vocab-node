import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { AulaDoTutor } from '../../../../poc-tutor/web/AulaDoTutor.tsx'
import { usarConexao } from '../../../../poc-tutor/web/conexao.ts'
import { registrarGravadas } from '../../../../poc-tutor/web/vozGemini.ts'
import { chavesTutorAluno, concluirSessao, conexaoDoAluno, iniciarSessao, useLicaoAberta } from './api'

/**
 * /painel/tutor/:licaoId — a aula com o tutor, em tela cheia (sem a barra do
 * painel, como a tarefa).
 *
 * A tela é a mesma do laboratório (poc-tutor/web/AulaDoTutor.tsx); o que muda
 * é a conexão: em vez da senha da POC, o token do aluno e a sessão aberta no
 * toque em Começar — é essa sessão que conta no limite do mês e guarda o
 * resultado que o professor vê.
 */
export function PraticaTutorPage() {
  const { licaoId } = useParams<{ licaoId: string }>()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading, error } = useLicaoAberta(licaoId)
  const sessaoId = useRef<string | null>(null)

  // A primeira chamada só sai no toque em Começar — depois deste efeito.
  useEffect(() => usarConexao(conexaoDoAluno(() => sessaoId.current)), [])
  useEffect(() => {
    if (data) registrarGravadas(data.falasGravadas, data.urlFalas)
  }, [data])

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (error || !data || !licaoId) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-5">
        <div className="max-w-sm text-center">
          <p className="font-bold text-neutral-700">Não consegui abrir esta lição</p>
          <p className="mt-1 text-sm text-neutral-500">{error?.message ?? 'Tente de novo em instantes.'}</p>
          <Link to="/painel/tutor" className="mt-4 inline-block rounded-full bg-neutral-900 px-5 py-3 text-sm font-bold text-white">
            Voltar às lições
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[var(--fundo)]">
      <AulaDoTutor
        roteiro={data.roteiro}
        modo="aluno"
        opcoesIniciais={data.opcoes}
        aoComecar={async () => {
          const { sessaoId: id } = await iniciarSessao(licaoId)
          sessaoId.current = id
        }}
        aoTerminar={(resumo) => {
          const id = sessaoId.current
          if (!id) return
          void concluirSessao(id, resumo)
            .catch((e) => console.warn('tutor: não gravei o resumo', e))
            .finally(() => qc.invalidateQueries({ queryKey: chavesTutorAluno.licoes }))
        }}
        aoSair={() => {
          qc.invalidateQueries({ queryKey: chavesTutorAluno.licoes })
          navegar('/painel/tutor')
        }}
      />
    </div>
  )
}
