<?php
declare(strict_types=1);

namespace TFS;

/**
 * Permissões detalhadas do painel.
 *  - role "admin"  = administrador master: tudo, e é o único que gerencia usuários.
 *  - role "legal"  = perfil Advogado: área Jurídico (permissões editáveis).
 *  - role "staff"  = equipe com perfil/permissões escolhidos pelo master.
 * Rotas /admin/* sem regra mapeada ficam restritas ao master (negar por padrão).
 */
final class Perms
{
    /** chave => [grupo, rótulo] */
    public const CATALOG = [
        'overview.view' => ['Visão geral', 'Ver painel e indicadores'],
        'students.view' => ['Alunos', 'Ver alunos e histórico'],
        'students.edit' => ['Alunos', 'Editar alunos (status, fase, plano, professor, notas)'],
        'students.health' => ['Alunos', 'Ler anamnese / dados de saúde (sensível, gera auditoria)'],
        'students.delete' => ['Alunos', 'Excluir alunos e exportar dados de um aluno'],
        'teachers.view' => ['Professores', 'Ver professores'],
        'teachers.edit' => ['Professores', 'Cadastrar e editar professores'],
        'method.view' => ['Método', 'Ver exercícios e aulas'],
        'method.edit' => ['Método', 'Criar e editar exercícios e aulas'],
        'payments.view' => ['Financeiro', 'Ver pagamentos e assinaturas'],
        'payments.edit' => ['Financeiro', 'Reembolsar e cancelar assinaturas'],
        'commissions.view' => ['Financeiro', 'Ver comissões e repasses'],
        'commissions.manage' => ['Financeiro', 'Aprovar comissões e registrar repasses'],
        'gateways.manage' => ['Financeiro', 'Gateways de pagamento (credenciais)'],
        'appointments.view' => ['Consultas', 'Ver consultas'],
        'appointments.manage' => ['Consultas', 'Criar e editar consultas'],
        'settings.manage' => ['Sistema', 'Preço, comissões e regras'],
        'system.manage' => ['Sistema', 'SMTP, banco de dados e dados demo'],
        'audit.view' => ['Conformidade', 'Auditoria e LGPD'],
        'legal.view' => ['Jurídico', 'Ver documentos jurídicos e histórico'],
        'legal.edit' => ['Jurídico', 'Cadastrar e editar documentos, comentar, aprovar'],
        'legal.publish' => ['Jurídico', 'Publicar documentos no site'],
    ];

    /** Perfis prontos (o master pode ajustar caso a caso). */
    public const PRESETS = [
        'advogado' => ['label' => 'Advogado', 'role' => 'legal', 'perms' => ['legal.view', 'legal.edit']],
        'financeiro' => ['label' => 'Financeiro', 'role' => 'staff', 'perms' => ['overview.view', 'students.view', 'payments.view', 'payments.edit', 'commissions.view', 'commissions.manage']],
        'suporte' => ['label' => 'Suporte', 'role' => 'staff', 'perms' => ['overview.view', 'students.view', 'students.edit', 'teachers.view', 'appointments.view', 'appointments.manage']],
        'conteudo' => ['label' => 'Conteúdo', 'role' => 'staff', 'perms' => ['method.view', 'method.edit', 'teachers.view']],
        'leitura' => ['label' => 'Somente leitura', 'role' => 'staff', 'perms' => ['overview.view', 'students.view', 'teachers.view', 'method.view', 'payments.view', 'commissions.view', 'appointments.view']],
    ];

    /** @param array<string,mixed> $user @return list<string> */
    public static function of(array $user): array
    {
        if (($user['role'] ?? '') === 'admin') {
            return array_keys(self::CATALOG);
        }
        $raw = json_decode((string) ($user['permissions'] ?? ''), true);
        if (!is_array($raw)) {
            // advogado criado antes das permissões: assume o perfil padrão
            return ($user['role'] ?? '') === 'legal' ? self::PRESETS['advogado']['perms'] : [];
        }
        return array_values(array_filter($raw, static fn($k) => is_string($k) && isset(self::CATALOG[$k])));
    }

