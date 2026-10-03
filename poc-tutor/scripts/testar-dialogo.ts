/**
 * Trocas curtas, ponta a ponta, com a função PUBLICADA: resposta do aluno →
 * avaliação real (Jev/Gemini) → controlador → fala do tutor. Serve para
 * conferir o "tom" das pistas sem abrir a página.
 *
 *   node scripts/testar-dialogo.ts <codigo-de-acesso>
 */
import { readFileSync } from 'node:fs'
import { iniciar, receber } from '../src/controlador.ts'
import { falaDaAcao, textoDaFala } from '../src/falas.ts'
import { carregarRoteiro } from '../src/roteiro.ts'
import { contextoDoTurno, paraAvaliacao, type RespostaDoAvaliador } from '../src/turno.ts'
import type { Sessao } from '../src/tipos.ts'

const codigo = process.argv[2]
const base = /VITE_SUPABASE_URL=(.+)/.exec(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))?.[1]?.trim()
const url = `${base}/functions/v1/poc-tutor`
const roteiro = carregarRoteiro()

/** Os casos que já apareceram no teste real — cada um é um "o tutor entregou a resposta". */
const cenarios: { item: string; falas: string[] }[] = [
  { item: 'sujeito.not', falas: ["They aren't at home.", "weren't", "They weren't at home."] },
  { item: 'rec.concordancia_were', falas: ['You was at the mall yesterday.', 'You were at the mall yesterday.', 'Were you at the mall yesterday?'] },
  { item: 'conversa.onde', falas: ['I was to sleep at my home.'] },
]

function ate(itemId: string): Sessao {
  let s = iniciar(roteiro).sessao
  const rec = Object.values(roteiro.recuperacao).find((i) => i.id === itemId)
  if (rec) {
    return { ...s, atual: { item: rec, origem: 'recuperacao', contexto: 'recuperacao', blocoId: null, tentativas: 0, nivelAjuda: 0, errosComModelo: 0, passouPorApoio: false } }
  }
  while (s.atual?.item.id !== itemId) s = receber(s, { tipo: 'adequada', reconhecido: 'ok' }).sessao
  return s
}

for (const c of cenarios) {
  let s = ate(c.item)
  console.log(`\n── ${c.item}`)
  for (const fala of c.falas) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, acao: 'avaliar', texto: fala, contexto: contextoDoTurno(s) }),
    })
    const json = (await r.json()) as RespostaDoAvaliador
    const turno = receber(s, paraAvaliacao(json, s))
    s = turno.sessao
    console.log(`ALUNO: ${fala}   [${json.avaliacao.tipo} · ${json.decidiuPor}${json.motivoGemini ? `: ${json.motivoGemini}` : ''}]`)
    for (const a of turno.acoes) console.log(`TUTOR: ${textoDaFala(falaDaAcao(a, s))}`)
    if (s.atual?.item.id !== c.item) break
  }
}
