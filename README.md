# THE FULL SCULPT

Metodologia de treinos em videoaulas, com corpo 3D (biomecânica + músculos), anamnese, gamificação e progresso.
Repositório: https://github.com/thgrpbr/thefullsculpt · Domínio: www.thefullsculpt.com.br

## Rodar

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

Next.js 16 (App Router) + TypeScript + Tailwind 4 + React Three Fiber + Zustand. Idiomas: `/pt`, `/en`, `/es`.

## O que existe hoje (front do aluno, dados simulados)

| Rota | Conteúdo |
|---|---|
| `/[lang]` | Site de apresentação com demo 3D interativa |
| `/[lang]/onboarding` | Cadastro + consentimento LGPD + anamnese (PAR-Q) → fase inicial |
| `/[lang]/app` | Hoje: fase atual → próxima, constância, aula do dia, XP |
| `/[lang]/app/metodo` | Matriz 3×3 (Básico/Intermediário/Avançado × Leves/Moderados/Intensos) |
| `/[lang]/app/aula/[id]` | Vídeo (placeholder) + legendas + 3D + cronômetro de execução e de pausa |
| `/[lang]/app/progresso` | Estatísticas, calendário, conquistas, histórico |
| `/[lang]/app/desafios` | Desafios em grupo estilo Gym Rats (ranking por constância) |
| `/[lang]/app/perfil` | Plano, idioma, privacidade (exportar/excluir dados) |
| `/[lang]/assine` | Paywall (Stripe ainda simulado) |

O botão "Explorar com dados de teste" carrega a persona demo (Fase 4, 14 aulas no histórico).

## Estrutura

- `src/lib/pose.ts` — pose do boneco com **cinemática inversa** de 2 ossos (pés ancorados, mão guiada).
- `src/components/Anatomy3D.tsx` — cena 3D: camadas corpo/músculos/esqueleto, vistas, overlay de IK.
- `src/lib/exercises.ts` — exercícios, papéis musculares (principal/auxiliar/estabilizador) e geração das aulas.
- `src/lib/anamnese.ts` — regra de classificação da fase inicial (será parametrizável no Admin).
- `src/lib/config.ts` — preço e faixas de comissão **placeholder** (virão do banco/Admin).
- `src/i18n/` — dicionários pt/en/es (en/es são tipados contra pt: chave faltando quebra o build).

## Próximos passos

1. Backend real (Supabase região São Paulo): auth, RLS por papel (aluno/professor/admin), criptografia de dados de saúde.
2. Stripe Checkout + webhooks; comissão de professores (extrato mensal; Admin edita percentuais/faixas).
3. Painel Admin/CRM e painel do Professor.
4. Vídeos (Mux/Cloudflare Stream) + legendas WebVTT; modelo anatômico definitivo (licença comercial).
5. Capacitor (iOS/Android) — acesso ao app só para assinantes (assinatura feita pela web).
6. Páginas de privacidade/termos, RIPD, DPO, pentest antes do lançamento.

> Nota de hospedagem: o projeto usa `proxy.ts` (redirecionamento de idioma), então precisa de Node.js no servidor
> (Hostinger Node.js Web App), não apenas hospedagem estática.
