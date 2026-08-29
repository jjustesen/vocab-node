/**
 * Assinatura do token de acesso do LiveKit.
 *
 * Escrito à mão em vez de `npm:livekit-server-sdk` de propósito: o token é um
 * JWT HS256 com um claim `video` — WebCrypto do Deno faz isso em vinte linhas,
 * e trazer o SDK inteiro (que existe sobretudo para as APIs de servidor, que
 * não usamos) só adicionaria superfície de dependência ao cold start.
 *
 * Referência do formato: https://docs.livekit.io/home/get-started/authentication/
 */

function base64Url(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDeTexto(texto: string): string {
  return base64Url(new TextEncoder().encode(texto))
}

export type ConfigLiveKit = { url: string; apiKey: string; apiSecret: string }

/**
 * Lê e valida a configuração. Falta de secret é erro de operação, não de uso:
 * quem chamou não tem o que corrigir, então vale explodir cedo e com nome.
 */
export function configLiveKit(): ConfigLiveKit {
  const url = Deno.env.get('LIVEKIT_URL')
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  if (!url || !apiKey || !apiSecret) {
    throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET não estão configurados.')
  }
  return { url, apiKey, apiSecret }
}

export type ConcessaoSala = {
  sala: string
  /** Único por participante DENTRO da sala — o LiveKit derruba o participante anterior de mesma identidade. */
  identidade: string
  nomeExibido: string
  /** Validade do token, não da chamada: quem já entrou continua na sala depois disso. */
  validadeSegundos?: number
}

export async function tokenDoLiveKit(
  { apiKey, apiSecret }: ConfigLiveKit,
  { sala, identidade, nomeExibido, validadeSegundos = 60 * 60 * 4 }: ConcessaoSala,
): Promise<string> {
  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = { alg: 'HS256', typ: 'JWT' }
  const conteudo = {
    iss: apiKey,
    sub: identidade,
    name: nomeExibido,
    nbf: agora,
    exp: agora + validadeSegundos,
    video: {
      room: sala,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  }

  const corpo = `${base64UrlDeTexto(JSON.stringify(cabecalho))}.${base64UrlDeTexto(JSON.stringify(conteudo))}`
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo))
  return `${corpo}.${base64Url(new Uint8Array(assinatura))}`
}

/**
 * Nome da sala a partir do id da linha em `salas`. Prefixo para o nome nunca
 * colidir com outra coisa que venha a existir no mesmo projeto do LiveKit.
 */
export function nomeDaSala(salaId: string): string {
  return `sala-${salaId}`
}
