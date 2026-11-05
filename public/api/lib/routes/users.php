<?php
declare(strict_types=1);

/**
 * Equipe do painel (somente administrador master — garantido em index.php):
 * cadastrar usuários, escolher perfil (Advogado, Financeiro…) e ajustar permissões uma a uma.
 */

use TFS\Audit;
use TFS\Auth;
use TFS\DB;
use TFS\Http;
use TFS\Perms;
use TFS\Seed;

$me = requireRole($pdo, $cfg, ['admin']);
$uid = (int) $me['id'];
$route = "$method $path";
$m = [];

/** @return array{0:string,1:string,2:list<string>} [role, rótulo, permissões] a partir do corpo da requisição */
$resolve = static function (array $b): array {
    $profile = (string) ($b['profile'] ?? 'custom');
    $preset = Perms::PRESETS[$profile] ?? null;
    $perms = Perms::clean(array_key_exists('permissions', $b) ? $b['permissions'] : ($preset['perms'] ?? []));
    $role = $preset['role'] ?? 'staff';
    $label = $preset['label'] ?? 'Personalizado';
    return [$role, $label, $perms];
};

$view = static function (array $u): array {
    return [
        'id' => (int) $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'profile_label' => $u['profile_label'] ?? ($u['role'] === 'legal' ? 'Advogado' : null),
        'status' => $u['status'], 'permissions' => Perms::of($u), 'last_login_at' => $u['last_login_at'], 'created_at' => $u['created_at'],
    ];
};

if ($route === 'GET /admin/users') {
    $rows = DB::all($pdo, "SELECT * FROM users WHERE role IN ('admin','legal','staff') AND deleted_at IS NULL ORDER BY (role = 'admin') DESC, name");
    Http::json([
        'rows' => array_map($view, $rows),
        'catalog' => array_map(static fn($k, $v) => ['key' => $k, 'group' => $v[0], 'label' => $v[1]], array_keys(Perms::CATALOG), array_values(Perms::CATALOG)),
        'presets' => array_map(static fn($k, $v) => ['key' => $k, 'label' => $v['label'], 'role' => $v['role'], 'permissions' => $v['perms']], array_keys(Perms::PRESETS), array_values(Perms::PRESETS)),
        'me' => (int) $me['id'],
    ]);
}

if ($route === 'POST /admin/users') {
    $b = Http::body();
    $name = trim((string) ($b['name'] ?? ''));
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) {
        Http::fail(422, 'invalid_input');
    }
    if (DB::one($pdo, 'SELECT id FROM users WHERE email = ?', [$email])) {
        Http::fail(409, 'email_taken');
    }
    [$role, $label, $perms] = $resolve($b);
    if ($perms === []) {
        Http::fail(422, 'no_permissions');
    }
    $temp = Seed::password();
    DB::run($pdo, 'INSERT INTO users (email, password_hash, name, role, locale, permissions, profile_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$email, Auth::hash($temp), $name, $role, 'pt', json_encode($perms), $label, DB::now()]);
    $newId = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $uid, 'admin_user_created', "user:$newId $label");
    Http::json(['id' => $newId, 'tempPassword' => $temp], 201);
}

if (preg_match('#^/admin/users/(\d+)(/reset-password)?$#', $path, $m)) {
    $tid = (int) $m[1];
    $t = DB::one($pdo, "SELECT * FROM users WHERE id = ? AND role IN ('admin','legal','staff') AND deleted_at IS NULL", [$tid]);
    if (!$t) {
        Http::fail(404, 'not_found');
    }
    if ($t['role'] === 'admin' || $tid === $uid) {
        Http::fail(403, 'master_protected');   // o master não é editável por aqui (evita ficar sem acesso)
    }

    if ($method === 'POST' && ($m[2] ?? '') === '/reset-password') {
        $temp = Seed::password();
        DB::run($pdo, 'UPDATE users SET password_hash = ? WHERE id = ?', [Auth::hash($temp), $tid]);
        DB::run($pdo, 'DELETE FROM sessions WHERE user_id = ?', [$tid]);
        Audit::log($pdo, $cfg, $uid, 'admin_user_reset', "user:$tid");
        Http::json(['tempPassword' => $temp]);
    }

    if ($method === 'PATCH') {
        $b = Http::body();
        $sets = [];
        $p = [];
        if (isset($b['name'])) {
            $n = trim((string) $b['name']);
            if (mb_strlen($n) < 2 || mb_strlen($n) > 120) {
                Http::fail(422, 'invalid_input');
            }
            $sets[] = 'name = ?';
            $p[] = $n;
        }
        if (isset($b['status'])) {
            if (!in_array($b['status'], ['active', 'suspended'], true)) {
                Http::fail(422, 'invalid_input');
            }
            $sets[] = 'status = ?';
            $p[] = $b['status'];
        }
        if (isset($b['permissions']) || isset($b['profile'])) {
            [$role, $label, $perms] = $resolve($b);
            if ($perms === []) {
                Http::fail(422, 'no_permissions');
            }
            array_push($sets, 'role = ?', 'permissions = ?', 'profile_label = ?');
            array_push($p, $role, json_encode($perms), $label);
        }
        if ($sets === []) {
            Http::fail(422, 'invalid_input');
        }
        $p[] = $tid;
        DB::run($pdo, 'UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $p);
        if (($b['status'] ?? '') === 'suspended' || isset($b['permissions']) || isset($b['profile'])) {
            DB::run($pdo, 'DELETE FROM sessions WHERE user_id = ?', [$tid]);   // força novo login com as permissões atuais
        }
        Audit::log($pdo, $cfg, $uid, 'admin_user_updated', "user:$tid " . implode(',', array_keys($b)));
        Http::json(['ok' => true]);
    }

    if ($method === 'DELETE') {
        DB::run($pdo, 'UPDATE users SET deleted_at = ?, status = ? WHERE id = ?', [DB::now(), 'suspended', $tid]);
        DB::run($pdo, 'DELETE FROM sessions WHERE user_id = ?', [$tid]);
        Audit::log($pdo, $cfg, $uid, 'admin_user_deleted', "user:$tid");
        Http::json(['ok' => true]);
    }
}

Http::fail(404, 'not_found');
