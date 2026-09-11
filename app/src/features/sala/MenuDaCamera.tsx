import { useEffect, useRef, useState } from 'react'
import { TrackToggle, useMediaDeviceSelect } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Check, Loader2 } from 'lucide-react'
import { FORCAS, IMAGENS, mesmoFundo, useFundoDaCamera, type Fundo } from './fundo-da-camera'

/**
 * O botão da câmera com o menu dele: os dispositivos em cima, o fundo embaixo.
 *
 * Substitui o par `TrackToggle` + `MediaDeviceMenu` que o `ControlBar` do
 * LiveKit monta para a câmera, e só por um motivo: o menu do LiveKit não
 * aceita itens de fora. O fundo da câmera é uma configuração DA CÂMERA — trocar
 * de dispositivo e trocar de fundo são vizinhos na cabeça de quem está numa
 * chamada — e um botão solto na barra para uma coisa e um menu para a outra
 * espalha pela tela o que a pessoa procura num lugar só.
 *
 * As classes `lk-*` são as do próprio pacote de estilos do LiveKit, de
 * propósito: o menu tem que parecer irmão do menu do microfone ao lado, não um
 * componente de outro app. Se o pacote renomear as classes, isto acompanha.
 */
export function MenuDaCamera() {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: 'videoinput',
    // Não pede permissão só para listar: quem já ligou a câmera já deu, e quem
    // não ligou não deve ver um pedido de permissão ao abrir um menu.
    requestPermissions: false,
  })

  const { suportado, fundo, aplicando, erro, temCamera, escolher } = useFundoDaCamera()

  // Fecha ao clicar fora ou com Escape — o menu do LiveKit faz o mesmo, e um
  // menu que só fecha pelo próprio botão é um menu que fica esquecido aberto.
  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(evento: PointerEvent) {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false)
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false)
    }
    document.addEventListener('pointerdown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('pointerdown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  /**
   * As opções de fundo, em ordem de "quanto some o quarto": nada, borrado em
   * três forças, parede lisa em três cores. A imagem vem depois do desfoque
   * porque é o passo seguinte de quem achou o borrão insuficiente — ver o
   * cabeçalho de `fundo-da-camera.ts`.
   */
  const opcoesDeFundo: { rotulo: string; fundo: Fundo }[] = [
    { rotulo: 'Sem efeito', fundo: { tipo: 'nenhum' } },
    ...(Object.keys(FORCAS) as (keyof typeof FORCAS)[]).map((forca) => ({
      rotulo: `Desfoque ${forca === 'media' ? 'médio' : forca}`,
      fundo: { tipo: 'desfoque', forca } as Fundo,
    })),
    ...IMAGENS.map((imagem) => ({
      rotulo: `Fundo ${imagem.nome.toLowerCase()}`,
      fundo: { tipo: 'imagem', id: imagem.id } as Fundo,
    })),
  ]

  return (
    <div ref={raiz} className="lk-button-group">
      <TrackToggle source={Track.Source.Camera} showIcon />

      <div className="lk-button-group-menu">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-pressed={aberto}
          aria-haspopup="menu"
          title="Câmera e fundo"
          className="lk-button lk-button-menu"
        />

        {aberto && (
          // `top: auto` + `bottom`: a classe do LiveKit ancora o menu no topo
          // do botão e o reposiciona por JS; aqui ele abre para CIMA, que é o
          // único lado com espaço numa barra que fica no rodapé.
          <div
            className="lk-device-menu"
            role="menu"
            style={{ top: 'auto', bottom: 'calc(100% + 0.5rem)' }}
          >
            <div className="lk-device-menu-heading">Câmera</div>
            <ul className="lk-media-device-select lk-list">
              {devices.length === 0 && (
                <li>
                  <span className="block px-2 py-1.5 text-xs text-neutral-400">
                    Ligue a câmera para ver os dispositivos
                  </span>
                </li>
              )}
              {devices.map((dispositivo) => (
                <li key={dispositivo.deviceId} data-lk-active={dispositivo.deviceId === activeDeviceId}>
                  <button
                    type="button"
                    className="lk-button"
                    onClick={() => {
                      void setActiveMediaDevice(dispositivo.deviceId)
                      setAberto(false)
                    }}
                  >
                    {dispositivo.label || 'Câmera'}
                  </button>
                </li>
              ))}
            </ul>

            {/*
              Só onde funciona. Num navegador sem suporte o menu fica igual ao
              do LiveKit — a seção inteira some, em vez de aparecer com opções
              que não fazem nada.
            */}
            {suportado && (
              <>
                <div className="lk-device-menu-heading">Fundo</div>
                <ul className="lk-media-device-select lk-list">
                  {opcoesDeFundo.map((opcao) => {
                    const ativa = mesmoFundo(opcao.fundo, fundo)
                    return (
                      <li key={opcao.rotulo} data-lk-active={ativa}>
                        <button
                          type="button"
                          className="lk-button"
                          disabled={!temCamera || aplicando}
                          title={!temCamera ? 'Ligue a câmera primeiro' : undefined}
                          onClick={() => escolher(opcao.fundo)}
                        >
                          {opcao.rotulo}
                          {ativa && aplicando && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
                          {ativa && !aplicando && <Check className="ml-auto h-3.5 w-3.5" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {erro && <p className="max-w-56 px-2 py-1 text-xs text-rose-300">{erro}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