    /** @param array<string,mixed> $user */
    public static function can(array $user, string $key): bool
    {
        return in_array($key, self::of($user), true);
    }

    /** @param mixed $list @return list<string> */
    public static function clean(mixed $list): array
    {
        $out = [];
        foreach (is_array($list) ? $list : [] as $k) {
            if (is_string($k) && isset(self::CATALOG[$k])) {
                $out[$k] = $k;
            }
        }
        // editar/publicar/gerenciar implica poder ver
        foreach (['students.edit', 'students.health', 'students.delete'] as $k) {
            if (isset($out[$k])) {
                $out['students.view'] = 'students.view';
            }
        }
        foreach ([['teachers.edit', 'teachers.view'], ['method.edit', 'method.view'], ['payments.edit', 'payments.view'], ['commissions.manage', 'commissions.view'], ['appointments.manage', 'appointments.view'], ['legal.edit', 'legal.view'], ['legal.publish', 'legal.view']] as [$a, $b]) {
            if (isset($out[$a])) {
                $out[$b] = $b;
            }
        }
        return array_values($out);
    }

    /**
     * Permissão exigida por uma rota /admin/*. null = só o administrador master.
     * @return string|null
     */
    public static function required(string $method, string $path): ?string
    {
        $read = $method === 'GET';
        $p = preg_replace('#/\d+#', '/:id', $path) ?? $path;
        if (str_starts_with($p, '/admin/legal')) {
            if ($p === '/admin/legal/invite' || $p === '/admin/legal/users') {
                return null;
            }
            return $read ? 'legal.view' : 'legal.edit';
        }
        if (preg_match('#^/admin/export/(payments|commissions|students)\.csv$#', $p, $e)) {
            return ['payments' => 'payments.view', 'commissions' => 'commissions.view', 'students' => 'students.delete'][$e[1]];
        }
        $map = [
            '/admin/overview' => 'overview.view', '/admin/billing' => 'overview.view',
            '/admin/students/:id/anamnese' => 'students.health',
            '/admin/students' => $read ? 'students.view' : 'students.edit',
            '/admin/teachers' => $read ? 'teachers.view' : 'teachers.edit',
            '/admin/exercises' => $read ? 'method.view' : 'method.edit', '/admin/lessons' => $read ? 'method.view' : 'method.edit', '/admin/method' => $read ? 'method.view' : 'method.edit',
            '/admin/payments' => $read ? 'payments.view' : 'payments.edit', '/admin/subscriptions' => $read ? 'payments.view' : 'payments.edit',
            '/admin/commissions' => $read ? 'commissions.view' : 'commissions.manage', '/admin/payouts' => $read ? 'commissions.view' : 'commissions.manage',
            '/admin/gateways' => 'gateways.manage',
            '/admin/appointments' => $read ? 'appointments.view' : 'appointments.manage',
            '/admin/settings' => 'settings.manage',
            '/admin/smtp' => 'system.manage', '/admin/database' => 'system.manage', '/admin/system' => 'system.manage', '/admin/demo' => 'system.manage',
            '/admin/audit' => 'audit.view', '/admin/privacy' => 'audit.view',
        ];
        $best = null;
        foreach ($map as $prefix => $perm) {
            if ($p === $prefix || str_starts_with($p, $prefix . '/')) {
                if ($best === null || strlen($prefix) > strlen($best[0])) {
                    $best = [$prefix, $perm];
                }
            }
        }
        // exclusão e exportação de aluno exigem permissão própria
        if ($best && $best[1] === 'students.edit' && ($method === 'DELETE' || str_ends_with($p, '/export'))) {
            return 'students.delete';
        }
        return $best[1] ?? null;
    }
}
