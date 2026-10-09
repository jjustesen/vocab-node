import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap, Loader2 } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { FormNovaSenha } from './NovaSenha'

/**
 * Onde cai o link de "esqueci minha senha" do e-mail.
 *
 * O link já entra logado (o Supabase troca o token do e-mail por uma sessão,
 * ver `chegouPeloLinkDeRecuperacao`), então aqui só falta escolher a senha
 * nova. Sem sessão, o link venceu ou já foi usado — ele vale uma vez só.
 */
export function RedefinirSenhaPage() {
  const { session, carregando } = useAuth()
  const navegar = useNavigate()

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-violet-300 text-neutral-900">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-lg font-extrabold">Vocab Node</span>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-extrabold">Nova senha</h1>

          {carregando ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          ) : session ? (
            <>
              <p className="mt-1 text-sm text-neutral-500">
                Escolha a senha nova para <span className="font-bold">{session.user.email}</span>.
              </p>
              <FormNovaSenha
                pedirSenhaAtual={false}
                rotulo="Salvar e entrar"
                aoConcluir={() => navegar('/hoje', { replace: true })}
              />
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-neutral-500">
                Este link expirou ou já foi usado. Peça um novo — ele chega no seu e-mail em alguns minutos.
              </p>
              <Link
                to="/entrar-professor?modo=recuperar"
                className="mt-6 flex w-full items-center justify-center rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white"
              >
                Pedir um link novo
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
