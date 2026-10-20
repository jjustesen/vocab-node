/**
 * Publica uma lição na biblioteca do tutor (tabela `tutor_licoes`, migration
 * 0024), de onde o professor a libera para cada aluno.
 *
 *   node scripts/publicar-licao.ts roteiro/licao-rotina.json --nivel A1 --ordem 2 [--codigo <senha-da-poc>] [--rascunho]
 *
 * 1. Valida o roteiro (validarRoteiro) — roteiro com problema não sobe.
 * 2. Com `--codigo`, grava as falas fixas da lição que ainda não estão no
 *    bucket `tutor-falas`, pela função poc-tutor (mesma voz e semente da aula),
 *    e as sobe em MP3. Sem `--codigo`, sobe só as que já existem em
 *    web/audios/ (a lição do clima) — o resto o aluno ouve em stream.
 * 3. Grava a linha: roteiro, título, nível, ordem e a lista de falas no bucket.
 *    `--rascunho` sobe sem publicar (o professor ainda não vê).
 *
 * Precisa, em poc-tutor/.env.local (nunca no repositório):
 *   VITE_SUPABASE_URL=https://<projeto>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<a chave service_role do projeto>
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { textoDaFala, type Fala } from '../src/falas.ts'
import { carregarRoteiro } from '../src/roteiro.ts'
import { falasFixas } from './falas-fixas.ts'

const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1']
const BUCKET = 'tutor-falas'

const args = process.argv.slice(2)
const opcao = (nome: string) => {
  const i = args.indexOf(`--${nome}`)
  return i === -1 ? undefined : args[i + 1]
}
const arquivo = args.find((a) => a.endsWith('.json'))
const nivel = opcao('nivel')
const ordem = Number(opcao('ordem') ?? 0)
const codigo = opcao('codigo')
const publicada = !args.includes('--rascunho')
if (!arquivo || (nivel && !NIVEIS.includes(nivel))) {
  throw new Error('Uso: node scripts/publicar-licao.ts <roteiro.json> [--nivel A1] [--ordem N] [--codigo <senha>] [--rascunho]')
}

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const variavel = (nome: string) => new RegExp(`^${nome}=(.+)$`, 'm').exec(env)?.[1]?.trim()
const url = variavel('VITE_SUPABASE_URL')
const chave = variavel('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !chave) throw new Error('Faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em poc-tutor/.env.local.')
const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` }

// ── 1. Roteiro ───────────────────────────────────────────────────────────────

const roteiro = carregarRoteiro(pathToFileURL(arquivo))
const falas = falasFixas(roteiro)
console.log(`${roteiro.id} — ${roteiro.titulo}: ${falas.size} falas fixas.`)

// ── 2. Falas ─────────────────────────────────────────────────────────────────

const noBucket = await listarBucket()
const doBundle = new URL('../web/audios/', import.meta.url)
const temp = new URL(`../.falas-${roteiro.id}/`, import.meta.url)
mkdirSync(temp, { recursive: true })

const faltam = [...falas].filter(([k]) => !noBucket.has(k))
for (const [k, fala] of faltam) {
  const doLab = new URL(`${k}.mp3`, doBundle)
  if (existsSync(doLab)) {
    await subir(k, readFileSync(doLab))
    continue
  }
  if (!codigo) continue
  await gravarWav(k, fala)
}

if (codigo && readdirSync(temp).some((f) => f.endsWith('.wav'))) {
  // A mesma conversão do gravar-falas.ts: a página baixa ~10x menos.
  const mp3 = spawnSync('python', ['scripts/wav-para-mp3.py', fileURLToPath(temp)], {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit',
  })
  if (mp3.status !== 0) throw new Error('A conversão para MP3 falhou (pip install lameenc).')
  for (const f of readdirSync(temp).filter((f) => f.endsWith('.mp3'))) {
    await subir(f.replace(/\.mp3$/, ''), readFileSync(new URL(f, temp)))
  }
}
rmSync(temp, { recursive: true, force: true })

const gravadas = [...falas.keys()].filter((k) => noBucket.has(k))
console.log(`${gravadas.length} de ${falas.size} falas no bucket; o resto toca em stream.`)

// ── 3. Linha da biblioteca ───────────────────────────────────────────────────

const r = await fetch(`${url}/rest/v1/tutor_licoes?on_conflict=id`, {
  method: 'POST',
  headers: { ...cabecalhos, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    id: roteiro.id,
    titulo: roteiro.titulo,
    descricao: roteiro.abertura,
    nivel_cefr: nivel ?? null,
    roteiro,
    falas_gravadas: gravadas,
    ordem,
    publicada,
    atualizado_em: new Date().toISOString(),
  }),
})
if (!r.ok) throw new Error(`tutor_licoes respondeu ${r.status}: ${await r.text()}`)
console.log(publicada ? 'Publicada: o professor já pode liberar para os alunos.' : 'Salva como rascunho (publicada = false).')

// ── Apoio ────────────────────────────────────────────────────────────────────

async function listarBucket(): Promise<Set<string>> {
  const nomes = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const resposta = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...cabecalhos, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1000, offset }),
    })
    if (!resposta.ok) throw new Error(`O bucket ${BUCKET} respondeu ${resposta.status} (a migration 0024 rodou?)`)
    const lista = (await resposta.json()) as { name: string }[]
    for (const o of lista) nomes.add(o.name.replace(/\.mp3$/, ''))
    if (lista.length < 1000) return nomes
  }
}

async function subir(k: string, mp3: Buffer) {
  const resposta = await fetch(`${url}/storage/v1/object/${BUCKET}/${k}.mp3`, {
    method: 'POST',
    headers: { ...cabecalhos, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
    body: new Uint8Array(mp3),
  })
  if (!resposta.ok) throw new Error(`Subir ${k}.mp3 falhou: ${resposta.status} ${await resposta.text()}`)
  noBucket.add(k)
  console.log(`  subiu ${k}.mp3`)
}

async function gravarWav(k: string, fala: Fala) {
  for (let tentativa = 1; ; tentativa++) {
    const resposta = await fetch(`${url}/functions/v1/poc-tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, acao: 'falar', fala }),
    })
    const j = await resposta.json().catch(() => ({}))
    if (resposta.ok && j.audio) {
      writeFileSync(new URL(`${k}.wav`, temp), Buffer.from(j.audio.base64, 'base64'))
      console.log(`  gravada ${k}  ${textoDaFala(fala)}`)
      return
    }
    // 429: a cota por minuto do TTS acabou. Esperar e tentar de novo.
    if (String(j.erro ?? '').includes('429') && tentativa < 10) {
      console.log(`  limite do TTS, esperando 30 s… (${k})`)
      await new Promise((ok) => setTimeout(ok, 30_000))
      continue
    }
    if (tentativa >= 3) throw new Error(`${k}: ${j.erro ?? resposta.status}`)
  }
}
