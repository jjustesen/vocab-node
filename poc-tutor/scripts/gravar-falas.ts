/**
 * Grava, pela função PUBLICADA (ação `falar`, mesma voz e semente da aula), as
 * falas do tutor que já se sabe de antemão — as que saem só do roteiro e dos
 * templates, sem nada do que o aluno disse. Cada uma vira
 * web/audios/<chaveDaFala>.mp3, e a página toca o arquivo na hora em vez de
 * esperar o TTS. O que não está gravado (pista do Gemini, o que o aluno
 * disse, resposta de dúvida) a página pede em stream.
 *
 * Por enquanto só os primeiros N itens da aula (padrão 5), para testar a ideia.
 *
 *   node scripts/gravar-falas.ts <codigo-de-acesso> [itens=5] [--listar]
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { iniciar, receber } from '../src/controlador.ts'
import { chaveDaFala } from '../src/chaveDaFala.ts'
import { falaDaAcao, textoDaFala, type Fala } from '../src/falas.ts'
import { carregarRoteiro } from '../src/roteiro.ts'
import type { Acao, Avaliacao, Item, Sessao } from '../src/tipos.ts'

const codigo = process.argv[2]
const quantos = Number(process.argv[3] ?? 5)
const soListar = process.argv.includes('--listar')
if (!codigo && !soListar) throw new Error('Uso: node scripts/gravar-falas.ts <codigo-de-acesso> [itens] [--listar]')

const roteiro = carregarRoteiro()
const itens = roteiro.blocos.flatMap((b) => b.itens).slice(0, quantos)
const ids = new Set(itens.map((i) => i.id))

/**
 * As respostas "sem conteúdo do aluno" que o controlador pode receber: acerto,
 * erro em cada habilidade prevista (e numa imprevista, que cai na ajuda do
 * roteiro), pedido de ajuda, silêncio, áudio que não deu para ouvir e pular.
 * Nada de `dica`, `acertoParcial` nem `reconhecido` na fala: esses mudam a
 * cada aluno e vão para o stream.
 */
function respostasPara(item: Item): Avaliacao[] {
  const habilidades = new Set([...item.habilidades, ...(item.errosPrevistos ?? []).map((e) => e.habilidade), 'outra'])
  return [
    { tipo: 'adequada', reconhecido: item.alvo ?? '' },
    ...[...habilidades].map((habilidade): Avaliacao => ({ tipo: 'erro', reconhecido: '-', habilidade, problema: '-' })),
    { tipo: 'pedido_ajuda' },
    { tipo: 'silencio' },
    { tipo: 'audio_incerto' },
    { tipo: 'pular' },
  ]
}

const falas = new Map<string, Fala>()
function guardar(acoes: Acao[], s: Sessao) {
  for (const a of acoes) {
    if ('item' in a && !ids.has(a.item.id)) continue
    const fala = falaDaAcao(a, s)
    falas.set(chaveDaFala(fala), fala)
  }
}

// Caminho "feliz" até cada item; dali, todas as sequências de até 4 respostas
// enquanto o item não muda.
let base = iniciar(roteiro)
guardar(base.acoes, base.sessao)
for (const item of itens) {
  while (base.sessao.atual?.item.id !== item.id) {
    base = receber(base.sessao, { tipo: 'adequada', reconhecido: 'ok' })
  }
  const explorar = (s: Sessao, profundidade: number) => {
    if (profundidade === 0 || s.atual?.item.id !== item.id) return
    for (const av of respostasPara(item)) {
      const r = receber(s, av)
      guardar(r.acoes, r.sessao)
      explorar(r.sessao, profundidade - 1)
    }
  }
  explorar(base.sessao, 4)
}

const destino = new URL('../web/audios/', import.meta.url)
mkdirSync(destino, { recursive: true })
const jaGravadas = new Set(readdirSync(destino).map((f) => f.replace(/\.(wav|mp3)$/, '')))
const faltam = [...falas].filter(([chave]) => !jaGravadas.has(chave))

console.log(`${falas.size} falas fixas nos ${itens.length} primeiros itens; ${faltam.length} a gravar.`)
for (const [chave, fala] of falas) console.log(`${jaGravadas.has(chave) ? '  ok ' : '  -- '}${chave}  ${textoDaFala(fala)}`)
if (soListar) process.exit(0)

const base64 = /VITE_SUPABASE_URL=(.+)/.exec(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))?.[1]?.trim()
const url = `${base64}/functions/v1/poc-tutor`
let tokens = 0

async function gravar([chave, fala]: [string, Fala]) {
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, acao: 'falar', fala }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.audio) {
      writeFileSync(new URL(`${chave}.wav`, destino), Buffer.from(j.audio.base64, 'base64'))
      tokens += j.custos?.[0]?.saida ?? 0
      console.log(`gravada ${chave} (${(j.audio.base64.length * 0.75 / 48000).toFixed(1)} s)  ${textoDaFala(fala)}`)
      return
    }
    // 429: a cota por minuto do TTS acabou. Esperar e tentar de novo.
    if (String(j.erro ?? '').includes('429') && tentativa < 10) {
      console.log(`  limite do TTS, esperando 30 s… (${chave})`)
      await new Promise((ok) => setTimeout(ok, 30_000))
      continue
    }
    if (tentativa >= 3) throw new Error(`${chave}: ${j.erro ?? r.status}`)
  }
}

// Uma por vez: a cota por minuto do TTS é baixa, e com várias em paralelo
// todas esbarram nela juntas.
for (const f of faltam) await gravar(f)
console.log(`Pronto. ${tokens} tokens de áudio (~US$ ${(tokens * 6 / 1e6).toFixed(4)}).`)

// MP3 para a página baixar ~10x menos. Sem Python/lameenc (pip install
// lameenc), ficam os WAVs — a página toca os dois.
const mp3 = spawnSync('python', ['scripts/wav-para-mp3.py', fileURLToPath(destino)], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
})
if (mp3.status !== 0) console.log('Sem conversão para MP3: os áudios ficam em WAV.')
if (!existsSync(destino)) process.exit(1)
