import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { HojePage } from '@/features/hoje/HojePage'
import { AlunosPage } from '@/features/alunos/AlunosPage'
import { AlunoPage } from '@/features/alunos/AlunoPage'
import { AtividadesPage } from '@/features/atividades/AtividadesPage'
import { NovaAtividadePage } from '@/features/atividades/NovaAtividadePage'
import { GerarAtividadePage } from '@/features/atividades/GerarAtividadePage'
import { GerarLotePage } from '@/features/atividades/GerarLotePage'
import { ResultadoAtribuicaoPage } from '@/features/resultados/ResultadoAtribuicaoPage'
import { AtividadeDetalhePage } from '@/features/atividades/AtividadeDetalhePage'
import { EditarAtividadePage } from '@/features/atividades/EditarAtividadePage'
import { TarefaPage } from '@/features/tarefa/TarefaPage'
import { CadastroAlunoPage } from '@/features/cadastro/CadastroAlunoPage'
import { AlunoAuthProvider, useAlunoAuth } from '@/features/aluno-auth/AlunoAuthProvider'
import { EntrarAlunoPage } from '@/features/aluno-auth/EntrarAlunoPage'
import { PainelAlunoPage } from '@/features/painel/PainelAlunoPage'
import { TrilhaAlunoPage } from '@/features/painel/TrilhaAlunoPage'
import { AgendaPage } from '@/features/aulas/AgendaPage'
import { TrilhaDetalhePage } from '@/features/trilhas/TrilhaDetalhePage'
import { TrilhaDoAlunoPage } from '@/features/trilhas/TrilhaDoAlunoPage'
import { FinanceiroPage } from '@/features/financeiro/FinanceiroPage'
import { PlanoPage } from '@/features/planos/PlanoPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />

        {/* Rota do aluno: sem sessão, sem RLS. Ver features/tarefa/TarefaPage.tsx. */}
        <Route path="/t/:token" element={<TarefaPage />} />

        {/* Cadastro (RF-22/23/24): usa o cliente do aluno (@/lib/supabase-aluno) só pro signUp, sem precisar do provider abaixo. */}
        <Route path="/cadastro/:token" element={<CadastroAlunoPage />} />

        {/* Área do aluno logado (RF-28) — sessão própria, nunca a do professor. */}
        <Route element={<ProvedorSessaoAluno />}>
          <Route path="/entrar-aluno" element={<EntrarAlunoPage />} />
          <Route element={<ExigeSessaoAluno />}>
            <Route path="/painel" element={<PainelAlunoPage />} />
            <Route path="/painel/trilha/:id" element={<TrilhaAlunoPage />} />
            <Route path="/painel/tarefa/:atribuicaoId" element={<TarefaPage />} />
          </Route>
        </Route>

        {/* Área do professor. */}
        <Route element={<ExigeSessao />}>
          <Route element={<Layout />}>
            <Route path="/hoje" element={<HojePage />} />
            <Route path="/alunos" element={<AlunosPage />} />
            <Route path="/alunos/:id" element={<AlunoPage />} />
            <Route path="/alunos/:id/trilhas/:trilhaId" element={<TrilhaDoAlunoPage />} />
            <Route path="/atividades" element={<AtividadesPage />} />
            <Route path="/atividades/nova" element={<NovaAtividadePage />} />
            <Route path="/atividades/gerar" element={<GerarAtividadePage />} />
            <Route path="/atividades/lote" element={<GerarLotePage />} />
            <Route path="/atividades/:id" element={<AtividadeDetalhePage />} />
            <Route path="/atividades/:id/editar" element={<EditarAtividadePage />} />
            <Route path="/resultados/:atribuicaoId" element={<ResultadoAtribuicaoPage />} />
            {/* Trilhas é uma aba da biblioteca (P11) — a mesma página, com a
                aba escolhida pela rota, para o endereço continuar direto. */}
            <Route path="/trilhas" element={<AtividadesPage />} />
            <Route path="/trilhas/:id" element={<TrilhaDetalhePage />} />
            <Route path="/agenda" element={<AgendaPage />} />
            <Route path="/financeiro" element={<FinanceiroPage />} />
            <Route path="/plano" element={<PlanoPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/hoje" replace />} />
      </Routes>
    </AuthProvider>
  )
}

function ExigeSessao() {
  const { session, carregando } = useAuth()

  if (carregando) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (!session) return <Navigate to="/entrar" replace />

  // O <Layout /> vem da rota filha; aqui só liberamos a passagem.
  return <Outlet />
}

function ProvedorSessaoAluno() {
  return (
    <AlunoAuthProvider>
      <Outlet />
    </AlunoAuthProvider>
  )
}

function ExigeSessaoAluno() {
  const { session, carregando } = useAlunoAuth()

  if (carregando) {
    return (
      <div className="grid min-h-dvh place-items-center bg-areia">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (!session) return <Navigate to="/entrar-aluno" replace />

  return <Outlet />
}
