import { MARCADOR_LACUNA, palavrasDaFrase } from '@/types/questao'
import { embaralhar } from '@/lib/embaralhar'
import type { QuestaoTipo, Par, QuestaoRow } from '@/types/db'

/**
 * Forma "de trabalho" de uma questão enquanto o professor edita — mais solta
 * que o contrato final (docs/CONTRATO-QUESTOES.md): permite campos vazios a
 * meio caminho do preenchimento. A validação de verdade roda no momento de
 * salvar, via `questaoSchema` (Zod), em types/questao.ts.
 */
export type QuestaoRascunho = {
  tipo: QuestaoTipo
  enunciado: string
  opcoes: string[]
  resposta_correta: string
  respostas_aceitas: string[]
  pares: Par[]
  explicacao: string
}

export function questaoVazia(tipo: QuestaoTipo): QuestaoRascunho {
  switch (tipo) {
    case 'multipla_escolha':
      return {
        tipo,
        enunciado: '',
        opcoes: ['', '', '', ''],
        resposta_correta: '',
        respostas_aceitas: [],
        pares: [],
        explicacao: '',
      }
    case 'verdadeiro_falso':
      return {
        tipo,
        enunciado: '',
        opcoes: ['true', 'false'],
        resposta_correta: 'true',
        respostas_aceitas: [],
        pares: [],
        explicacao: '',
      }
    case 'ligar_colunas':
      return {
        tipo,
        enunciado: '',
        opcoes: [],
        resposta_correta: '',
        respostas_aceitas: [],
        pares: [
          { esquerda: '', direita: '' },
          { esquerda: '', direita: '' },
          { esquerda: '', direita: '' },
        ],
        explicacao: '',
      }
    case 'lacuna':
      return {
        tipo,
        enunciado: `They ${MARCADOR_LACUNA} to the beach yesterday.`,
        opcoes: [],
        resposta_correta: '',
        respostas_aceitas: [],
        pares: [],
        explicacao: '',
      }
    // Em `ordenar_audio` o professor digita a frase em `resposta_correta` e as
    // palavras DISTRATORAS em `opcoes` — só as extras. As fichas da frase são
    // derivadas na conversão, pelo mesmo motivo de `ordenar_palavras`: guardar
    // as duas coisas deixa o rascunho divergir da frase quando ela é editada.
    case 'ordenar_audio':
      return {
        tipo,
        enunciado: 'Ouça e monte a frase na ordem em que foi falada.',
        opcoes: ['', ''],
        resposta_correta: '',
        respostas_aceitas: [],
        pares: [],
        explicacao: '',
      }
    case 'pronuncia':
      return {
        tipo,
        enunciado: 'Leia a frase em voz alta.',
        opcoes: [],
        resposta_correta: '',
        respostas_aceitas: [],
        pares: [],
        explicacao: '',
      }
    case 'ordenar_palavras':
    case 'resposta_curta':
      return {
        tipo,
        enunciado: '',
        opcoes: [],
        resposta_correta: '',
        respostas_aceitas: [],
        pares: [],
        explicacao: '',
      }
  }
}

/** Remove de `todas` uma ocorrência de cada palavra de `aRemover`. */
function subtrairPalavras(todas: string[], aRemover: string[]): string[] {
  const restante = [...todas]
  for (const palavra of aRemover) {
    const i = restante.findIndex((p) => p.trim().toLowerCase() === palavra.trim().toLowerCase())
    if (i !== -1) restante.splice(i, 1)
  }
  return restante
}

/**
 * Converte o rascunho para o formato do contrato antes de validar/salvar.
 * `ordenar_palavras`: o professor digita a frase correta; as palavras
 * embaralhadas (opcoes) são derivadas aqui, não guardadas separadamente —
 * evita o rascunho e o contrato divergirem se o professor editar a frase.
 */
export function paraQuestaoContrato(r: QuestaoRascunho) {
  if (r.tipo === 'ordenar_palavras') {
    const palavras = palavrasDaFrase(r.resposta_correta)
    return {
      tipo: r.tipo,
      enunciado: r.enunciado.trim() || 'Coloque as palavras na ordem correta.',
      opcoes: embaralhar(palavras),
      resposta_correta: r.resposta_correta.trim(),
      respostas_aceitas: [],
      pares: [],
      explicacao: r.explicacao.trim(),
    }
  }

  // As distratoras entram misturadas às fichas da frase: se fossem concatenadas
  // no fim, a ordem de `opcoes` já entregaria quais palavras sobram.
  if (r.tipo === 'ordenar_audio') {
    const palavras = palavrasDaFrase(r.resposta_correta)
    const distratoras = r.opcoes.map((o) => o.trim()).filter(Boolean)
    return {
      tipo: r.tipo,
      enunciado: r.enunciado.trim() || 'Ouça e monte a frase na ordem em que foi falada.',
      opcoes: embaralhar([...palavras, ...distratoras]),
      resposta_correta: r.resposta_correta.trim(),
      respostas_aceitas: [],
      pares: [],
      explicacao: r.explicacao.trim(),
    }
  }

  if (r.tipo === 'pronuncia') {
    return {
      tipo: r.tipo,
      enunciado: r.enunciado.trim() || 'Leia a frase em voz alta.',
      opcoes: [],
      resposta_correta: r.resposta_correta.trim(),
      respostas_aceitas: [],
      pares: [],
      explicacao: r.explicacao.trim(),
    }
  }

  return {
    tipo: r.tipo,
    enunciado: r.enunciado.trim(),
    opcoes: r.opcoes.map((o) => o.trim()).filter(Boolean),
    resposta_correta: r.resposta_correta.trim(),
    respostas_aceitas: r.respostas_aceitas.map((s) => s.trim()).filter(Boolean),
    pares: r.pares
      .map((p) => ({ esquerda: p.esquerda.trim(), direita: p.direita.trim() }))
      .filter((p) => p.esquerda && p.direita),
    explicacao: r.explicacao.trim(),
  }
}

/** Caminho inverso de `paraQuestaoContrato` — usado ao abrir uma atividade para editar. */
export function questaoRowParaRascunho(q: QuestaoRow): QuestaoRascunho {
  return {
    tipo: q.tipo,
    enunciado: q.enunciado,
    // Em `ordenar_audio` o rascunho guarda só as distratoras, então voltamos
    // tirando de `opcoes` as fichas que a própria frase explica.
    opcoes:
      q.tipo === 'ordenar_audio'
        ? subtrairPalavras(q.opcoes ?? [], palavrasDaFrase(q.resposta_correta))
        : (q.opcoes ?? []),
    resposta_correta: q.resposta_correta,
    respostas_aceitas: q.respostas_aceitas,
    pares: q.pares ?? [],
    explicacao: q.explicacao,
  }
}
