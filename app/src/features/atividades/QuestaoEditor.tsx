import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { EtiquetaTipo, QuestaoLeitura } from './QuestaoLeitura'
import { CORES_TIPO, MARCADOR_LACUNA, ROTULO_TIPO, TIPOS_QUESTAO, palavrasDaFrase } from '@/types/questao'
import type { QuestaoRascunho } from './questaoRascunho'
import { questaoVazia } from './questaoRascunho'

/**
 * Cada questão tem dois modos: leitura (a revisão do professor, que é o que
 * ele faz na maior parte do tempo — só conferir o que a IA propôs) e edição.
 * Antes tudo ficava sempre em modo formulário, o que transformava a revisão de
 * 10 questões numa parede de inputs.
 */
export function QuestaoEditor({
  numero,
  valor,
  onMudar,
  onRemover,
  editandoInicialmente = false,
}: {
  numero: number
  valor: QuestaoRascunho
  onMudar: (v: QuestaoRascunho) => void
  onRemover: () => void
  editandoInicialmente?: boolean
}) {
  const [editando, setEditando] = useState(editandoInicialmente)
  // Cópia de segurança para o "Cancelar" — o editor altera o estado do pai a
  // cada tecla, então sem isso não haveria como voltar atrás.
  const [snapshot, setSnapshot] = useState<QuestaoRascunho | null>(null)

  function abrirEdicao() {
    setSnapshot(valor)
    setEditando(true)
  }

  function cancelar() {
    if (snapshot) onMudar(snapshot)
    setSnapshot(null)
    setEditando(false)
  }

  function mudarTipo(tipo: QuestaoRascunho['tipo']) {
    // Troca de tipo reinicia os campos específicos — evita levar um `pares`
    // de ligar_colunas para uma múltipla escolha, por exemplo.
    const nova = questaoVazia(tipo)
    onMudar({ ...nova, enunciado: valor.enunciado, explicacao: valor.explicacao })
  }

  const cabecalho = (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-xs font-bold text-neutral-400">Q{numero}</span>
      {editando ? (
        <select
          value={valor.tipo}
          onChange={(e) => mudarTipo(e.target.value as QuestaoRascunho['tipo'])}
          className={`rounded-full border-0 px-2.5 py-1 text-xs font-bold outline-none ${CORES_TIPO[valor.tipo]}`}
        >
          {TIPOS_QUESTAO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO[t]}
            </option>
          ))}
        </select>
      ) : (
        <EtiquetaTipo tipo={valor.tipo} />
      )}

      {editando ? (
        <span className="ml-auto rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-bold text-white">
          editando
        </span>
      ) : (
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={abrirEdicao}
            title="Editar questão"
            className="rounded-full p-1.5 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemover}
            title="Remover questão"
            className="rounded-full p-1.5 text-neutral-300 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </span>
      )}
    </div>
  )

  if (!editando) {
    return (
      <div className="rounded-3xl bg-white p-5">
        {cabecalho}
        <QuestaoLeitura valor={valor} />
      </div>
    )
  }

  return (
    <div className="rounded-3xl bg-white p-5 ring-2 ring-neutral-900">
      {cabecalho}

      <label className="block">
        <span className="text-xs font-bold text-neutral-600">
          Enunciado
          {valor.tipo === 'lacuna' && (
            <span className="font-normal text-neutral-400"> — use {MARCADOR_LACUNA} onde falta a palavra</span>
          )}
        </span>
        <textarea
          value={valor.enunciado}
          onChange={(e) => onMudar({ ...valor, enunciado: e.target.value })}
          rows={2}
          placeholder={
            valor.tipo === 'ordenar_palavras'
              ? 'Instrução para o aluno, ex.: "Coloque as palavras na ordem correta."'
              : 'They ______ to the beach yesterday.'
          }
          className="mt-1 w-full resize-none rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
        />
      </label>

      <div className="mt-3">
        {valor.tipo === 'multipla_escolha' && <CamposMultiplaEscolha valor={valor} onMudar={onMudar} />}
        {valor.tipo === 'verdadeiro_falso' && <CamposVerdadeiroFalso valor={valor} onMudar={onMudar} />}
        {valor.tipo === 'ligar_colunas' && <CamposLigarColunas valor={valor} onMudar={onMudar} />}
        {valor.tipo === 'ordenar_palavras' && <CamposOrdenarPalavras valor={valor} onMudar={onMudar} />}
        {valor.tipo === 'ordenar_audio' && <CamposOrdenarAudio valor={valor} onMudar={onMudar} />}
        {valor.tipo === 'pronuncia' && <CamposPronuncia valor={valor} onMudar={onMudar} />}
        {(valor.tipo === 'lacuna' || valor.tipo === 'resposta_curta') && (
          <CamposRespostaTexto valor={valor} onMudar={onMudar} />
        )}
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-bold text-neutral-600">
          Explicação <span className="font-normal text-neutral-400">(em português — o aluno lê depois de responder)</span>
        </span>
        <textarea
          value={valor.explicacao}
          onChange={(e) => onMudar({ ...valor, explicacao: e.target.value })}
          rows={2}
          placeholder='Ex.: "went" é o passado simples de "go" — usamos para ações concluídas no passado.'
          className="mt-1 w-full resize-none rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
        />
      </label>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSnapshot(null)
            setEditando(false)
          }}
          className="rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-extrabold text-white"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={cancelar}
          className="rounded-full px-4 py-2.5 text-sm font-bold text-neutral-500 hover:text-neutral-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}


