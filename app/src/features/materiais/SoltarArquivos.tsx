import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { TAMANHO_MAX_MATERIAL, tipoDoArquivo } from './api'

/**
 * A zona de arrastar arquivos, uma só para as três telas que sobem material
 * (acervo, ficha do aluno e sala).
 *
 * Estava duplicada no seletor da sala; com uma terceira tela precisando dela,
 * virou peça própria — e as validações de formato e tamanho passaram a viver
 * num lugar só, que é onde elas param de divergir.
 */
export function SoltarArquivos({
  aoReceber,
  rotulo,
  compacto = false,
}: {
  /** Sobe UM arquivo. Quem chama decide se vai para o acervo, para um aluno ou para a turma. */
  aoReceber: (arquivo: File) => Promise<unknown>
  rotulo: string
  compacto?: boolean
}) {
  const [sobre, setSobre] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [restantes, setRestantes] = useState(0)

  async function receber(lista: FileList | null) {
    const arquivos = Array.from(lista ?? [])
    if (arquivos.length === 0) return
    setErro(null)

    // Um de cada vez, e não `Promise.all`: quando isto roda dentro de uma
    // videochamada, disparar cinco uploads juntos rouba banda de quem está
    // falando. Um por vez também deixa o contador honesto.
    for (const [indice, arquivo] of arquivos.entries()) {
      setRestantes(arquivos.length - indice)
      // As duas checagens ANTES de começar: a mensagem tem que vir antes de
      // subir 25 MB, não depois.
      if (!tipoDoArquivo(arquivo.type)) {
        setErro(`"${arquivo.name}": formato não aceito. Envie PDF, DOCX, imagem ou áudio.`)
        break
      }
      if (arquivo.size > TAMANHO_MAX_MATERIAL) {
        setErro(`"${arquivo.name}" passa de 25 MB.`)
        break
      }
      try {
        await aoReceber(arquivo)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não consegui enviar este arquivo.')
        break
      }
    }
    setRestantes(0)
  }

  const enviando = restantes > 0

  return (
    <div>
      <label
        onDragOver={(e) => {
          // Sem o `preventDefault` no dragover o navegador ABRE o arquivo na
          // aba — o que, no meio de uma aula, derruba a sala inteira.
          e.preventDefault()
          setSobre(true)
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSobre(false)
          receber(e.dataTransfer.files)
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed text-center transition ${
          compacto ? 'px-4 py-4' : 'px-4 py-6'
        } ${sobre ? 'border-violet-400 bg-violet-50' : 'border-neutral-200 hover:border-neutral-400'}`}
      >
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            receber(e.target.files)
            // Zera para o mesmo arquivo poder ser reenviado depois de um erro.
            e.target.value = ''
          }}
        />
        {enviando ? (
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        ) : (
          <Upload className="h-4 w-4 text-neutral-400" />
        )}
        <span className="text-xs font-bold text-neutral-700">
          {enviando ? `Enviando… (faltam ${restantes})` : rotulo}
        </span>
        <span className="text-[11px] text-neutral-500">
          ou clique para escolher · PDF, DOCX, imagem ou áudio · até 25 MB
        </span>
      </label>

      {erro && <p className="mt-2 text-xs font-medium text-rose-600">{erro}</p>}
    </div>
  )
}
