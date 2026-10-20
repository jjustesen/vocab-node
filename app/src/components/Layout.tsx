import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Calendar,
  GraduationCap,
  Library,
  LogOut,
  Menu,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Settings,
  Sun,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAcessoTutor } from "@/features/tutor/api";

// Trilhas não é item de menu: vive como aba dentro de Atividades (mockup P11),
// porque uma trilha é uma sequência de atividades que já existem.
const ITENS: { para: string; rotulo: string; Icone: LucideIcon }[] = [
  { para: "/hoje", rotulo: "Hoje", Icone: Sun },
  { para: "/alunos", rotulo: "Alunos", Icone: Users },
  { para: "/turmas", rotulo: "Turmas", Icone: UsersRound },
  { para: "/atividades", rotulo: "Atividades", Icone: Pencil },
  { para: "/materiais", rotulo: "Materiais", Icone: Library },
  { para: "/agenda", rotulo: "Agenda", Icone: Calendar },
  { para: "/financeiro", rotulo: "Financeiro", Icone: Wallet },
];

/** Só para quem foi liberado no beta do tutor (tutor_acesso) — entra depois de Atividades. */
const TUTOR = { para: "/tutor", rotulo: "Tutor", Icone: Mic };

/** A partir daqui a barra começa aberta (ícone e nome); abaixo, recolhida em ícones. */
const TELA_LARGA = "(min-width: 1280px)";
const CHAVE_PREFERENCIA = "menu-lateral";

type Estado = "aberta" | "recolhida";

/**
 * A escolha de quem tocou em "Recolher"/"Expandir" vale para as próximas
 * visitas; sem escolha, quem decide é a largura da tela.
 */
function usePreferenciaDaBarra() {
  const [preferencia, setPreferencia] = useState<Estado | null>(() => {
    try {
      const v = localStorage.getItem(CHAVE_PREFERENCIA);
      return v === "aberta" || v === "recolhida" ? v : null;
    } catch {
      return null;
    }
  });
  const [larga, setLarga] = useState(() => window.matchMedia(TELA_LARGA).matches);
  useEffect(() => {
    const mq = window.matchMedia(TELA_LARGA);
    const mudou = () => setLarga(mq.matches);
    mq.addEventListener("change", mudou);
    return () => mq.removeEventListener("change", mudou);
  }, []);

  const estado: Estado = preferencia ?? (larga ? "aberta" : "recolhida");
  const alternar = () => {
    const novo: Estado = estado === "aberta" ? "recolhida" : "aberta";
    setPreferencia(novo);
    try {
      localStorage.setItem(CHAVE_PREFERENCIA, novo);
    } catch {
      /* sem armazenamento: vale até recarregar */
    }
  };
  return { estado, alternar };
}

/**
 * A moldura das páginas do professor. Oito destinos não cabiam mais numa barra
 * no topo travada em 1024px, então a navegação mora numa coluna à esquerda,
 * no mesmo cromo escuro que emoldura o painel creme:
 *
 *   tela larga (≥ 1280px)  aberta: ícone e nome
 *   tela média (≥ 768px)   recolhida: só ícones, com o nome numa dica no
 *                          hover e no foco do teclado
 *   celular                um botão abre a mesma barra como gaveta
 */
