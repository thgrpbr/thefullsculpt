import {
  CalendarClock, ChartNoAxesColumn, CreditCard, Database, Dumbbell, KeyRound, Landmark, Mail, Scale, Settings, ShieldCheck, SlidersHorizontal, Tags, UserRoundCheck, UsersRound,
  type LucideIcon,
} from "lucide-react";

/** `perm`: permissões que liberam o item (qualquer uma); "master" = só o administrador master. */
export type Perm = readonly string[] | "master";

export interface NavLeaf {
  path: string;
  label: string;
  icon: LucideIcon;
  perm: Perm;
  /** frase curta (busca rápida e subnavegação) */
  desc?: string;
  /** termos extras para a busca rápida */
  keywords?: string;
  exact?: boolean;
  /** outros caminhos que pertencem a este item */
  alias?: readonly string[];
}
export interface NavParent extends NavLeaf {
  children: readonly NavLeaf[];
}
export interface NavGroup {
  label: string;
  items: readonly (NavLeaf | NavParent)[];
}

/** Subseções de Configurações: tudo que é ajuste da plataforma fica aqui. */
export const SETTINGS: readonly NavLeaf[] = [
  { path: "/admin/configuracoes", label: "Geral", icon: SlidersHorizontal, perm: ["settings.manage"], exact: true, desc: "Comissões dos professores e consultas online", keywords: "comissao comissoes carencia consulta horario agenda" },
  { path: "/admin/configuracoes/emails", label: "E-mails", icon: Mail, perm: ["emails.manage", "system.manage"], desc: "Servidor de envio, entregabilidade, modelos e layouts", keywords: "smtp dns spf dkim dmarc modelo layout template remetente" },
  { path: "/admin/gateways", label: "Pagamentos", icon: Landmark, perm: ["gateways.manage"], desc: "Gateways, credenciais e webhooks", keywords: "stripe mercado pago pagarme asaas checkout cartao pix boleto" },
  { path: "/admin/usuarios", label: "Equipe e permissões", icon: KeyRound, perm: "master", desc: "Usuários do painel e o que cada um pode fazer", keywords: "usuario advogado financeiro suporte permissao acesso senha" },
  { path: "/admin/configuracoes/sistema", label: "Banco de dados e sistema", icon: Database, perm: ["system.manage"], desc: "Banco, dados de demonstração e informações técnicas", keywords: "mysql banco demo servidor versao" },
];

const SETTINGS_PERMS = ["settings.manage", "emails.manage", "system.manage", "gateways.manage"] as const;

export const GROUPS: readonly NavGroup[] = [
  { label: "Painel", items: [{ path: "/admin", label: "Visão geral", icon: ChartNoAxesColumn, perm: ["overview.view"], exact: true, desc: "Indicadores, receita e alertas", keywords: "dashboard mrr churn receita" }] },
  {
    label: "Pessoas",
    items: [
      { path: "/admin/alunos", label: "Alunos", icon: UsersRound, perm: ["students.view"], desc: "Cadastro, plano, progresso e perfil", keywords: "aluno cliente assinante" },
      { path: "/admin/professores", label: "Professores", icon: UserRoundCheck, perm: ["teachers.view"], desc: "Parceiros, indicações e comissões", keywords: "professor instrutor comissao indicacao" },
      { path: "/admin/consultas", label: "Consultas", icon: CalendarClock, perm: ["appointments.view"], desc: "Consultas online com professores", keywords: "agenda agendamento" },
    ],
  },
  { label: "Conteúdo", items: [{ path: "/admin/metodo", label: "Método e exercícios", icon: Dumbbell, perm: ["method.view"], alias: ["/admin/estudio"], desc: "Aulas, exercícios e Estúdio 3D", keywords: "estudio 3d rig musculo video aula fase" }] },
  {
    label: "Comercial",
    items: [
      { path: "/admin/pagamentos", label: "Pagamentos e repasses", icon: CreditCard, perm: ["payments.view", "commissions.view"], desc: "Cobranças, reembolsos, comissões e repasses", keywords: "financeiro assinatura reembolso" },
      { path: "/admin/planos", label: "Planos e preços", icon: Tags, perm: ["pricing.view"], desc: "Pacotes, promoções, códigos e calendário festivo", keywords: "preco desconto cupom codigo promocao black friday feriado" },
    ],
  },
  {
    label: "Conformidade",
    items: [
      { path: "/admin/juridico", label: "Jurídico", icon: Scale, perm: ["legal.view"], desc: "Termos, privacidade e documentos legais", keywords: "lgpd termos privacidade advogado documento" },
      { path: "/admin/auditoria", label: "Auditoria e LGPD", icon: ShieldCheck, perm: ["audit.view"], desc: "Registro de ações e direitos do titular", keywords: "log lgpd exportar dados" },
    ],
  },
  {
    label: "Plataforma",
    items: [{ path: "/admin/configuracoes", label: "Configurações", icon: Settings, perm: SETTINGS_PERMS, alias: ["/admin/emails"], desc: "E-mails, pagamentos, equipe, banco e sistema", children: SETTINGS, keywords: "ajustes" } as NavParent],
  },
];

export const hasKids = (i: NavLeaf | NavParent): i is NavParent => "children" in i;
export const allowedFor = (perm: Perm, role: string | null, perms: readonly string[]) =>
  perm === "master" ? role === "admin" : role === "admin" || perm.some((p) => perms.includes(p));
