/**
 * Testa o avaliador PUBLICADO (função poc-tutor) com os casos difíceis da
 * especificação, em texto — sem voz. Serve para conferir o prompt de avaliação
 * depois de cada mudança nele.
 *
 *   node scripts/testar-avaliador.ts <codigo-de-acesso>
 *
 * Lê VITE_SUPABASE_URL de .env.local. Cada caso custa uma chamada ao Gemini.
 */
import { readFileSync } from 'node:fs'
import { iniciar, receber } from '../src/controlador.ts'
import { carregarRoteiro } from '../src/roteiro.ts'
import { contextoDoTurno } from '../src/turno.ts'
import type { Sessao } from '../src/tipos.ts'

const codigo = process.argv[2]
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const base = /VITE_SUPABASE_URL=(.+)/.exec(env)?.[1]?.trim()
if (!base) throw new Error('VITE_SUPABASE_URL não encontrada em .env.local')
const url = `${base}/functions/v1/poc-tutor`

const roteiro = carregarRoteiro()
function ate(itemId: string): Sessao {
  let s = iniciar(roteiro).sessao
  // Item de recuperação só aparece depois de um erro; monta o estado direto.
  const rec = Object.values(roteiro.recuperacao).find((i) => i.id === itemId)
  if (rec) {
    return { ...s, atual: { item: rec, origem: 'recuperacao', contexto: 'recuperacao', blocoId: null, tentativas: 0, nivelAjuda: 0, errosComModelo: 0, passouPorApoio: false } }
  }
  for (let i = 0; i < 100 && s.atual?.item.id !== itemId; i++) s = receber(s, { tipo: 'adequada', reconhecido: 'ok' }).sessao
  return s
}

const casos: { item: string; resposta: string; esperado: string }[] = [
  { item: 'clima.yesterday', resposta: 'It was rainy yesterday.', esperado: 'adequada' },
  { item: 'clima.yesterday', resposta: 'It was sunny yesterday.', esperado: 'erro' },
  { item: 'clima.base', resposta: 'Was sunny this morning.', esperado: 'erro' },
  { item: 'sujeito.they', resposta: 'They was at home.', esperado: 'erro' },
  { item: 'sujeito.not', resposta: 'They were not at home.', esperado: 'adequada' },
  { item: 'sujeito.they', resposta: 'Por que é were e não was?', esperado: 'duvida' },
  { item: 'sujeito.they', resposta: 'Não sei, me ajuda', esperado: 'pedido_ajuda' },
  { item: 'jantar.base', resposta: 'Were they dinnering together?', esperado: 'falta_prerequisito' },
  { item: 'tempo.base', resposta: 'How was the weather yesterday?', esperado: 'adequada' },
  { item: 'conversa.cidade', resposta: 'It was really hot, like 35 degrees.', esperado: 'adequada' },
  { item: 'rec.pergunta_inversao', resposta: 'She was... não lembro como é que é educada.', esperado: 'pedido_ajuda' },
  { item: 'clima.windy', resposta: "It's windy this morning.", esperado: 'erro' },
]

let acertos = 0
for (const c of casos) {
  const contexto = contextoDoTurno(ate(c.item))
  const inicio = Date.now()
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo, acao: 'avaliar', texto: c.resposta, contexto }),
  })
  const json = await resposta.json()
  const tipo = json.avaliacao?.tipo ?? `HTTP ${resposta.status}: ${json.erro}`
  const ok = tipo === c.esperado
  if (ok) acertos++
  const quem = json.decidiuPor === 'gemini' ? `gemini: ${json.motivoGemini}` : json.decidiuPor
  const extra = [quem, json.avaliacao?.habilidade, json.avaliacao?.ajuda, json.avaliacao?.problema, json.avaliacao?.acerto_parcial, json.avaliacao?.resposta_duvida, json.avaliacao?.reacao]
    .filter(Boolean)
    .join(' | ')
  console.log(`${ok ? '✔' : '✖'} ${c.item.padEnd(16)} "${c.resposta}" → ${tipo} (${((Date.now() - inicio) / 1000).toFixed(1)}s)${extra ? `\n    ${extra}` : ''}`)
}
console.log(`\n${acertos}/${casos.length} como esperado`)
