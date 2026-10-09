import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { clienteCadastro } from '@/lib/cadastro-auth'
import { supabase } from '@/lib/supabase'

/**
 * Troca a senha de quem está logado — usado pelo link de "esqueci minha senha"
 * (`RedefinirSenhaPage`) e pelo cartão de Configurações.
 *
 * Em Configurações pede a senha ATUAL: o `updateUser` do Supabase não confere
 * nada, e sem isso qualquer um com o computador do professor aberto trocaria a
 * senha dele. A conferência vai por um cliente descartável, para não mexer na
 * sessão que está em uso. Pelo link de recuperação não dá para pedir — quem
 * esqueceu a senha não tem a atual; ali a prova é o próprio e-mail.
 */
export function FormNovaSenha({
  pedirSenhaAtual,
  rotulo,
  aoConcluir,
}: {
  pedirSenhaAtual: boolean
  rotulo: string
  aoConcluir: () => void
}) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const trocar = useMutation({
    mutationFn: async () => {
      if (pedirSenhaAtual) {
        const { data } = await supabase.auth.getUser()
        const email = data.user?.email
        if (!email) throw new Error('Sessão expirada. Entre novamente.')
        const { error } = await clienteCadastro().auth.signInWithPassword({ email, password: atual })
        if (error) throw new Error('A senha atual não confere.')
      }
      const { error } = await supabase.auth.updateUser({ password: nova })
      if (error) throw error
    },
    onSuccess: () => {
      setAtual('')
      setNova('')
      setRepetida('')
      aoConcluir()
    },
    onError: (e) => setErro(traduzirErroDeSenha(e)),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setErro(null)
        if (nova !== repetida) {
          setErro('As duas senhas novas não são iguais.')
          return
        }
        trocar.mutate()
      }}
    >
      {pedirSenhaAtual && (
        <Campo rotulo="Senha atual" valor={atual} aoMudar={setAtual} autoComplete="current-password" />
      )}
      <Campo
        rotulo="Nova senha"
        valor={nova}
        aoMudar={setNova}
        autoComplete="new-password"
        placeholder="mínimo 8 caracteres"
        minLength={8}
      />
      <Campo
        rotulo="Repita a nova senha"
        valor={repetida}
        aoMudar={setRepetida}
        autoComplete="new-password"
        minLength={8}
      />

      {erro && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{erro}</p>
      )}

      <button
        type="submit"
        disabled={trocar.isPending}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-60"
      >
        {trocar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {rotulo}
      </button>
    </form>
  )
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  autoComplete,
  placeholder,
  minLength,
}: {
  rotulo: string
  valor: string
  aoMudar: (valor: string) => void
  autoComplete: string
  placeholder?: string
  minLength?: number
}) {
  return (
    <label className="mt-4 block">
      <span className="text-xs font-bold text-neutral-600">{rotulo}</span>
      <input
        required
        type="password"
        minLength={minLength}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
      />
    </label>
  )
}

function traduzirErroDeSenha(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('should be different')) return 'A nova senha precisa ser diferente da atual.'
  if (msg.includes('Password should be')) return 'A senha precisa de ao menos 8 caracteres.'
  if (msg.includes('Auth session missing')) return 'O link expirou. Peça um novo na tela de login.'
  return msg
}
