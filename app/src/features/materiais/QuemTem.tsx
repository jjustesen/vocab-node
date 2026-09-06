import { corDoAvatar, inicial } from '@/lib/avatar'

/**
 * Quem de um grupo já tem determinado material.
 *
 * Iniciais, e não nomes: numa lista de arquivos o professor varre com o olho,
 * e cinco nomes por linha empurrariam o nome do arquivo para fora da tela. A
 * inicial acesa quer dizer "tem"; a apagada, "não tem" — e o `title` de cada
 * uma diz o nome inteiro para quem precisar conferir.
 *
 * Mora aqui, e não na sala, porque as duas telas que distribuem material para
 * um grupo fazem a mesma pergunta: a aba de turmas e o seletor do palco.
 */

/** Acima disto a fila de iniciais vira ruído e o resto vai para o "+N". */
const MAX_INICIAIS = 6

export function QuemTem({
  alunos,
  donos,
}: {
  alunos: { id: string; nome: string }[]
  donos: string[]
}) {
  const temSet = new Set(donos)
  const faltam = alunos.filter((a) => !temSet.has(a.id))
  const visiveis = alunos.slice(0, MAX_INICIAIS)
  const escondidos = alunos.length - visiveis.length

  return (
    <span className="mt-0.5 flex items-center gap-1">
      {visiveis.map((a) => (
        <span
          key={a.id}
          title={`${a.nome} ${temSet.has(a.id) ? 'já tem' : 'não tem'}`}
          className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-extrabold ${
            temSet.has(a.id) ? corDoAvatar(a.id) : 'bg-neutral-100 text-neutral-300'
          }`}
        >
          {inicial(a.nome)}
        </span>
      ))}
      {escondidos > 0 && <span className="text-[10px] text-neutral-400">+{escondidos}</span>}
      <span className="ml-1 text-[11px] text-neutral-400">
        {faltam.length === 0 ? 'todos têm' : `falta para ${faltam.length}`}
      </span>
    </span>
  )
}
