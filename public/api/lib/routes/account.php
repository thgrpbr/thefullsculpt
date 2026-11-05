<?php
declare(strict_types=1);

/** Rotas /me/* — conta do próprio aluno: perfil, senha, pagamentos, sessões e logs de acesso. */

use TFS\Audit;
use TFS\Auth;
use TFS\Crypto;
use TFS\DB;
use TFS\Http;
use TFS\Rate;
use TFS\Settings;
use TFS\Util;

$u = requireUser($pdo, $cfg);
$uid = (int) $u['id'];
$route = "$method $path";
$m = [];

/** @return array<string,string> */
$loadAddress = static function (array $u) use ($cfg): array {
    $blank = ['zip' => '', 'street' => '', 'number' => '', 'complement' => '', 'district' => '', 'city' => '', 'state' => '', 'country' => 'BR'];
    if (empty($u['profile_enc'])) {
        return $blank;
    }
    $plain = Crypto::dec((string) $u['profile_enc'], $cfg);
    $j = $plain ? json_decode($plain, true) : null;
    return array_merge($blank, is_array($j['address'] ?? null) ? array_map('strval', $j['address']) : []);
};

if ($route === 'GET /me/profile') {
    Http::json([
        'name' => $u['name'], 'email' => $u['email'], 'phone' => $u['phone'], 'locale' => $u['locale'], 'createdAt' => $u['created_at'],
        'address' => $loadAddress($u),
    ]);
}

if ($route === 'PUT /me/profile') {
    if (!Rate::hit($pdo, "prof:$uid", 30, 3600)) {
        Http::fail(429, 'rate_limited');
    }
    $b = Http::body();
    $name = trim((string) ($b['name'] ?? ''));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
        Http::fail(422, 'invalid_name');
    }
    $phone = trim((string) ($b['phone'] ?? ''));
    if ($phone !== '' && !preg_match('/^[0-9+()\\-\\s]{6,30}$/', $phone)) {
        Http::fail(422, 'invalid_phone');
    }
    $locale = in_array($b['locale'] ?? $u['locale'], ['pt', 'en', 'es'], true) ? ($b['locale'] ?? $u['locale']) : $u['locale'];
    $a = is_array($b['address'] ?? null) ? $b['address'] : [];
    $addr = [];
    foreach (['zip' => 10, 'street' => 120, 'number' => 12, 'complement' => 60, 'district' => 60, 'city' => 80, 'state' => 2, 'country' => 2] as $k => $max) {
        $v = trim((string) ($a[$k] ?? ''));
        if (mb_strlen($v) > $max) {
            Http::fail(422, 'invalid_address');
        }
        $addr[$k] = in_array($k, ['state', 'country'], true) ? strtoupper($v) : $v;
    }
    if ($addr['zip'] !== '' && !preg_match('/^[0-9A-Za-z\\- ]{3,10}$/', $addr['zip'])) {
        Http::fail(422, 'invalid_address');
    }
    $enc = Crypto::enc((string) json_encode(['address' => $addr], JSON_UNESCAPED_UNICODE), $cfg);
    DB::run($pdo, 'UPDATE users SET name = ?, phone = ?, locale = ?, profile_enc = ? WHERE id = ?', [$name, $phone !== '' ? $phone : null, $locale, $enc, $uid]);
    Audit::log($pdo, $cfg, $uid, 'profile_updated');
    Http::json(['ok' => true]);
}

