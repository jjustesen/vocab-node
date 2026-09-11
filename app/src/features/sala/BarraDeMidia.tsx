import {
  DisconnectButton,
  LeaveIcon,
  MediaDeviceMenu,
  StartMediaButton,
  TrackToggle,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { MenuDaCamera } from './MenuDaCamera'

/**
 * Microfone, câmera, tela e sair — a barra de mídia da sala.
 *
 * É o `ControlBar` do LiveKit (variação `minimal`) montado peça a peça, na
 * mesma ordem e com as mesmas classes, por UM motivo: a câmera precisa do
 * menu próprio (`MenuDaCamera`, com a seção de fundo), e o prefab só sabe
 * montar o menu dele. Deixar o prefab sem câmera e pôr a nossa ao lado foi a
 * primeira tentativa, e ficou errado de dois jeitos — ela caía DEPOIS do
 * "sair", e fora do `.lk-control-bar` os botões saíam com outro tamanho.
 *
 * Tudo aqui é componente exportado pelo pacote; a única coisa nossa é o menu
 * da câmera. Se o prefab mudar de ordem ou ganhar um botão, isto acompanha à
 * mão — o preço de ter a câmera do nosso jeito.
 */
export function BarraDeMidia() {
  return (
    <div className="lk-control-bar">
      <div className="lk-button-group">
        <TrackToggle source={Track.Source.Microphone} showIcon />
        <div className="lk-button-group-menu">
          <MediaDeviceMenu kind="audioinput" />
        </div>
      </div>

      <MenuDaCamera />

      <TrackToggle
        source={Track.Source.ScreenShare}
        // As mesmas opções do prefab: áudio da aba junto, e a própria janela
        // do navegador na lista de escolhas.
        captureOptions={{ audio: true, selfBrowserSurface: 'include' }}
        showIcon
      />

      <DisconnectButton>
        <LeaveIcon />
      </DisconnectButton>

      {/* O aviso de "clique para liberar o áudio", quando o navegador exige gesto. */}
      <StartMediaButton />
    </div>
  )
}
