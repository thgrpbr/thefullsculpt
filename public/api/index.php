<?php
declare(strict_types=1);

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/migrations.php';
require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/analytics.php';
require __DIR__ . '/lib/demo.php';
require __DIR__ . '/lib/mail.php';

use TFS\Audit;
use TFS\Auth;
use TFS\Config;
use TFS\Crypto;
use TFS\DB;
use TFS\Billing;
use TFS\Game;
use TFS\Mailer;
use TFS\Migrator;
use TFS\Util;
use TFS\Http;
use TFS\Rate;
use TFS\State;

ini_set('display_errors', '0');
set_exception_handler(static function (\Throwable $e): void {
    error_log('[tfs] ' . $e::class . ': ' . $e->getMessage());
    Http::fail(500, 'server_error');
});

const CONSENT_VERSION = '2026-11';

$cfg = Config::load();
if ($cfg === null) {
    Http::fail(503, 'not_installed');
}
$pdo = DB::pdo($cfg);
Migrator::run($pdo);
Http::guardWrite(is_array($cfg['allowed_origins'] ?? null) ? $cfg['allowed_origins'] : []);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = '/' . trim((string) preg_replace('#^/api#', '', $path), '/');
$ip = Http::ip();

/** @return array<string,mixed> */
function requireUser(PDO $pdo, array $cfg): array
{
    $u = Auth::user($pdo, $cfg);
    if (!$u) {
        Http::fail(401, 'unauthenticated');
    }
    return $u;
}

/** @param list<string> $roles @return array<string,mixed> */
function requireRole(PDO $pdo, array $cfg, array $roles): array
{
    $u = requireUser($pdo, $cfg);
    if (!in_array($u['role'], $roles, true)) {
        Http::fail(403, 'forbidden');
    }
    return $u;
}

function str(mixed $v, int $min, int $max): string
{
    if (!is_string($v)) {
        Http::fail(422, 'invalid_input');
    }
    $v = trim($v);
    $len = mb_strlen($v);
    if ($len < $min || $len > $max) {
        Http::fail(422, 'invalid_input');
    }
    return $v;
}

if (str_starts_with($path, '/admin')) {
    require __DIR__ . '/lib/routes/admin.php';
}
if (str_starts_with($path, '/me/')) {
    require __DIR__ . '/lib/routes/account.php';
}
if (str_starts_with($path, '/teacher')) {
    require __DIR__ . '/lib/routes/teacher.php';
}
if ($path === '/catalog' || str_starts_with($path, '/appointments')) {
    require __DIR__ . '/lib/routes/student.php';
}

