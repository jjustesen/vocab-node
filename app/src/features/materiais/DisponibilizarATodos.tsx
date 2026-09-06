import { Loader2, UserPlus } from 'lucide-react'
import { useDisponibilizar } from './api'

/**
 * "Disponibilizar para todos" — um clique que entrega o material a quem do grupo ainda não
 * tem.
 *
 * ── Por que ele se expande no hover ─────────────────────────────────────────
 *
 * Numa lista de dez materiais, dez botões escritos por extenso competem com o
 * nome do arquivo, que é o que a pessoa está varrendo com o olho. Colapsado
 * ele é um ícone; a palavra aparece quando o mouse chega na LINHA (não no
 * próprio botão), porque um alvo de 32px que só se explica depois que você
 * acerta nele não ajuda ninguém.
 *
 * O `title` diz o número exato, e o botão também se expande com foco de
 * teclado — quem navega por Tab não tem hover.
 *
 * ── Onde ele NÃO aparece ────────────────────────────────────────────────────
 *
 * Quando não falta para ninguém: um botão que não faz nada é pior que um botão
 * ausente. E na tela do acervo, onde "todos" significaria TODOS os alunos do
 * professor — ali a entrega passa pelo seletor, que mostra quem vai receber
 * antes de mandar. Um clique só, sem confirmação, para uma base de trezentas
 * pessoas seria fácil demais de errar.
 */
export function DisponibilizarATodos({
  materialId,
  faltam,
}: {
  materialId: string
  /** Quem do grupo ainda não tem. Vazio esconde o botão. */
  faltam: string[]
}) {
  const disponibilizar = useDisponibilizar()

  if (faltam.length === 0) return null

  const pendente = disponibilizar.isPending && disponibilizar.variables?.materialId === materialId

  return (
    // ── Por que a expansão não empurra os vizinhos ──────────────────────────
    //
    // O slot tem a largura do botão FECHADO e o botão é absoluto dentro dele:
    // ao abrir, ele cresce por cima do nome do arquivo, à esquerda, em vez de
    // empurrar o que vem depois.
    //
    // Sem isso o botão de apagar, que fica ao lado, escorregava para a direita
    // no instante em que o mouse chegava na linha — e o clique mirado na
    // lixeira caía aqui. Controle que se move enquanto você mira nele é
    // armadilha, ainda mais quando o vizinho é destrutivo.
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-end">
      <button
        onClick={() => disponibilizar.mutate({ materialId, alunoIds: faltam })}
        disabled={pendente}
        title={`Disponibilizar para ${faltam.length} que ainda ${
          faltam.length === 1 ? 'não tem' : 'não têm'
        }`}
        className="group/botao absolute right-0 flex h-8 items-center rounded-full bg-neutral-100 px-2 text-xs font-bold text-neutral-600 shadow-sm transition-all hover:bg-violet-300 hover:text-neutral-900 focus-visible:bg-violet-300 focus-visible:text-neutral-900 disabled:opacity-50"
      >
        {pendente ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <UserPlus className="h-3.5 w-3.5 shrink-0" />
        )}
        {/*
          `max-w` em vez de `display`: largura zero anima, `hidden` não — e sem
          a transição o rótulo apareceria de uma vez. `whitespace-nowrap`
          impede que o texto quebre enquanto abre.
        */}
        <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/linha:ml-1.5 group-hover/linha:max-w-52 group-hover/linha:opacity-100 group-focus-visible/botao:ml-1.5 group-focus-visible/botao:max-w-52 group-focus-visible/botao:opacity-100">
          Disponibilizar para todos
        </span>
      </button>
    </span>
  )
}
