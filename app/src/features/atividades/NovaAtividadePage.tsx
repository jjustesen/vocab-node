import { useNavigate } from 'react-router-dom'
import { useCriarAtividade } from './api'
import { AtividadeForm } from './AtividadeForm'

export function NovaAtividadePage() {
  const navigate = useNavigate()
  const criar = useCriarAtividade()

  return (
    <AtividadeForm
      tituloPagina="Nova atividade"
      rotuloBotao="Salvar atividade"
      aoSalvar={async (dados) => {
        const atividade = await criar.mutateAsync(dados)
        navigate(`/atividades/${atividade.id}`)
      }}
    />
  )
}