type CamposProps = { valor: QuestaoRascunho; onMudar: (v: QuestaoRascunho) => void }

function CamposMultiplaEscolha({ valor, onMudar }: CamposProps) {
  function mudarOpcao(i: number, texto: string) {
    const opcoes = [...valor.opcoes]
    const anterior = opcoes[i]
    opcoes[i] = texto
    // Se a alternativa editada era a correta, atualiza a referência junto —
    // senão a resposta_correta fica apontando para um texto que não existe mais.
    const respostaCorreta = valor.resposta_correta === anterior ? texto : valor.resposta_correta
    onMudar({ ...valor, opcoes, resposta_correta: respostaCorreta })
  }

  return (
    <div>
      <span className="text-xs font-bold text-neutral-600">Alternativas — marque a correta</span>
      <div className="mt-1.5 space-y-1.5">
        {valor.opcoes.map((opcao, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onMudar({ ...valor, resposta_correta: opcao })}
              disabled={!opcao.trim()}
              title="Marcar como correta"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold disabled:opacity-30 ${
                opcao.trim() && opcao === valor.resposta_correta
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-neutral-300 text-transparent'
              }`}
            >
              ✓
            </button>
            <input
              value={opcao}
              onChange={(e) => mudarOpcao(i, e.target.value)}
              placeholder={`Alternativa ${i + 1}`}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            {valor.opcoes.length > 2 && (
              <button
                type="button"
                onClick={() => onMudar({ ...valor, opcoes: valor.opcoes.filter((_, j) => j !== i) })}
                className="shrink-0 text-neutral-300 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {valor.opcoes.length < 6 && (
        <button
          type="button"
          onClick={() => onMudar({ ...valor, opcoes: [...valor.opcoes, ''] })}
          className="mt-2 flex items-center gap-1 text-xs font-bold text-violet-700"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar alternativa
        </button>
      )}
    </div>
  )
}

function CamposVerdadeiroFalso({ valor, onMudar }: CamposProps) {
  return (
    <div className="flex gap-2">
      {(['true', 'false'] as const).map((opcao) => (
        <button
          key={opcao}
          type="button"
          onClick={() => onMudar({ ...valor, resposta_correta: opcao })}
          className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-bold ${
            valor.resposta_correta === opcao
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
              : 'border-neutral-200 text-neutral-500'
          }`}
        >
          {opcao === 'true' ? 'Verdadeiro' : 'Falso'}
        </button>
      ))}
    </div>
  )
}

