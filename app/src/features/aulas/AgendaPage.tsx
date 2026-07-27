import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { useAulasEntre, ROTULO_STATUS_AULA, type AulaComAluno } from "./api";
import type { AulaStatus } from "@/types/db";

const COR_STATUS: Record<
  AulaStatus,
  { badge: string; bloco: string; linha: string }
> = {
  agendada: {
    badge: "bg-indigo-50 text-indigo-700",
    bloco: "bg-indigo-50 text-indigo-900",
    linha: "bg-indigo-400",
  },
  realizada: {
    badge: "bg-emerald-100 text-emerald-800",
    bloco: "bg-emerald-50 text-emerald-900",
    linha: "bg-emerald-400",
  },
  cancelada: {
    badge: "bg-neutral-100 text-neutral-500",
    bloco: "bg-neutral-100 text-neutral-500",
    linha: "bg-neutral-300",
  },
  falta: {
    badge: "bg-rose-100 text-rose-700",
    bloco: "bg-rose-50 text-rose-900",
    linha: "bg-rose-400",
  },
};

/** Grade das 06:00 às 22:00 — cobre o horário comercial sem exigir rolagem
 * pela madrugada, onde aulas nunca acontecem. */
const HORA_INICIAL = 6;
const HORA_FINAL = 22;
const PX_POR_HORA = 64;
const PX_POR_MIN = PX_POR_HORA / 60;

