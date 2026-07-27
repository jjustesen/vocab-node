import { Check, Lightbulb } from 'lucide-react'
import { CORES_TIPO, ROTULO_TIPO } from '@/types/questao'
import type { QuestaoTipo } from '@/types/db'

/**
 * Forma mínima para exibir uma questão sem editá-la. Tanto `QuestaoRow` (linha
 * do banco, com opcoes/pares podendo vir null) quanto `QuestaoRascunho` (do
 * editor, sempre array) satisfazem isto — o mesmo componente serve a ficha da
 * atividade e a revisão, que antes desenhavam a mesma coisa de dois jeitos.
 */
export type QuestaoParaLeitura = {
  tipo: QuestaoTipo
  enunciado: string
  opcoes?: string[] | null
  resposta_correta: string
  pares?: { esquerda: string; direita: string }[] | null
  explicacao?: string | null
}

/** Cabeçalho "Q3 · ligar colunas" — compartilhado pelas duas telas. */
export function EtiquetaTipo({ tipo }: { tipo: QuestaoTipo }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${CORES_TIPO[tipo]}`}>{ROTULO_TIPO[tipo]}</span>
  )
}

export function QuestaoLeitura({ valor }: { valor: QuestaoParaLeitura }) {
  return (
    <>
      <p className={`font-bold ${valor.enunciado ? 'text-neutral-900' : 'text-neutral-300'}`}>
        {valor.enunciado || 'Questão sem enunciado.'}
      </p>

      <div className="mt-3">
        {valor.tipo === 'multipla_escolha' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {(valor.opcoes ?? []).filter(Boolean).map((opcao, i) => (
              <Alternativa key={i} texto={opcao} correta={opcao === valor.resposta_correta} />
            ))}
          </div>
        )}

        {valor.tipo === 'verdadeiro_falso' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {(['true', 'false'] as const).map((o) => (
              <Alternativa
                key={o}
                texto={o === 'true' ? 'Verdadeiro' : 'Falso'}
                correta={valor.resposta_correta === o}
              />
            ))}
          </div>
        )}

        {valor.tipo === 'ligar_colunas' && (
          <div className="space-y-1.5">
            {(valor.pares ?? [])
              .filter((p) => p.esquerda || p.direita)
              .map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 rounded-xl bg-neutral-100 px-3 py-2 text-neutral-700">{p.esquerda}</span>
                  <span className="shrink-0 text-neutral-300">→</span>
                  <span className="flex-1 rounded-xl bg-emerald-100 px-3 py-2 font-medium text-emerald-800">
                    {p.direita}
                  </span>
                </div>
              ))}
          </div>
        )}

        {(valor.tipo === 'lacuna' ||
          valor.tipo === 'resposta_curta' ||
          valor.tipo === 'ordenar_palavras' ||
          valor.tipo === 'ordenar_audio' ||
          valor.tipo === 'pronuncia') && <Alternativa texto={valor.resposta_correta} correta />}
      </div>

      {valor.explicacao && (
        <div className="mt-3 flex gap-2 rounded-2xl bg-amber-100/70 px-4 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-sm text-amber-900">
            <span className="font-bold">Explicação (mostrada ao aluno): </span>
            {valor.explicacao}
          </p>
        </div>
      )}
    </>
  )
}

function Alternativa({ texto, correta }: { texto: string; correta: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm ${
        correta ? 'bg-emerald-100 font-medium text-emerald-900' : 'bg-neutral-100 text-neutral-600'
      }`}
    >
      <span className="min-w-0 flex-1 break-words">{texto || '—'}</span>
      {correta && <Check className="h-4 w-4 shrink-0 text-emerald-700" />}
    </div>
  )
}