function CamposLigarColunas({ valor, onMudar }: CamposProps) {
  function mudarPar(i: number, lado: 'esquerda' | 'direita', texto: string) {
    const pares = valor.pares.map((p, j) => (j === i ? { ...p, [lado]: texto } : p))
    onMudar({ ...valor, pares })
  }

  return (
    <div>
      <span className="text-xs font-bold text-neutral-600">Pares — mínimo 3</span>
      <div className="mt-1.5 space-y-1.5">
        {valor.pares.map((par, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={par.esquerda}
              onChange={(e) => mudarPar(i, 'esquerda', e.target.value)}
              placeholder="luggage"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <span className="shrink-0 text-neutral-300">→</span>
            <input
              value={par.direita}
              onChange={(e) => mudarPar(i, 'direita', e.target.value)}
              placeholder="bagagem"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            {valor.pares.length > 3 && (
              <button
                type="button"
                onClick={() => onMudar({ ...valor, pares: valor.pares.filter((_, j) => j !== i) })}
                className="shrink-0 text-neutral-300 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {valor.pares.length < 6 && (
        <button
          type="button"
          onClick={() => onMudar({ ...valor, pares: [...valor.pares, { esquerda: '', direita: '' }] })}
          className="mt-2 flex items-center gap-1 text-xs font-bold text-violet-700"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar par
        </button>
      )}
    </div>
  )
}

function CamposOrdenarPalavras({ valor, onMudar }: CamposProps) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-neutral-600">Frase correta (as palavras serão embaralhadas)</span>
      <input
        value={valor.resposta_correta}
        onChange={(e) => onMudar({ ...valor, resposta_correta: e.target.value })}
        placeholder="They went to the beach yesterday."
        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
      />
    </label>
  )
}

/**
 * As distratoras ficam num campo SEPARADO da frase, e não numa lista única de
 * fichas: assim o professor edita a frase sem reescrever as fichas, e nunca
 * consegue publicar uma questão a que falte ficha para alguma palavra — as da
 * frase são derivadas em `paraQuestaoContrato`.
 */
function CamposOrdenarAudio({ valor, onMudar }: CamposProps) {
  const palavras = palavrasDaFrase(valor.resposta_correta)
  const distratoras = valor.opcoes.map((o) => o.trim()).filter(Boolean)

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs font-bold text-neutral-600">
          Frase falada <span className="font-normal text-neutral-400">— o aparelho do aluno lê em voz alta</span>
        </span>
        <input
          value={valor.resposta_correta}
          onChange={(e) => onMudar({ ...valor, resposta_correta: e.target.value })}
          placeholder="They went to the beach yesterday."
          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-neutral-600">
          Palavras distratoras <span className="font-normal text-neutral-400">(separadas por vírgula)</span>
        </span>
        <input
          value={valor.opcoes.join(', ')}
          onChange={(e) => onMudar({ ...valor, opcoes: e.target.value.split(',').map((s) => s.trim()) })}
          placeholder="their, walk, was"
          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <p className={`text-xs ${distratoras.length === 0 ? 'font-bold text-rose-600' : 'text-neutral-400'}`}>
        {distratoras.length === 0
          ? 'Adicione ao menos uma distratora — sem elas o aluno acerta só usando todas as fichas.'
          : `${palavras.length} fichas da frase + ${distratoras.length} distratora${distratoras.length > 1 ? 's' : ''}, embaralhadas na tela do aluno.`}
      </p>
    </div>
  )
}

function CamposPronuncia({ valor, onMudar }: CamposProps) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-neutral-600">
        Frase a ler em voz alta <span className="font-normal text-neutral-400">— a IA dá a nota de 0 a 100</span>
      </span>
      <input
        value={valor.resposta_correta}
        onChange={(e) => onMudar({ ...valor, resposta_correta: e.target.value })}
        placeholder="I think this weather is terrible."
        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
      />
      <span className="mt-1 block text-xs text-neutral-400">
        Frases curtas com um desafio claro (th, r inicial, -ed final). Na explicação, diga qual som vigiar.
      </span>
    </label>
  )
}

function CamposRespostaTexto({ valor, onMudar }: CamposProps) {
  const rotuloAceitas = valor.tipo === 'lacuna' ? 'Outras formas aceitas' : 'Outras formulações aceitas'
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs font-bold text-neutral-600">Resposta correta</span>
        <input
          value={valor.resposta_correta}
          onChange={(e) => onMudar({ ...valor, resposta_correta: e.target.value })}
          placeholder={valor.tipo === 'lacuna' ? 'went' : 'It rained a lot.'}
          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-neutral-600">
          {rotuloAceitas} <span className="font-normal text-neutral-400">(separadas por vírgula, opcional)</span>
        </span>
        <input
          value={valor.respostas_aceitas.join(', ')}
          onChange={(e) =>
            onMudar({
              ...valor,
              respostas_aceitas: e.target.value.split(',').map((s) => s.trim()),
            })
          }
          placeholder="didn't go, did not go"
          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
    </div>
  )
}
