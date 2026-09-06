import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Documento } from './Documento'
import { Lousa } from './Lousa'
import { MaterialNoPalco } from './MaterialNoPalco'
import {
  proporcaoDo,
  superficieDo,
  type Palco as EstadoPalco,
  type ParticipanteId,
} from './estado-palco'

/**
 * O centro da sala: o conteúdo, com a camada de anotação por cima.
 *
 * A caixa recebe a PROPORÇÃO do conteúdo (`proporcaoDo`) e não o tamanho da
 * tela. É o detalhe que faz a anotação funcionar: as duas pontas desenham a
 * mesma caixa, com a mesma forma, em tamanhos diferentes — então o traço que
 * o professor fez sobre a terceira linha do exercício cai sobre a terceira
 * linha do exercício no celular do aluno.
 */
export function Palco({
  palco,
  eu,
  podeAnotar,
  ehProfessor,
  contextoDoDocumento,
  aoVirarPagina,
}: {
  palco: EstadoPalco
  eu: ParticipanteId
  podeAnotar: boolean
  /** Vira página quem comanda o palco — e quem comanda é o professor. */
  ehProfessor: boolean
  contextoDoDocumento: { alunoId: string; aulaId: string | null } | null
  aoVirarPagina: (pagina: number) => void
}) {
  if (palco.tipo === 'nenhum') return null

  /**
   * Sobre o documento NÃO se anota, e isso é limite do modelo, não preguiça:
   * o texto rola, e cada lado rola o seu. Um traço ancorado na caixa sairia do
   * lugar assim que alguém descesse a página. Quando o texto precisa virar
   * superfície anotável, o caminho é congelá-lo em material — que é
   * exatamente o botão "Guardar" lá dentro.
   */
  const camadaDisponivel = palco.tipo !== 'documento'

  const proporcao = proporcaoDo(palco)

  return (
    // `containerType: size` transforma esta área nas unidades `cqw`/`cqh` de
    // que a caixa precisa logo abaixo.
    <div className="grid min-h-0 flex-1 place-items-center" style={{ containerType: 'size' }}>
      {/*
        Encaixar a caixa na área disponível SEM deformar exige as duas medidas
        ao mesmo tempo, e `max-height` não serve: com a largura definida, o
        navegador calcula a altura pela proporção e o teto de altura só corta o
        excesso — a caixa fica com a forma errada, e a anotação sai do lugar
        junto com ela. Uma folha A4 em pé numa janela larga estourava a tela
        inteira por isso.

        `min(100cqw, 100cqh * proporção)` escolhe a dimensão que aperta
        primeiro e deriva o resto da proporção: encaixa por largura em conteúdo
        deitado, por altura em conteúdo em pé, e nunca deforma.
      */}
      <div
        className="relative"
        style={{ aspectRatio: proporcao, width: `min(100cqw, calc(100cqh * ${proporcao}))` }}
      >
        {palco.tipo === 'branco' && <div className="h-full w-full rounded-2xl bg-white" />}

        {palco.tipo === 'material' && <MaterialNoPalco palco={palco} />}

        {palco.tipo === 'documento' && (
          <div className="absolute inset-0">
            <Documento eu={eu} contexto={contextoDoDocumento} />
          </div>
        )}

        {/* A barra de anotação mora dentro do quadro e se recolhe sozinha —
            não há mais um botão "Anotar" na barra de baixo da sala. */}
        {camadaDisponivel && (
          <Lousa superficie={superficieDo(palco)} eu={eu} podeAnotar={podeAnotar} />
        )}

        {/*
          As páginas do PDF viram slides: o professor vira, e a virada é estado
          da sala — então todo mundo olha para a mesma página, sempre.

          O aluno vê as setas desabilitadas, e não some com elas. Esconder foi
          o primeiro desenho, e estava errado: um controle que desaparece não
          ensina nada — a pessoa procura o botão de virar página, não acha, e
          conclui que o app não faz isso. Desabilitado, com o motivo no title,
          explica de quem é o comando.
        */}
        {palco.tipo === 'material' && palco.paginas > 1 && (
          <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900/90 px-2 py-1 text-xs font-bold text-white shadow-lg backdrop-blur">
            <SetaDePagina
              Icone={ChevronLeft}
              rotulo="Página anterior"
              podeVirar={ehProfessor && palco.pagina > 1}
              ehProfessor={ehProfessor}
              aoClicar={() => aoVirarPagina(palco.pagina - 1)}
            />
            <span className="tabular-nums">
              {palco.pagina} / {palco.paginas}
            </span>
            <SetaDePagina
              Icone={ChevronRight}
              rotulo="Próxima página"
              podeVirar={ehProfessor && palco.pagina < palco.paginas}
              ehProfessor={ehProfessor}
              aoClicar={() => aoVirarPagina(palco.pagina + 1)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SetaDePagina({
  Icone,
  rotulo,
  podeVirar,
  ehProfessor,
  aoClicar,
}: {
  Icone: typeof ChevronLeft
  rotulo: string
  podeVirar: boolean
  ehProfessor: boolean
  aoClicar: () => void
}) {
  return (
    <button
      onClick={aoClicar}
      disabled={!podeVirar}
      title={ehProfessor ? rotulo : `${rotulo} — quem vira a página é o professor`}
      className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-neutral-700 disabled:opacity-30"
    >
      <Icone className="h-4 w-4" />
    </button>
  )
}
