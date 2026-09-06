import { useCallback, useRef } from 'react'
import { useConnectionState, useDataChannel } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'

/**
 * Se a sala já está de pé para enviar.
 *
 * `LiveKitRoom` renderiza os filhos ENQUANTO conecta, então tudo que fala pelo
 * canal nasce antes de haver conexão — e `publishData` numa sala que ainda
 * está subindo falha com "PC manager is closed". Na prática isso quebrava o
 * handshake: quem entrava perguntava "o que está no palco?" no vazio, a
 * pergunta se perdia, e a tela ficava mostrando "só vídeo" enquanto o outro
 * olhava para o exercício. Todo `pedir-estado` espera este sinal.
 */
export function useSalaConectada(): boolean {
  return useConnectionState() === ConnectionState.Connected
}

/**
 * Uma conversa em JSON pelo data channel do LiveKit.
 *
 * As três peças da sala — palco, anotação e documento — falam pela MESMA
 * conexão do vídeo, cada uma no seu tópico. Nenhum servidor, tabela ou canal
 * novo: se a chamada está de pé, a sala inteira está. É a regra que a lousa já
 * seguia, extraída aqui porque agora são três a segui-la.
 *
 * Vale para o que é AO VIVO. O que precisa sobreviver à chamada não passa por
 * aqui — vai ao banco pelo cliente do professor (ver `documento-api.ts`).
 *
 * ── Por que a callback passa por uma ref ────────────────────────────────────
 *
 * `useDataChannel` memoriza a inscrição em `[room, topic, onMessage]`. Uma
 * arrow function escrita direto na chamada é IDENTIDADE NOVA a cada render, e
 * quem usa este hook rerenderiza a cada tecla e a cada traço — o que
 * desmontaria e remontaria o observable o tempo todo, deixando janelas em que
 * a sala não está ouvindo ninguém. Passar uma callback estável que lê a versão
 * atual da ref inscreve UMA vez e continua enxergando o estado de agora.
 */
export function useCanal<T>(topico: string, aoReceber: (mensagem: T) => void) {
  const receberRef = useRef(aoReceber)
  receberRef.current = aoReceber

  const aoChegar = useCallback((recebida: { payload: Uint8Array }) => {
    let mensagem: T
    try {
      mensagem = JSON.parse(new TextDecoder().decode(recebida.payload)) as T
    } catch {
      return // mensagem de uma versão futura do app: ignorar é melhor que quebrar
    }
    receberRef.current(mensagem)
  }, [])

  const { send } = useDataChannel(topico, aoChegar)

  // `send` muda de identidade a cada render do provider do LiveKit. Sem esta
  // ref, o `enviar` devolvido mudaria junto e todo `useEffect([enviar])` de
  // quem chama viraria um efeito que dispara a cada render — o handshake de
  // "pedir-estado" viraria uma enxurrada.
  const enviarRef = useRef(send)
  enviarRef.current = send

  return useCallback(
    (mensagem: T) => {
      // Falha de envio não pode derrubar o estado local: se a conexão caiu, a
      // pessoa continua escrevendo do lado dela e só o outro fica para trás.
      // Engolir é a diferença entre um traço perdido e uma unhandled rejection
      // no meio da aula — mas engolir CALADO esconde erro de configuração
      // (token sem `canPublishData`, por exemplo), então em dev o erro aparece.
      enviarRef
        .current(new TextEncoder().encode(JSON.stringify(mensagem)), { reliable: true, topic: topico })
        .catch((erro: unknown) => {
          if (import.meta.env.DEV) console.warn(`[sala] não consegui enviar em "${topico}"`, erro)
        })
    },
    [topico],
  )
}