function inicioDaSemana(data: Date): Date {
  const d = new Date(data);
  const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDias(data: Date, dias: number): Date {
  const d = new Date(data);
  d.setDate(d.getDate() + dias);
  return d;
}

function minutosDesde(data: Date, horaBase: number): number {
  return (data.getHours() - horaBase) * 60 + data.getMinutes();
}

type AulaPosicionada = AulaComAluno & {
  inicioMin: number;
  fimMin: number;
  coluna: number;
  totalColunas: number;
};

/**
 * Layout tipo Google Calendar: ordena por início e vai encaixando cada aula
 * na primeira coluna livre (a anterior já terminou). Aulas do mesmo horário
 * dividem a largura pelo total de colunas usadas no dia — não é o algoritmo
 * "por cluster" do Google, mas cobre bem o caso raro de dois alunos no
 * mesmo horário sem empilhar um em cima do outro.
 */
function posicionarAulas(aulasDoDia: AulaComAluno[]): AulaPosicionada[] {
  const comIntervalo = aulasDoDia
    .map((a) => {
      const inicio = new Date(a.data_hora);
      const inicioMin = minutosDesde(inicio, HORA_INICIAL);
      return { ...a, inicioMin, fimMin: inicioMin + a.duracao_min };
    })
    .sort((a, b) => a.inicioMin - b.inicioMin);

  const fimPorColuna: number[] = [];
  const posicionadas = comIntervalo.map((a) => {
    let coluna = fimPorColuna.findIndex((fim) => fim <= a.inicioMin);
    if (coluna === -1) {
      coluna = fimPorColuna.length;
      fimPorColuna.push(a.fimMin);
    } else {
      fimPorColuna[coluna] = a.fimMin;
    }
    return { ...a, coluna };
  });

  const totalColunas = Math.max(fimPorColuna.length, 1);
  return posicionadas.map((a) => ({ ...a, totalColunas }));
}

/** RF-43: agenda da semana em uma tela, com os horários do dia preenchidos como no Google Calendar. */
export function AgendaPage() {
  const [deslocamento, setDeslocamento] = useState(0);
  const [agora, setAgora] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const jaRolou = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const inicioSemana = useMemo(
    () => addDias(inicioDaSemana(new Date()), deslocamento * 7),
    [deslocamento]
  );
  const fimSemana = useMemo(() => addDias(inicioSemana, 7), [inicioSemana]);
  const { data: aulas, isLoading } = useAulasEntre(
    inicioSemana.toISOString(),
    fimSemana.toISOString()
  );

  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDias(inicioSemana, i)),
    [inicioSemana]
  );
  const indiceHoje = dias.findIndex(
    (d) => d.toDateString() === agora.toDateString()
  );

  // Rola até perto do horário atual (ou 08:00 se a semana não tem hoje) só na
  // primeira renderização de cada semana — senão o usuário reabre a rolagem
  // toda vez que a lista de aulas revalida.
  useEffect(() => {
    jaRolou.current = false;
  }, [inicioSemana]);

  useEffect(() => {
    if (jaRolou.current || !scrollRef.current) return;
    const minutoAlvo =
      indiceHoje >= 0
        ? minutosDesde(agora, HORA_INICIAL)
        : (8 - HORA_INICIAL) * 60;
    const alvoPx = Math.max(
      minutoAlvo * PX_POR_MIN - scrollRef.current.clientHeight * 0.35,
      0
    );
    scrollRef.current.scrollTop = alvoPx;
    jaRolou.current = true;
  }, [aulas, indiceHoje, agora]);

  const aulasPorDia = useMemo(() => {
    return dias.map((dia) => {
      const doDia = (aulas ?? []).filter(
        (a) => new Date(a.data_hora).toDateString() === dia.toDateString()
      );
      return posicionarAulas(doDia);
    });
  }, [dias, aulas]);

  const horas = useMemo(
    () =>
      Array.from(
        { length: HORA_FINAL - HORA_INICIAL + 1 },
        (_, i) => HORA_INICIAL + i
      ),
    []
  );

  const minutoAgora = minutosDesde(agora, HORA_INICIAL);
  const linhaAgoraVisivel =
    indiceHoje >= 0 &&
    minutoAgora >= 0 &&
    minutoAgora <= (HORA_FINAL - HORA_INICIAL) * 60;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Agenda</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeslocamento((d) => d - 1)}
            className="grid h-9 w-9 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDeslocamento(0)}
            className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-700"
          >
            {inicioSemana.toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
            })}{" "}
            –{" "}
            {addDias(inicioSemana, 6).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
            })}
          </button>
          <button
            onClick={() => setDeslocamento((d) => d + 1)}
            className="grid h-9 w-9 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl bg-white">
        {/* Cabeçalho dos dias — mesma grade de colunas do corpo (eixo de horas + 7 dias), para os dias ficarem alinhados com as colunas de baixo. */}
        <div
          className="grid border-b border-neutral-100 pr-[15px]"
          style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}
        >
          <div />
          {dias.map((dia, i) => {
            const éHoje = i === indiceHoje;
            return (
              <div
                key={dia.toISOString()}
                className="border-l border-neutral-100 px-1 py-3 text-center"
              >
                <p
                  className={`text-[11px] font-extrabold uppercase tracking-wide ${
                    éHoje ? "text-violet-700" : "text-neutral-400"
                  }`}
                >
                  {dia
                    .toLocaleDateString("pt-BR", { weekday: "short" })
                    .replace(".", "")}
                </p>
                <p
                  className={`mx-auto mt-1 grid h-8 w-8 place-items-center rounded-full text-base font-extrabold ${
                    éHoje ? "bg-violet-700 text-white" : "text-neutral-800"
                  }`}
                >
                  {dia.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
          </div>
        ) : (
          <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))",
                height: (HORA_FINAL - HORA_INICIAL) * PX_POR_HORA,
              }}
            >
              {/* Eixo de horas */}
              <div className="relative">
                {horas.map((h, i) => (
                  <span
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[11px] font-medium text-neutral-400"
                    style={{ top: i * PX_POR_HORA }}
                  >
                    {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                  </span>
                ))}
              </div>

              {/* Colunas dos dias, com linhas de hora/meia-hora preenchendo o fundo */}
              {dias.map((dia, i) => {
                const éHoje = i === indiceHoje;
                const fimDeSemana = i >= 5;
                return (
                  <div
                    key={dia.toISOString()}
                    className={`relative border-l border-neutral-100 ${
                      fimDeSemana ? "bg-neutral-50/60" : ""
                    } ${éHoje ? "bg-violet-50/50" : ""}`}
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(to bottom, #F0F0F0 0, #F0F0F0 1px, transparent 1px, transparent " +
                        PX_POR_HORA / 2 +
                        "px)",
                    }}
                  >
                    {aulasPorDia[i].length === 0 && (
                      <p className="absolute left-1/2 top-3 -translate-x-1/2 text-[11px] font-medium text-neutral-300">
                        Sem aulas
                      </p>
                    )}
                    {aulasPorDia[i].map((a) => {
                      const cor = COR_STATUS[a.status];
                      const compacta = a.fimMin - a.inicioMin <= 30;
                      const largura = 100 / a.totalColunas;
                      return (
                        <Link
                          key={a.id}
                          to={`/alunos/${a.aluno_id}`}
                          title={`${a.alunoNome} · ${
                            ROTULO_STATUS_AULA[a.status]
                          }`}
                          className={`absolute overflow-hidden rounded-lg px-2 py-1 text-left shadow-sm transition hover:brightness-95 ${cor.bloco}`}
                          style={{
                            top: a.inicioMin * PX_POR_MIN,
                            height: Math.max(
                              (a.fimMin - a.inicioMin) * PX_POR_MIN - 2,
                              18
                            ),
                            left: `calc(${a.coluna * largura}% + 2px)`,
                            width: `calc(${largura}% - 4px)`,
                          }}
                        >
                          <span
                            className={`absolute inset-y-0 left-0 w-[3px] ${cor.linha}`}
                          />
                          <p className="flex items-center gap-1 truncate text-[11px] font-extrabold leading-tight">
                            {a.serie_id && (
                              <Repeat className="h-2.5 w-2.5 shrink-0 opacity-60" />
                            )}
                            <span className="truncate">{a.alunoNome}</span>
                          </p>
                          {!compacta && (
                            <p className="truncate text-[10px] font-medium opacity-70">
                              {new Date(a.data_hora).toLocaleTimeString(
                                "pt-BR",
                                { hour: "2-digit", minute: "2-digit" }
                              )}{" "}
                              · {ROTULO_STATUS_AULA[a.status]}
                            </p>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}

              {/* Linha do horário atual, atravessando a semana toda com um marcador no dia de hoje */}
              {linhaAgoraVisivel && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10"
                  style={{ top: minutoAgora * PX_POR_MIN, left: 52 }}
                >
                  <div className="relative h-0 border-t-2 border-rose-500">
                    <span
                      className="absolute -top-[5px] h-[9px] w-[9px] rounded-full bg-rose-500 ring-2 ring-rose-100"
                      style={{
                        left: `calc(${(indiceHoje / 7) * 100}% - 4.5px)`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
