import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { extrairMensagemDeErro } from '@/lib/erro-edge-function'
import type { LicaoAberta } from '@/features/tutor-aluno/api'
import { AulaDoTutor } from '../../../../poc-tutor/web/AulaDoTutor.tsx'
import { usarConexao } from '../../../../poc-tutor/web/conexao.ts'
import { registrarGravadas } from '../../../../poc-tutor/web/vozGemini.ts'
import { chavesTutor } from './api'

/** A mesma porta do aluno (tutor-aluno), no modo professor: lições dele, até rascunho, como teste. */
async function chamarComoProfessor<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tutor-aluno', { body: { ...corpo, modo: 'professor' } })
  if (error) throw new Error(await extrairMensagemDeErro(error))
  return data as T
}

/**
 * /tutor/licoes/:id/experimentar — o professor faz a lição como o aluno faria,
 * com a voz, o microfone e a correção de verdade. A sessão é de teste: não
 * conta no limite de nenhum aluno e fica fora dos resultados (Resultados mostra
 * o custo dela à parte).
 */
export function ExperimentarLicaoPage() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const sessaoId = useRef<string | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['tutor', 'experimentar', id],
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: () => chamarComoProfessor<LicaoAberta>({ acao: 'licao', licaoId: id }),
  })

  useEffect(
    () =>
      usarConexao({
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tutor-aluno`,
        cabecalhos: async () => {
          const { data: s } = await supabase.auth.getSession()
          return { Authorization: `Bearer ${s.session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }
        },
        corpo: () => ({ sessaoId: sessaoId.current, modo: 'professor' }),
      }),
    [],
  )
  useEffect(() => {
    if (data) registrarGravadas(data.falasGravadas, data.urlFalas)
  }, [data])

  const voltar = () => {
    qc.invalidateQueries({ queryKey: chavesTutor.sessoesDoMes })
    navegar(`/tutor/licoes/${id}`)
  }

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (error || !data || !id) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia px-5">
        <div className="max-w-sm text-center">
          <p className="font-bold text-neutral-700">Não consegui abrir a lição</p>
          <p className="mt-1 text-sm text-neutral-500">{error?.message ?? 'Tente de novo em instantes.'}</p>
          <Link to={`/tutor/licoes/${id ?? ''}`} className="mt-4 inline-block rounded-full bg-neutral-900 px-5 py-3 text-sm font-bold text-white">
            Voltar ao editor
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
          const { sessaoId: novo } = await chamarComoProfessor<{ sessaoId: string }>({ acao: 'iniciar', licaoId: id })
          sessaoId.current = novo
        }}
        aoTerminar={(resumo) => {
          const sessao = sessaoId.current
          if (sessao) void chamarComoProfessor({ acao: 'concluir', sessaoId: sessao, resumo }).catch(() => undefined)
        }}
        aoSair={voltar}
      />
    </div>
  )
}
