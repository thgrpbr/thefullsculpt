<?php
declare(strict_types=1);

/** Rotas /admin/gateways* (admin). Incluído por routes/admin.php. */

use TFS\Audit;
use TFS\Crypto;
use TFS\DB;
use TFS\Gateways;
use TFS\Http;

$gwRoute = "$method $path";
$gm = [];

/** Normaliza os dados enviados. @param array<string,mixed> $b @param array<string,string> $old @return array{0:array<string,string>,1:string,2:string,3:string} */
$gwParse = static function (string $provider, array $b, array $old): array {
    $conf = $old;
    foreach (Gateways::fieldMap($provider) as $key => $f) {
        $v = $b['fields'][$key] ?? null;
        if (is_string($v) && trim($v) !== '') {
            $v = trim($v);
            if (mb_strlen($v) > 300 || preg_match('/[\r\n\0]/', $v)) {
                Http::fail(422, 'invalid_fields');
            }
            $conf[$key] = $v;
        } elseif (($b['clear'][$key] ?? false) === true) {
            $conf[$key] = '';
        }
    }
    foreach (Gateways::fieldMap($provider) as $key => $f) {
        if (empty($f['optional']) && ($conf[$key] ?? '') === '') {
            Http::fail(422, 'missing_fields');
        }
    }
    $mode = ($b['mode'] ?? 'sandbox') === 'live' ? 'live' : 'sandbox';
    $allowed = Gateways::CATALOG[$provider]['methods'];
    $methods = array_values(array_intersect($allowed, is_array($b['methods'] ?? null) ? $b['methods'] : $allowed));
    if (!$methods) {
        Http::fail(422, 'invalid_methods');
    }
    $label = mb_substr(trim((string) ($b['label'] ?? '')), 0, 80) ?: Gateways::CATALOG[$provider]['name'];
    return [$conf, $mode, implode(',', $methods), $label];
};

if ($gwRoute === 'GET /admin/gateways') {
    Http::json([
        'catalog' => Gateways::catalog(),
        'items' => array_map(static fn($r) => Gateways::view($r, $cfg), DB::all($pdo, 'SELECT * FROM payment_gateways ORDER BY is_default DESC, priority ASC, id ASC')),
    ]);
}

if ($gwRoute === 'POST /admin/gateways') {
    $b = Http::body();
    $provider = (string) ($b['provider'] ?? '');
    if (!isset(Gateways::CATALOG[$provider])) {
        Http::fail(422, 'invalid_provider');
    }
    [$conf, $mode, $methods, $label] = $gwParse($provider, $b, []);
    $pubKey = null;
    foreach (Gateways::fieldMap($provider) as $k => $f) {
        if (!empty($f['public'])) {
            $pubKey = mb_substr($conf[$k] ?? '', 0, 200) ?: null;
        }
    }
    $now = DB::now();
    $isFirst = DB::one($pdo, 'SELECT id FROM payment_gateways') === null;
    DB::run($pdo, 'INSERT INTO payment_gateways (provider, label, enabled, is_default, priority, mode, methods, public_key, config_enc, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$provider, $label, $isFirst ? 1 : 0, 10 + (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM payment_gateways')['n'], $mode, $methods, $pubKey, Crypto::enc((string) json_encode($conf), $cfg), $now, $now]);
    $newId = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $aid, 'admin_gateway_created', $provider);
    Http::json(['id' => $newId], 201);
}

if (preg_match('#^/admin/gateways/(\d+)(/(test|default))?$#', $path, $gm)) {
    $gid = (int) $gm[1];
    $row = DB::one($pdo, 'SELECT * FROM payment_gateways WHERE id = ?', [$gid]);
    if (!$row) {
        Http::fail(404, 'not_found');
    }
    $sub = $gm[3] ?? '';

    if ($sub === 'test' && $method === 'POST') {
        if (!TFS\Rate::hit($pdo, "gwtest:$aid", 20, 600)) {
            Http::fail(429, 'rate_limited');
        }
        $r = Gateways::test((string) $row['provider'], (string) $row['mode'], Gateways::config($row, $cfg), $cfg);
        DB::run($pdo, 'UPDATE payment_gateways SET last_test_at = ?, last_test_ok = ?, last_test_msg = ? WHERE id = ?', [DB::now(), $r['ok'] ? 1 : 0, mb_substr($r['msg'], 0, 200), $gid]);
        if (!$r['ok']) {
            DB::run($pdo, 'UPDATE payment_gateways SET enabled = 0, is_default = 0 WHERE id = ?', [$gid]);
        }
        Audit::log($pdo, $cfg, $aid, 'admin_gateway_test', $row['provider'] . ':' . ($r['ok'] ? 'ok' : 'fail'));
        Http::json($r);
    }

    if ($sub === 'default' && $method === 'POST') {
        if (!$row['enabled']) {
            Http::fail(409, 'not_enabled');
        }
        DB::run($pdo, 'UPDATE payment_gateways SET is_default = 0');
        DB::run($pdo, 'UPDATE payment_gateways SET is_default = 1 WHERE id = ?', [$gid]);
        Audit::log($pdo, $cfg, $aid, 'admin_gateway_default', (string) $row['provider']);
        Http::json(['ok' => true]);
    }

    if ($sub === '' && $method === 'PUT') {
        $b = Http::body();
        [$conf, $mode, $methods, $label] = $gwParse((string) $row['provider'], $b, Gateways::config($row, $cfg));
        $pubKey = null;
        foreach (Gateways::fieldMap((string) $row['provider']) as $k => $f) {
            if (!empty($f['public'])) {
                $pubKey = mb_substr($conf[$k] ?? '', 0, 200) ?: null;
            }
        }
        $credsChanged = Gateways::config($row, $cfg) !== $conf || $mode !== $row['mode'];
        $enabled = array_key_exists('enabled', $b) ? ($b['enabled'] === true) : (bool) $row['enabled'];
        // só ativa depois de uma conexão testada com sucesso com as credenciais atuais
        if ($enabled && ($credsChanged || !$row['last_test_ok'])) {
            Http::fail(409, 'test_required');
        }
        $priority = is_int($b['priority'] ?? null) ? max(1, min(99, $b['priority'])) : (int) $row['priority'];
        DB::run($pdo, 'UPDATE payment_gateways SET label = ?, mode = ?, methods = ?, public_key = ?, config_enc = ?, enabled = ?, priority = ?, updated_at = ?'
            . ($credsChanged ? ', last_test_ok = NULL, last_test_msg = NULL' : '') . ' WHERE id = ?',
            [$label, $mode, $methods, $pubKey, Crypto::enc((string) json_encode($conf), $cfg), $enabled ? 1 : 0, $priority, DB::now(), $gid]);
        if (!$enabled) {
            DB::run($pdo, 'UPDATE payment_gateways SET is_default = 0 WHERE id = ?', [$gid]);
        }
        Audit::log($pdo, $cfg, $aid, 'admin_gateway_updated', (string) $row['provider']);
        Http::json(['ok' => true]);
    }

    if ($sub === '' && $method === 'DELETE') {
        DB::run($pdo, 'DELETE FROM payment_gateways WHERE id = ?', [$gid]);
        Audit::log($pdo, $cfg, $aid, 'admin_gateway_deleted', (string) $row['provider']);
        Http::json(['ok' => true]);
    }
}