switch ("$method $path") {
    case 'GET /health':
        Http::json(['ok' => true]);

    /* ---------------- Cadastro e sessão ---------------- */
    case 'POST /auth/register':
        if (!Rate::hit($pdo, "reg:$ip", 8, 3600)) {
            Http::fail(429, 'rate_limited');
        }
        $b = Http::body();
        $name = str($b['name'] ?? null, 2, 120);
        $email = strtolower(str($b['email'] ?? null, 5, 190));
        $password = $b['password'] ?? null;
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Http::fail(422, 'invalid_email');
        }
        if (!is_string($password) || strlen($password) < 10 || strlen($password) > 200 || strtolower($password) === $email) {
            Http::fail(422, 'weak_password');
        }
        $c = is_array($b['consents'] ?? null) ? $b['consents'] : [];
        if (($c['terms'] ?? false) !== true || ($c['health'] ?? false) !== true) {
            Http::fail(422, 'consent_required');
        }
        $locale = in_array($b['locale'] ?? '', ['pt', 'en', 'es'], true) ? $b['locale'] : 'pt';
        if (DB::one($pdo, 'SELECT id FROM users WHERE email = ?', [$email])) {
            Http::fail(409, 'email_taken');
        }
        $now = DB::now();
        $teacherId = null;
        $source = 'organic';
        $ref = strtoupper(trim((string) ($b['ref'] ?? '')));
        if ($ref !== '' && preg_match('/^[A-Z0-9]{3,24}$/', $ref)) {
            $tp = DB::one($pdo, "SELECT user_id FROM teacher_profiles WHERE code = ? AND status = 'active'", [$ref]);
            if ($tp) {
                $teacherId = (int) $tp['user_id'];
                $source = 'ref:' . $ref;
            }
        }
        $pdo->beginTransaction();
        try {
            DB::run($pdo, 'INSERT INTO users (email, password_hash, name, role, teacher_id, locale, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$email, Auth::hash($password), $name, 'student', $teacherId, $locale, $now, $source]);
            $uid = (int) $pdo->lastInsertId();
            DB::run($pdo, 'INSERT INTO user_stats (user_id, updated_at) VALUES (?, ?)', [$uid, $now]);
            foreach (['terms' => true, 'health' => true, 'marketing' => ($c['marketing'] ?? false) === true] as $type => $granted) {
                DB::run($pdo, 'INSERT INTO consents (user_id, type, granted, version, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [$uid, $type, $granted ? 1 : 0, CONSENT_VERSION, Crypto::ipHash($cfg), $now]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log($pdo, $cfg, $uid, 'register');
        Auth::start($pdo, $cfg, $uid);
        Mailer::notify($pdo, $cfg, 'welcome', $email, $locale, ['url' => Mailer::publicUrl($pdo) . '/' . $locale . '/app/']);
        $user = DB::one($pdo, 'SELECT * FROM users WHERE id = ?', [$uid]);
        Http::json(State::forUser($pdo, $cfg, $user), 201);

    case 'POST /auth/login':
        $b = Http::body();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $password = (string) ($b['password'] ?? '');
        if (!Rate::hit($pdo, "login:$ip", 30, 900) || !Rate::hit($pdo, "login:$ip:$email", 8, 900)) {
            Http::fail(429, 'rate_limited');
        }
        $user = $email !== '' ? DB::one($pdo, 'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [$email]) : null;
        $ok = $user ? password_verify($password, (string) $user['password_hash']) : (Auth::hash('dummy-' . $password) === '');
        if (!$ok || !$user) {
            Audit::log($pdo, $cfg, $user ? (int) $user['id'] : null, 'login_fail');
            Http::fail(401, 'invalid_credentials');
        }
        $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        if (password_needs_rehash((string) $user['password_hash'], $algo)) {
            DB::run($pdo, 'UPDATE users SET password_hash = ? WHERE id = ?', [Auth::hash($password), $user['id']]);
        }
        if (($user['status'] ?? 'active') !== 'active') {
            Audit::log($pdo, $cfg, (int) $user['id'], 'login_blocked');
            Http::fail(403, 'account_suspended');
        }
        DB::run($pdo, 'UPDATE users SET last_login_at = ? WHERE id = ?', [DB::now(), $user['id']]);
        Audit::log($pdo, $cfg, (int) $user['id'], 'login_ok', Util::uaLabel());
        Auth::start($pdo, $cfg, (int) $user['id']);
        Http::json(State::forUser($pdo, $cfg, $user));

    case 'POST /auth/forgot':
        $b = Http::body();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $lang = in_array($b['locale'] ?? '', ['pt', 'en', 'es'], true) ? $b['locale'] : 'pt';
        if (!Rate::hit($pdo, "forgot:$ip", 6, 3600) || ($email !== '' && !Rate::hit($pdo, 'forgot:' . $email, 3, 3600))) {
            Http::fail(429, 'rate_limited');
        }
        // Resposta idêntica exista ou não a conta (não revela cadastros).
        $user = $email !== '' ? DB::one($pdo, "SELECT id, email, locale FROM users WHERE email = ? AND status = 'active' AND deleted_at IS NULL", [$email]) : null;
        if ($user && Mailer::enabled($pdo)) {
            $raw = bin2hex(random_bytes(32));
            DB::run($pdo, 'INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
                [$user['id'], hash('sha256', $raw), gmdate('Y-m-d H:i:s', time() + 3600), DB::now()]);
            Mailer::notify($pdo, $cfg, 'reset', (string) $user['email'], $lang, ['url' => Mailer::publicUrl($pdo) . '/' . $lang . '/redefinir/?token=' . $raw]);
            Audit::log($pdo, $cfg, (int) $user['id'], 'password_reset_requested');
        }
        Http::json(['ok' => true]);

    case 'POST /auth/reset':
        $b = Http::body();
        $token = (string) ($b['token'] ?? '');
        $new = $b['password'] ?? null;
        if (!Rate::hit($pdo, "reset:$ip", 10, 3600)) {
            Http::fail(429, 'rate_limited');
        }
        if (!is_string($new) || strlen($new) < 10 || strlen($new) > 200) {
            Http::fail(422, 'weak_password');
        }
        $row = preg_match('/^[a-f0-9]{64}$/', $token)
            ? DB::one($pdo, 'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', [hash('sha256', $token), DB::now()])
            : null;
        if (!$row) {
            Http::fail(400, 'invalid_token');
        }
        $pdo->beginTransaction();
        try {
            DB::run($pdo, 'UPDATE users SET password_hash = ? WHERE id = ?', [Auth::hash($new), $row['user_id']]);
            DB::run($pdo, 'UPDATE password_resets SET used_at = ? WHERE id = ?', [DB::now(), $row['id']]);
            DB::run($pdo, 'DELETE FROM sessions WHERE user_id = ?', [$row['user_id']]);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log($pdo, $cfg, (int) $row['user_id'], 'password_reset');
        Http::json(['ok' => true]);

    case 'POST /auth/logout':
        Auth::logout($pdo, $cfg);
        Http::json(['ok' => true]);

    case 'GET /me':
        Http::json(State::forUser($pdo, $cfg, requireUser($pdo, $cfg)));

    /* ---------------- Anamnese (criptografada) ---------------- */
    case 'PUT /anamnese':
        $user = requireUser($pdo, $cfg);
        $uid = (int) $user['id'];
        if (!Rate::hit($pdo, "anam:$uid", 20, 3600)) {
            Http::fail(429, 'rate_limited');
        }
        $b = Http::body();
        $answers = $b['answers'] ?? null;
        $a = $b['assignment'] ?? null;
        if (!is_array($answers) || !is_array($a)) {
            Http::fail(422, 'invalid_input');
        }
        $phase = $a['phase'] ?? null;
        if (!is_int($phase) || $phase < 1 || $phase > 9) {
            Http::fail(422, 'invalid_input');
        }
        $restrictions = array_values(array_filter(
            is_array($a['restrictions'] ?? null) ? $a['restrictions'] : [],
            static fn($r) => is_string($r) && mb_strlen($r) <= 20,
        ));
        $blob = json_encode([
            'answers' => $answers,
            'medicalClearance' => ($a['medicalClearance'] ?? false) === true,
            'restrictions' => array_slice($restrictions, 0, 10),
        ], JSON_UNESCAPED_UNICODE);
        if ($blob === false || strlen($blob) > 16384) {
            Http::fail(422, 'invalid_input');
        }
        $enc = Crypto::enc($blob, $cfg);
        $now = DB::now();
        if (DB::one($pdo, 'SELECT user_id FROM anamneses WHERE user_id = ?', [$uid])) {
            DB::run($pdo, 'UPDATE anamneses SET data_enc = ?, updated_at = ? WHERE user_id = ?', [$enc, $now, $uid]);
        } else {
            DB::run($pdo, 'INSERT INTO anamneses (user_id, data_enc, updated_at) VALUES (?, ?, ?)', [$uid, $enc, $now]);
        }
        DB::run($pdo, 'UPDATE user_stats SET phase = ?, updated_at = ? WHERE user_id = ?', [$phase, $now, $uid]);
        Audit::log($pdo, $cfg, $uid, 'anamnese_saved');
        Http::json(State::forUser($pdo, $cfg, $user));

    /* ---------------- Aulas e gamificação ---------------- */
    case 'POST /lessons/complete':
        $user = requireUser($pdo, $cfg);
        $uid = (int) $user['id'];
        if (!Rate::hit($pdo, "lesson:$uid", 40, 3600)) {
            Http::fail(429, 'rate_limited');
        }
        $b = Http::body();
        $lid = (string) ($b['lessonId'] ?? '');
        if (!preg_match('/^f([1-9])-([1-6])$/', $lid, $m)) {
            Http::fail(422, 'invalid_input');
        }
        $lp = (int) $m[1];
        $ln = (int) $m[2];
        $sec = (int) ($b['sec'] ?? 0);
        $rpe = (int) ($b['rpe'] ?? 0);
        $steps = (int) ($b['steps'] ?? 0);
        if ($sec < 1 || $sec > 21600 || $rpe < 1 || $rpe > 10 || $steps < 1 || $steps > 60) {
            Http::fail(422, 'invalid_input');
        }
        $stats = DB::one($pdo, 'SELECT * FROM user_stats WHERE user_id = ?', [$uid]);
        if (!$stats || !DB::one($pdo, 'SELECT 1 AS x FROM anamneses WHERE user_id = ?', [$uid])) {
            Http::fail(409, 'anamnese_required');
        }
        $cur = (int) $stats['phase'];
        $done = (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM lesson_logs WHERE user_id = ?', [$uid])['n'];
        if ($stats['sub_status'] !== 'active') {
            // aula grátis: uma única vez, a primeira aula da fase do perfil
            if ($done > 0 || $ln !== 1 || $lp !== $cur) {
                Http::fail(402, 'subscription_required');
            }
        } elseif ($lp > $cur) {
            Http::fail(403, 'phase_locked');
        }
        $today = Game::validDay(is_string($b['day'] ?? null) ? $b['day'] : null);
        $xp = 50 + $steps * 10;
        $streak = (int) $stats['streak'];
        $last = $stats['last_day'];
        if ($last !== $today) {
            $streak = ($last && Game::dayDiff((string) $last, $today) <= 2 && Game::dayDiff((string) $last, $today) >= 0) ? $streak + 1 : 1;
        }
        $now = DB::now();
        $pdo->beginTransaction();
        try {
            DB::run($pdo, 'INSERT INTO lesson_logs (user_id, lesson_id, day, sec, rpe, xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$uid, $lid, $today, $sec, $rpe, $xp, $now]);
            DB::run($pdo, 'UPDATE user_stats SET xp = xp + ?, streak = ?, best_streak = ?, last_day = ?, updated_at = ? WHERE user_id = ?',
                [$xp, $streak, max((int) $stats['best_streak'], $streak), $today, $now, $uid]);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Http::json(State::forUser($pdo, $cfg, $user));

    case 'POST /phase/advance':
        $user = requireUser($pdo, $cfg);
        $uid = (int) $user['id'];
        $stats = DB::one($pdo, 'SELECT * FROM user_stats WHERE user_id = ?', [$uid]);
        $cur = (int) ($stats['phase'] ?? 1);
        $n = DB::all($pdo, 'SELECT DISTINCT lesson_id FROM lesson_logs WHERE user_id = ? AND lesson_id LIKE ?', [$uid, "f$cur-%"]);
        if ($cur >= 9 || count($n) < Game::LESSONS_PER_PHASE || ($stats['sub_status'] ?? '') !== 'active') {
            Http::fail(409, 'not_ready');
        }
        DB::run($pdo, 'UPDATE user_stats SET phase = ?, updated_at = ? WHERE user_id = ?', [$cur + 1, DB::now(), $uid]);
        Http::json(State::forUser($pdo, $cfg, $user));

    /* ---------------- Assinatura (teste até ligar o Stripe) ---------------- */
    case 'POST /subscription/activate':
        $user = requireUser($pdo, $cfg);
        if (($cfg['allow_test_subscription'] ?? false) !== true) {
            Http::fail(403, 'forbidden');
        }
        if (!DB::one($pdo, "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'", [$user['id']])) {
            Billing::recordPayment($pdo, (int) $user['id'], (int) \TFS\Settings::all($pdo)['price_cents'], 'card', 'test');
        }
        DB::run($pdo, "UPDATE user_stats SET sub_status = 'active', updated_at = ? WHERE user_id = ?", [DB::now(), $user['id']]);
        Audit::log($pdo, $cfg, (int) $user['id'], 'subscription_test_activate');
        Http::json(State::forUser($pdo, $cfg, $user));

    /* ---------------- Privacidade (LGPD) ---------------- */
    case 'PUT /consents':
        $user = requireUser($pdo, $cfg);
        $b = Http::body();
        if (!is_bool($b['marketing'] ?? null)) {
            Http::fail(422, 'invalid_input');
        }
        DB::run($pdo, 'INSERT INTO consents (user_id, type, granted, version, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$user['id'], 'marketing', $b['marketing'] ? 1 : 0, CONSENT_VERSION, Crypto::ipHash($cfg), DB::now()]);
        Audit::log($pdo, $cfg, (int) $user['id'], 'consent_marketing', $b['marketing'] ? 'on' : 'off');
        Http::json(State::forUser($pdo, $cfg, $user));

    case 'GET /privacy/export':
        $user = requireUser($pdo, $cfg);
        $uid = (int) $user['id'];
        Audit::log($pdo, $cfg, $uid, 'export');
        Http::json([
            'exportedAt' => gmdate('c'),
            'data' => State::forUser($pdo, $cfg, $user),
            'consents' => DB::all($pdo, 'SELECT type, granted, version, created_at FROM consents WHERE user_id = ? ORDER BY id', [$uid]),
            'activity' => DB::all($pdo, 'SELECT action, created_at FROM audit_log WHERE user_id = ? ORDER BY id', [$uid]),
        ]);

    case 'DELETE /privacy/account':
        $user = requireUser($pdo, $cfg);
        $uid = (int) $user['id'];
        $b = Http::body();
        if (!Rate::hit($pdo, "del:$uid", 5, 3600)) {
            Http::fail(429, 'rate_limited');
        }
        if (!password_verify((string) ($b['password'] ?? ''), (string) $user['password_hash'])) {
            Http::fail(401, 'invalid_credentials');
        }
        $pdo->beginTransaction();
        try {
            DB::run($pdo, 'UPDATE audit_log SET user_id = NULL WHERE user_id = ?', [$uid]);
            DB::run($pdo, 'UPDATE users SET teacher_id = NULL WHERE teacher_id = ?', [$uid]);
            DB::run($pdo, 'DELETE FROM users WHERE id = ?', [$uid]);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log($pdo, $cfg, null, 'account_deleted');
        Auth::logout($pdo, $cfg);
        Http::json(['ok' => true]);

    default:
        Http::fail(404, 'not_found');
}