if ($route === 'PUT /me/password') {
    if (!Rate::hit($pdo, "pw:$uid", 8, 3600)) {
        Http::fail(429, 'rate_limited');
    }
    $b = Http::body();
    $cur = (string) ($b['current'] ?? '');
    $new = $b['new'] ?? null;
    if (!password_verify($cur, (string) $u['password_hash'])) {
        Http::fail(401, 'invalid_credentials');
    }
    if (!is_string($new) || strlen($new) < 10 || strlen($new) > 200 || strtolower($new) === strtolower((string) $u['email'])) {
        Http::fail(422, 'weak_password');
    }
    DB::run($pdo, 'UPDATE users SET password_hash = ? WHERE id = ?', [Auth::hash($new), $uid]);
    $token = (string) ($_COOKIE[Auth::COOKIE] ?? '');
    DB::run($pdo, 'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [$uid, hash('sha256', $token)]);
    Audit::log($pdo, $cfg, $uid, 'password_changed');
    Http::json(['ok' => true]);
}

if ($route === 'GET /me/payments') {
    $sub = DB::one($pdo, 'SELECT id, status, price_cents, started_at, canceled_at, provider FROM subscriptions WHERE user_id = ? ORDER BY id DESC', [$uid]);
    $pays = DB::all($pdo, 'SELECT id, amount_cents, currency, status, method, COALESCE(paid_at, created_at) AS at FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 60', [$uid]);
    $lastPaid = null;
    foreach ($pays as $p) {
        if ($p['status'] === 'paid') {
            $lastPaid = $p['at'];
            break;
        }
    }
    $next = ($sub && $sub['status'] === 'active' && $lastPaid) ? gmdate('Y-m-d', strtotime($lastPaid . ' UTC') + 30 * 86400) : null;
    Http::json([
        'subscription' => $sub ? $sub + ['next_charge' => $next] : null,
        'price_cents' => (int) (\TFS\Pricing::defaultPlan($pdo)['price_cents'] ?? Settings::all($pdo)['price_cents']),
        'method' => ['type' => $u['pay_method'] ?: 'card', 'brand' => $u['pay_brand'], 'last4' => $u['pay_last4']],
        'payments' => $pays,
        'total_paid_cents' => array_sum(array_map(static fn($p) => $p['status'] === 'paid' ? (int) $p['amount_cents'] : 0, $pays)),
    ]);
}

if ($route === 'PUT /me/payment-method') {
    $b = Http::body();
    if (!in_array($b['method'] ?? '', ['card', 'pix'], true)) {
        Http::fail(422, 'invalid_input');
    }
    // Dados de cartão NUNCA passam por este servidor: quando o Stripe entrar, brand/last4 chegam pelo webhook.
    DB::run($pdo, 'UPDATE users SET pay_method = ? WHERE id = ?', [$b['method'], $uid]);
    Audit::log($pdo, $cfg, $uid, 'payment_method_changed', (string) $b['method']);
    Http::json(['ok' => true]);
}

if ($route === 'POST /me/subscription/cancel') {
    $b = Http::body();
    if (($b['confirm'] ?? false) !== true) {
        Http::fail(422, 'confirm_required');
    }
    $sub = DB::one($pdo, "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC", [$uid]);
    if (!$sub) {
        Http::fail(409, 'not_cancelable');
    }
    $now = DB::now();
    DB::run($pdo, "UPDATE subscriptions SET status = 'canceled', canceled_at = ? WHERE user_id = ? AND status = 'active'", [$now, $uid]);
    DB::run($pdo, "UPDATE user_stats SET sub_status = 'free', updated_at = ? WHERE user_id = ?", [$now, $uid]);
    Audit::log($pdo, $cfg, $uid, 'subscription_canceled_by_user');
    Http::json(['ok' => true]);
}

if ($route === 'GET /me/access') {
    $cur = hash('sha256', (string) ($_COOKIE[Auth::COOKIE] ?? ''));
    $sessions = array_map(static fn($s) => [
        'id' => (int) $s['id'], 'device' => Util::uaLabel((string) $s['ua']), 'created_at' => $s['created_at'], 'last_seen_at' => $s['last_seen_at'], 'current' => hash_equals($cur, (string) $s['token_hash']),
    ], DB::all($pdo, 'SELECT id, token_hash, ua, created_at, last_seen_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC', [$uid, DB::now()]));
    $events = DB::all($pdo, "SELECT action, meta, created_at FROM audit_log WHERE user_id = ? AND action IN ('login_ok','login_fail','register','password_changed','profile_updated','export','anamnese_saved','payment_method_changed','subscription_canceled_by_user','session_revoked','password_reset','appointment_requested','appointment_canceled') ORDER BY id DESC LIMIT 40", [$uid]);
    Http::json(['sessions' => $sessions, 'events' => $events]);
}

if ($route === 'POST /me/sessions/revoke-others') {
    $token = (string) ($_COOKIE[Auth::COOKIE] ?? '');
    $n = DB::run($pdo, 'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [$uid, hash('sha256', $token)]);
    Audit::log($pdo, $cfg, $uid, 'session_revoked', "others:$n");
    Http::json(['revoked' => $n]);
}
if ($method === 'DELETE' && preg_match('#^/me/sessions/(\d+)$#', $path, $m)) {
    $token = hash('sha256', (string) ($_COOKIE[Auth::COOKIE] ?? ''));
    $n = DB::run($pdo, 'DELETE FROM sessions WHERE id = ? AND user_id = ? AND token_hash <> ?', [$m[1], $uid, $token]);
    if ($n === 0) {
        Http::fail(404, 'not_found');
    }
    Audit::log($pdo, $cfg, $uid, 'session_revoked', (string) $m[1]);
    Http::json(['ok' => true]);
}

Http::fail(404, 'not_found');
