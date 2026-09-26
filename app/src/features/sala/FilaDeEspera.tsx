import { useEffect, useRef } from 'react'
import { DoorOpen } from 'lucide-react'
import { useAtenderEspera, useFilaDeEspera } from './api'

/**
 * Quem está na sala de espera, do lado do professor (0018).
 *
 * Só aparece quando há alguém: uma caixa vazia dizendo "ninguém esperando"
 * ficaria a aula inteira por cima do vídeo sem servir para nada. Quando
 * alguém chega, ela surge no canto com um toque curto — o professor está
 * olhando para o exercício, não para o canto da tela, e um aluno esperando
 * sem ninguém perceber é pior do que não ter sala de espera.
 */
export function FilaDeEspera({ salaId, ligada }: { salaId: string; ligada: boolean }) {
  const { data: fila = [] } = useFilaDeEspera(salaId, ligada)
  const atender = useAtenderEspera(salaId)

  // O toque só para quem CHEGOU — a consulta repete a cada três segundos, e
  // tocar a cada consulta enquanto a lista não esvazia seria um alarme.
  const conhecidos = useRef(new Set<string>())
  useEffect(() => {
    const chegou = fila.some((p) => !conhecidos.current.has(p.participante_id))
    conhecidos.current = new Set(fila.map((p) => p.participante_id))
    if (chegou) tocarAviso()
  }, [fila])

  if (!ligada || fila.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Sala de espera"
      className="absolute right-2 top-2 z-30 w-72 rounded-2xl bg-neutral-900/95 p-3 text-neutral-100 shadow-xl shadow-black/40 ring-1 ring-white/10 backdrop-blur"
    >
      <p className="flex items-center gap-2 text-xs font-extrabold text-violet-300">
        <DoorOpen className="h-4 w-4" />
        {fila.length === 1 ? 'Esperando para entrar' : `${fila.length} esperando para entrar`}
      </p>

      <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
        {fila.map((p) => (
          <li key={p.participante_id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.nome}</span>
            <button
              onClick={() => atender.mutate({ participantes: [p.participante_id], status: 'recusado' })}
              className="rounded-lg px-2 py-1 text-xs font-bold text-neutral-400 transition hover:bg-white/10 hover:text-white"
            >
              Recusar
            </button>
            <button
              onClick={() => atender.mutate({ participantes: [p.participante_id], status: 'admitido' })}
              className="rounded-lg bg-violet-300 px-2.5 py-1 text-xs font-extrabold text-neutral-900 transition hover:bg-violet-200"
            >
              Admitir
            </button>
          </li>
        ))}
      </ul>

      {fila.length > 1 && (
        <button
          onClick={() =>
            atender.mutate({ participantes: fila.map((p) => p.participante_id), status: 'admitido' })
          }
          className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-xs font-extrabold transition hover:bg-white/15"
        >
          Admitir todos
        </button>
      )}

      {atender.isError && (
        <p className="mt-2 text-xs font-medium text-rose-300">Não consegui responder. Tente de novo.</p>
      )}
    </div>
  )
}

/**
 * Duas notas curtas e baixas, geradas na hora — sem arquivo de áudio para
 * baixar. O professor já interagiu com a página (clicou para entrar na sala),
 * então o navegador deixa tocar.
 */
function tocarAviso() {
  try {
    const ctx = new AudioContext()
    const agora = ctx.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const volume = ctx.createGain()
      osc.frequency.value = freq
      volume.gain.setValueAtTime(0.0001, agora + i * 0.15)
      volume.gain.exponentialRampToValueAtTime(0.12, agora + i * 0.15 + 0.02)
      volume.gain.exponentialRampToValueAtTime(0.0001, agora + i * 0.15 + 0.25)
      osc.connect(volume).connect(ctx.destination)
      osc.start(agora + i * 0.15)
      osc.stop(agora + i * 0.15 + 0.3)
    })
    window.setTimeout(() => void ctx.close(), 800)
  } catch {
    // Sem áudio (política do navegador, aba sem permissão): o cartão na tela
    // continua sendo o aviso.
  }
}
