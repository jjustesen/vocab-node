import { Check, FileText, Image as ImageIcon, X } from 'lucide-react'
import { Chip } from '@/components/Chip'
import { NIVEIS, HABILIDADES, ROTULO_HABILIDADE } from '@/types/questao'
import { alternarOverride, resolverConfig, type ConfigGeracao, type ItemLote, type OverrideConfig } from './lote'
import type { NivelCefr } from '@/types/db'

const QUANTIDADES = [5, 10, 15, 20]

/**
 * Painel de exceção de um arquivo. O ponto todo desta tela é deixar a herança
 * VISÍVEL: cada campo diz se está herdando do padrão ou personalizado, e traz
 * o atalho de voltar. Sem isso o professor vê um valor na tela sem saber de
 * onde veio nem como desfazer — foi o risco principal apontado no mockup.
 */
export function PersonalizarItemLoteModal({
  item,
  posicao,
  total,
  padrao,
  aoMudarOverride,
  aoFechar,
  aoProximo,
}: {
  item: ItemLote
  posicao: number
  total: number
  padrao: ConfigGeracao
  aoMudarOverride: (override: OverrideConfig) => void
  aoFechar: () => void
  aoProximo?: () => void
}) {
  const efetiva = resolverConfig(padrao, item.override)
  const Icone = item.tipo === 'pdf' ? FileText : ImageIcon

  function mudar<C extends keyof ConfigGeracao>(campo: C, valor: ConfigGeracao[C] | undefined) {
    aoMudarOverride(alternarOverride(item.override, campo, valor))
  }

  /** Clicar no valor que já está escolhido volta a herdar — evita campo preso. */
  function escolher<C extends keyof ConfigGeracao>(campo: C, valor: ConfigGeracao[C]) {
    const jaPersonalizado = item.override[campo] !== undefined
    mudar(campo, jaPersonalizado && item.override[campo] === valor ? undefined : valor)
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-neutral-900/30 p-3 sm:p-5" onClick={aoFechar}>
      <div
        className="flex w-full max-w-md flex-col overflow-y-auto rounded-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-600">
            <Icone className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold text-neutral-900">{item.nome}</span>
            <span className="text-xs font-medium text-neutral-500">
              Arquivo {posicao} de {total}
            </span>
          </span>
          <button
            type="button"
            onClick={aoFechar}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <CampoOverride
          rotulo="Nível"
          personalizado={item.override.nivel !== undefined}
          padraoTexto={padrao.nivel}
          aoVoltar={() => mudar('nivel', undefined)}
        >
          {NIVEIS.map((n) => (
            <Chip key={n} ativo={efetiva.nivel === n} aoClicar={() => escolher('nivel', n as NivelCefr)}>
              {n}
            </Chip>
          ))}
        </CampoOverride>

        <CampoOverride
          rotulo="Questões"
          personalizado={item.override.quantidade !== undefined}
          padraoTexto={String(padrao.quantidade)}
          aoVoltar={() => mudar('quantidade', undefined)}
        >
          {QUANTIDADES.map((q) => (
            <Chip key={q} ativo={efetiva.quantidade === q} aoClicar={() => escolher('quantidade', q)}>
              {q}
            </Chip>
          ))}
        </CampoOverride>

        <CampoOverride
          rotulo="Habilidades"
          personalizado={item.override.habilidades !== undefined}
          padraoTexto={padrao.habilidades.length > 0 ? String(padrao.habilidades.length) : 'nenhuma'}
          aoVoltar={() => mudar('habilidades', undefined)}
        >
          {HABILIDADES.map((h) => (
            <Chip
              key={h}
              ativo={efetiva.habilidades.includes(h)}
              variante="lilas"
              aoClicar={() =>
                mudar(
                  'habilidades',
                  efetiva.habilidades.includes(h)
                    ? efetiva.habilidades.filter((x) => x !== h)
                    : [...efetiva.habilidades, h],
                )
              }
            >
              {efetiva.habilidades.includes(h) && <Check className="h-3 w-3" />}
              {ROTULO_HABILIDADE[h]}
            </Chip>
          ))}
        </CampoOverride>

        <label className="mt-4 block">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-600">
              Foco <span className="font-medium text-neutral-400">(opcional)</span>
            </span>
            {item.override.foco !== undefined ? (
              <button
                type="button"
                onClick={() => mudar('foco', undefined)}
                className="text-[11px] font-bold text-violet-600 hover:underline"
              >
                voltar ao padrão
              </button>
            ) : (
              <span className="text-[11px] font-bold text-neutral-400">herdando do padrão</span>
            )}
          </div>
          <input
            value={efetiva.foco}
            onChange={(e) => mudar('foco', e.target.value)}
            placeholder={padrao.foco ? `herdando: ${padrao.foco}` : 'ex.: past simple, phrasal verbs...'}
            className="mt-1.5 w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm outline-none ring-neutral-900 placeholder:text-neutral-400 focus:ring-2"
          />
        </label>

        <div className="mt-5 flex items-center gap-2">
          {aoProximo && (
            <button
              type="button"
              onClick={aoProximo}
              className="flex-1 rounded-full bg-neutral-900 py-3 text-sm font-extrabold text-white"
            >
              Ir ao próximo arquivo
            </button>
          )}
          <button
            type="button"
            onClick={aoFechar}
            className={`rounded-full bg-neutral-100 px-5 py-3 text-sm font-bold text-neutral-600 ${aoProximo ? '' : 'flex-1'}`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function CampoOverride({
  rotulo,
  personalizado,
  padraoTexto,
  aoVoltar,
  children,
}: {
  rotulo: string
  personalizado: boolean
  padraoTexto: string
  aoVoltar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-neutral-600">{rotulo}</span>
        {personalizado ? (
          <button type="button" onClick={aoVoltar} className="truncate text-[11px] font-bold text-violet-600 hover:underline">
            voltar ao padrão ({padraoTexto})
          </button>
        ) : (
          <span className="text-[11px] font-bold text-neutral-400">herdando do padrão</span>
        )}
      </div>
      <div className={`mt-1.5 flex flex-wrap gap-1.5 ${personalizado ? '' : 'opacity-70'}`}>{children}</div>
    </div>
  )
}
