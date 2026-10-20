import { useState } from 'react'
import roteiroJson from '../roteiro/licao-clima.json'
import type { Roteiro } from '../src/tipos.ts'
import { codigoDeAcesso, entrarComSenha } from './api.ts'
import { AulaDoTutor } from './AulaDoTutor.tsx'

const roteiro = roteiroJson as Roteiro

/**
 * A porta da POC: sem a senha certa (conferida pela função), nada da aula
 * aparece — e a senha não está em lugar nenhum do código.
 */
export function App() {
  const [liberado, setLiberado] = useState(() => Boolean(codigoDeAcesso()))
  if (!liberado) return <TelaDeSenha aoEntrar={() => setLiberado(true)} />
  return <AulaDoTutor roteiro={roteiro} modo="lab" />
}

function TelaDeSenha({ aoEntrar }: { aoEntrar: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [conferindo, setConferindo] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setConferindo(true)
    try {
      if (await entrarComSenha(senha.trim())) aoEntrar()
      else setErro('Senha incorreta.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui conferir a senha.')
    } finally {
      setConferindo(false)
    }
  }

  return (
    <div className="grid h-dvh place-items-center px-4">
      <form onSubmit={entrar} className="w-full max-w-xs rounded-3xl bg-[var(--cartao)] p-6">
        <p className="text-lg font-extrabold">Tutor de inglês</p>
        <p className="mt-1 text-sm text-neutral-500">Versão de teste. Digite a senha para entrar.</p>
        <input
          type="password"
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          className="mt-4 w-full rounded-full bg-[var(--fundo)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
        {erro && <p className="mt-2 text-xs font-medium text-rose-700">{erro}</p>}
        <button
          disabled={!senha.trim() || conferindo}
          className="mt-3 w-full rounded-full bg-violet-600 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {conferindo ? 'Conferindo…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