export function Layout() {
  const { session, sair } = useAuth();
  const nome =
    (session?.user.user_metadata.nome as string | undefined) ?? "Professor";
  const { data: acessoTutor } = useAcessoTutor();
  const itens = acessoTutor
    ? ITENS.flatMap((item) => (item.para === "/atividades" ? [item, TUTOR] : [item]))
    : ITENS;
  const { estado, alternar } = usePreferenciaDaBarra();
  const [gaveta, setGaveta] = useState(false);
  const fecharGaveta = useCallback(() => setGaveta(false), []);
  const { pathname } = useLocation();

  // Escolheu um destino na gaveta: ela fecha sozinha.
  useEffect(() => setGaveta(false), [pathname]);

  return (
    // O cromo escuro sangra até as bordas da janela; a moldura fica por dentro,
    // envolvendo o painel creme. Sem margem externa — a janela já é a moldura.
    <div className="flex min-h-dvh flex-col bg-neutral-950 md:flex-row">
      <aside
        className={`sticky top-0 z-30 hidden h-dvh shrink-0 flex-col px-3 py-4 text-white transition-[width] duration-200 md:flex ${
          // Aberta não tem dica para mostrar fora da coluna: cortar o que passa
          // evita o nome vazando por cima da página enquanto a largura anima.
          estado === "aberta" ? "w-56 overflow-hidden" : "w-[4.5rem]"
        }`}
      >
        <ConteudoDaBarra
          itens={itens}
          nome={nome}
          aberta={estado === "aberta"}
          aoSair={sair}
          rodape={
            <BotaoDaBarra
              rotulo={estado === "aberta" ? "Recolher menu" : "Expandir menu"}
              Icone={estado === "aberta" ? PanelLeftClose : PanelLeftOpen}
              aberta={estado === "aberta"}
              aoClicar={alternar}
            />
          }
        />
      </aside>

      {/* Celular: a barra vira um topo com o botão da gaveta. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-neutral-950 px-4 text-white md:hidden">
        <button
          type="button"
          onClick={() => setGaveta(true)}
          aria-label="Abrir menu"
          aria-expanded={gaveta}
          className="-ml-2 rounded-full p-2 text-neutral-300 transition hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Marca aberta />
      </header>

      {gaveta && <Gaveta itens={itens} nome={nome} aoSair={sair} aoFechar={fecharGaveta} />}

      <main className="flex min-w-0 flex-1 flex-col px-2 pb-2 sm:px-3 sm:pb-3 md:py-3 md:pl-0">
        {/* O painel creme sangra até a moldura (que segue fininha); quem trava
            em 1024px é a camada de dentro, para o conteúdo não esticar demais
            em telas largas. */}
        <div className="flex-1 rounded-3xl bg-areia p-5 sm:rounded-[2rem] sm:p-8">
          <div className="mx-auto w-full max-w-[1024px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

function Marca({ aberta }: { aberta: boolean }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 px-1">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-violet-300 text-neutral-900">
        <GraduationCap className="h-5 w-5" />
      </span>
      {aberta && <span className="truncate whitespace-nowrap font-extrabold">Vocab Node</span>}
    </div>
  );
}

/** O que a barra mostra, aberta ou recolhida — a mesma na lateral e na gaveta. */
function ConteudoDaBarra({
  itens,
  nome,
  aberta,
  aoSair,
  rodape,
}: {
  itens: { para: string; rotulo: string; Icone: LucideIcon }[];
  nome: string;
  aberta: boolean;
  aoSair: () => void;
  rodape?: React.ReactNode;
}) {
  return (
    <>
      <Marca aberta={aberta} />

      <nav aria-label="Navegação" className="mt-6 flex flex-col gap-1">
        {itens.map(({ para, rotulo, Icone }) => (
          <NavLink
            key={para}
            to={para}
            aria-label={aberta ? undefined : rotulo}
            className={({ isActive }) =>
              [
                "group relative flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition",
                isActive ? "bg-white/15 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white",
              ].join(" ")
            }
          >
            <Icone className="h-[18px] w-[18px] shrink-0" />
            {aberta ? <span className="truncate whitespace-nowrap">{rotulo}</span> : <Dica texto={rotulo} />}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3">
        {/* O avatar leva para Plano e cobrança — como no mockup, o plano
            mora junto do perfil, não na navegação principal. */}
        <NavLink
          to="/plano"
          aria-label={aberta ? undefined : `${nome} · Plano e cobrança`}
          className={({ isActive }) =>
            [
              "group relative flex h-10 items-center gap-3 rounded-2xl px-2 text-sm font-semibold transition",
              isActive ? "bg-white/15 text-white" : "text-neutral-300 hover:bg-white/5 hover:text-white",
            ].join(" ")
          }
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-pink-300 text-xs font-extrabold text-neutral-900">
            {nome.charAt(0).toUpperCase()}
          </span>
          {aberta ? (
            <span className="min-w-0">
              <span className="block truncate whitespace-nowrap leading-tight">{nome}</span>
              <span className="block whitespace-nowrap text-[11px] font-medium text-neutral-500">Plano e cobrança</span>
            </span>
          ) : (
            <Dica texto={`${nome} · Plano e cobrança`} />
          )}
        </NavLink>
        <NavLink
          to="/configuracoes"
          aria-label={aberta ? undefined : "Configurações"}
          className={({ isActive }) =>
            [
              "group relative flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition",
              isActive ? "bg-white/15 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white",
            ].join(" ")
          }
        >
          <Settings className="h-[18px] w-[18px] shrink-0" />
          {aberta ? <span className="whitespace-nowrap">Configurações</span> : <Dica texto="Configurações" />}
        </NavLink>
        <BotaoDaBarra rotulo="Sair" Icone={LogOut} aberta={aberta} aoClicar={aoSair} />
        {rodape}
      </div>
    </>
  );
}

function BotaoDaBarra({
  rotulo,
  Icone,
  aberta,
  aoClicar,
}: {
  rotulo: string;
  Icone: LucideIcon;
  aberta: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={aberta ? undefined : rotulo}
      className="group relative flex h-10 items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold text-neutral-400 transition hover:bg-white/5 hover:text-white"
    >
      <Icone className="h-[18px] w-[18px] shrink-0" />
      {aberta ? <span className="whitespace-nowrap">{rotulo}</span> : <Dica texto={rotulo} />}
    </button>
  );
}

/**
 * O nome do destino com a barra recolhida: aparece ao lado no hover e no foco
 * do teclado. Para leitor de tela o nome já está no `aria-label` do link.
 */
function Dica({ texto }: { texto: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-neutral-900 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {texto}
    </span>
  );
}

/** Celular: a mesma barra, aberta, deslizando por cima da página. */
function Gaveta({
  itens,
  nome,
  aoSair,
  aoFechar,
}: {
  itens: { para: string; rotulo: string; Icone: LucideIcon }[];
  nome: string;
  aoSair: () => void;
  aoFechar: () => void;
}) {
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    painel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Fechar menu" onClick={aoFechar} className="absolute inset-0 bg-black/50" />
      <div ref={painel} className="relative flex h-full w-64 flex-col bg-neutral-950 px-3 py-4 text-white shadow-2xl">
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar menu"
          className="absolute right-3 top-4 rounded-full p-2 text-neutral-400 transition hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <ConteudoDaBarra itens={itens} nome={nome} aberta aoSair={aoSair} />
      </div>
    </div>
  );
}
