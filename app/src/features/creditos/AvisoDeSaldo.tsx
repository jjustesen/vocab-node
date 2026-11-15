import { Link } from 'react-router-dom'
import { Coins } from 'lucide-react'
import { reais } from '@/lib/custo-ia'
import { useSaldoDeCreditos } from './api'

/**
 * Embaixo de um botão que gasta créditos: o saldo e, se não der para a
 * reserva da ação, o caminho para adicionar (docs/TUTOR-TRILHAS.md §5.3,
 * "antes de cada ação, o custo aparece").
 */
export function AvisoDeSaldo({ reserva, acao }: { reserva: number; acao: string }) {
  const { data: saldo } = useSaldoDeCreditos()
  if (saldo === undefined) return null
  const falta = saldo < reserva
  return (
    <p
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs ${
        falta ? 'rounded-2xl bg-amber-50 px-3 py-2 font-medium text-amber-900' : 'text-neutral-500'
      }`}
    >
      <Coins className="h-3.5 w-3.5 shrink-0" />
      {falta ? (
        <>
          Seu saldo é {reais(saldo)} e {acao} reserva até {reais(reserva)}.
          <Link to="/creditos" className="font-bold underline">
            Adicionar créditos
          </Link>
        </>
      ) : (
        <>
          Sai dos seus créditos (saldo {reais(saldo)}). Reserva até {reais(reserva)}; o que sobrar volta.
        </>
      )}
    </p>
  )
}
