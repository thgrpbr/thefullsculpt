<?php
declare(strict_types=1);

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/migrations.php';
require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/analytics.php';
require __DIR__ . '/lib/demo.php';
require __DIR__ . '/lib/mail.php';
require __DIR__ . '/lib/gateways.php';
require __DIR__ . '/lib/perms.php';
require __DIR__ . '/lib/pricing.php';

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



$cfg = Config::load();
if ($cfg === null) {
    Http::fail(503, 'not_installed');
}
$pdo = DB::pdo($cfg);
Migrator::run($pdo);
define('CONSENT_VERSION', (string) (\TFS\Settings::all($pdo)['consent_version'] ?? '2026-11'));
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = '/' . trim((string) preg_replace('#^/api#', '', $path), '/');
$ip = Http::ip();
if (!str_starts_with($path, '/webhooks/')) {
    Http::guardWrite(is_array($cfg['allowed_origins'] ?? null) ? $cfg['allowed_origins'] : []);
}

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
    // porta única do painel: perfil + permissão detalhada por rota (rota sem regra = só o administrador master)
    $gate = requireRole($pdo, $cfg, ['admin', 'legal', 'staff']);
    $need = \TFS\Perms::required($method, $path);
    if ($need === null ? $gate['role'] !== 'admin' : !\TFS\Perms::can($gate, $need)) {
        Http::fail(403, 'forbidden');
    }
}
if (str_starts_with($path, '/admin/legal')) {
    require __DIR__ . '/lib/routes/legal.php';
} elseif (str_starts_with($path, '/admin/users')) {
    require __DIR__ . '/lib/routes/users.php';
} elseif (str_starts_with($path, '/admin/emails')) {
    require __DIR__ . '/lib/routes/emails.php';
} elseif (str_starts_with($path, '/admin/pricing')) {
    require __DIR__ . '/lib/routes/pricing.php';
} elseif (str_starts_with($path, '/admin')) {
    require __DIR__ . '/lib/routes/admin.php';
}
if ($path === '/legal' || str_starts_with($path, '/legal/')) {
    require __DIR__ . '/lib/routes/legal.php';
}
if (str_starts_with($path, '/webhooks/')) {
    require __DIR__ . '/lib/routes/webhooks.php';
}
if ($method === 'GET' && $path === '/plans') {
    // Planos ativos com o preço já considerando promoções automáticas vigentes (alimenta a landing e a assinatura).
    $out = [];
    foreach (DB::all($pdo, 'SELECT * FROM plans WHERE active = 1 ORDER BY sort, id') as $pl) {
        $q = \TFS\Pricing::quote($pdo, $pl, null, null);
        $out[] = \TFS\Pricing::planView($pl) + ['final_cents' => $q['total_cents'], 'discount_cents' => $q['discount_cents'], 'discount_pct' => $q['discount_pct'], 'promo_label' => $q['promo']['label'] ?? ($q['promo']['name'] ?? null)];
    }
    Http::json(['plans' => $out]);
}
if ($method === 'POST' && $path === '/plans/quote') {
    $b = Http::body();
    if (!Rate::hit($pdo, "quote:$ip", 60, 600)) {
        Http::fail(429, 'rate_limited');
    }
    $pl = ctype_digit((string) ($b['plan_id'] ?? '')) ? DB::one($pdo, 'SELECT * FROM plans WHERE id = ? AND active = 1', [(int) $b['plan_id']]) : \TFS\Pricing::defaultPlan($pdo);
    if (!$pl) {
        Http::fail(404, 'plan_not_found');
    }
    $me = Auth::user($pdo, $cfg);
    Http::json(\TFS\Pricing::quote($pdo, $pl, is_string($b['code'] ?? null) ? $b['code'] : null, $me ? (int) $me['id'] : null));
}
if ($method === 'GET' && $path === '/gateways/checkout-config') {
    // Somente dados PÚBLICOS necessários para montar o checkout transparente (nunca segredos).
    Http::json(['gateways' => array_map(static fn($g) => [
        'id' => (int) $g['id'], 'provider' => $g['provider'], 'label' => $g['label'], 'mode' => $g['mode'], 'default' => (bool) $g['is_default'],
        'methods' => array_values(array_filter(explode(',', (string) $g['methods']))), 'public_key' => $g['public_key'],
        'checkout' => \TFS\Gateways::CATALOG[$g['provider']]['checkout'] ?? '',
    ], \TFS\Gateways::active($pdo))]);
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
        if (($c['terms'] ?? false) !== true || ($c['health'] ?? false) !== true || ($c['adult'] ?? false) !== true) {   // 18+ declarado (LGPD art. 14)
            Http::fail(422, 'consent_required');
        }
        $birthIn = (string) ($b['birth'] ?? '');
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $birthIn, $bm) && checkdate((int) $bm[2], (int) $bm[3], (int) $bm[1])) {
            $diff = (new \DateTimeImmutable($birthIn))->diff(new \DateTimeImmutable('today'));
            if ($diff->invert || $diff->y < 18) {
                Http::fail(422, 'underage');   // menores de 18 anos não criam conta (LGPD art. 14)
            }
        } elseif ($birthIn !== '') {
            Http::fail(422, 'invalid_input');
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
            foreach (['terms' => true, 'health' => true, 'adult' => true, 'marketing' => ($c['marketing'] ?? false) === true] as $type => $granted) {
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
        $user = DB::one($pdo, 'SELECT * FROM users WHERE id = ?', [$uid]);
        Mailer::sendVerification($pdo, $cfg, $user, $locale);   // link para o aluno abrir e confirmar o e-mail

        Http::json(State::forUser($pdo, $cfg, $user), 201);

    case 'POST /auth/verify-email':
        $b = Http::body();
        $token = (string) ($b['token'] ?? '');
        if (!Rate::hit($pdo, "verify:$ip", 20, 3600)) {
            Http::fail(429, 'rate_limited');
        }
        $row = preg_match('/^[a-f0-9]{64}$/', $token)
            ? DB::one($pdo, 'SELECT id, user_id FROM email_verifications WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', [hash('sha256', $token), DB::now()])
            : null;
        if (!$row) {
            Http::fail(400, 'invalid_token');
        }
        DB::run($pdo, 'UPDATE email_verifications SET used_at = ? WHERE id = ?', [DB::now(), $row['id']]);
        DB::run($pdo, 'UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', [DB::now(), $row['user_id']]);
        Audit::log($pdo, $cfg, (int) $row['user_id'], 'email_verified');
        Http::json(['ok' => true]);

    case 'POST /auth/resend-verification':
        $user = requireUser($pdo, $cfg);
        if (Mailer::isVerified($pdo, $user)) {
            Http::json(['ok' => true, 'verified' => true]);
        }
        if (!Rate::hit($pdo, 'resendv:' . $user['id'], 3, 3600)) {
            Http::fail(429, 'rate_limited');
        }
        Mailer::sendVerification($pdo, $cfg, $user, in_array($user['locale'], ['pt', 'en', 'es'], true) ? (string) $user['locale'] : 'pt');
        Audit::log($pdo, $cfg, (int) $user['id'], 'email_verification_sent');
        Http::json(['ok' => true]);

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
        // menores de 18 anos não podem ter anamnese (LGPD art. 14): confere a idade informada e a data de nascimento
        $birth = (string) ($answers['birth'] ?? '');
        $ageGiven = is_numeric($answers['age'] ?? null) ? (int) $answers['age'] : null;
        $ageBirth = null;
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $birth, $bm) && checkdate((int) $bm[2], (int) $bm[3], (int) $bm[1])) {
            $diff = (new \DateTimeImmutable($birth))->diff(new \DateTimeImmutable('today'));
            $ageBirth = $diff->invert ? 0 : (int) $diff->y;   // data futura conta como menor
        }
        if (($ageGiven !== null && $ageGiven < 18) || ($ageBirth !== null && $ageBirth < 18)) {
            Http::fail(422, 'underage');
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
        if (!Mailer::isVerified($pdo, $user)) {
            Http::fail(403, 'email_not_verified');
        }
        if (!DB::one($pdo, "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'", [$user['id']])) {
            $b = Http::body();
            $pl = ctype_digit((string) ($b['plan_id'] ?? '')) ? DB::one($pdo, 'SELECT * FROM plans WHERE id = ? AND active = 1', [(int) $b['plan_id']]) : \TFS\Pricing::defaultPlan($pdo);
            if (!$pl) {
                Http::fail(404, 'plan_not_found');
            }
            $q = \TFS\Pricing::quote($pdo, $pl, is_string($b['code'] ?? null) ? $b['code'] : null, (int) $user['id']);
            if (is_string($b['code'] ?? null) && trim($b['code']) !== '' && $q['code'] === null) {
                Http::fail(422, (string) ($q['code_error'] ?? 'code_invalid'));   // código informado mas não aplicável: não cobra sem avisar
            }
            $pdo->beginTransaction();
            try {
                if ($q['code']) {
                    // consome o código com checagem atômica do limite de usos
                    $n = DB::run($pdo, 'UPDATE promo_codes SET uses = uses + 1 WHERE id = ? AND (max_uses IS NULL OR uses < max_uses)', [$q['code']['id']]);
                    if ($n === 0) {
                        throw new \RuntimeException('code_exhausted');
                    }
                    DB::run($pdo, 'INSERT INTO promo_redemptions (code_id, user_id, plan_id, discount_cents, created_at) VALUES (?, ?, ?, ?, ?)',
                        [$q['code']['id'], $user['id'], $pl['id'], $q['code']['discount_cents'], DB::now()]);
                }
                Billing::recordPayment($pdo, (int) $user['id'], (int) $q['total_cents'], 'card', 'test');
                DB::run($pdo, "UPDATE subscriptions SET plan = ? WHERE user_id = ? AND status = 'active'", [$pl['slug'], $user['id']]);
                $pdo->commit();
            } catch (\Throwable $e) {
                $pdo->rollBack();
                if ($e->getMessage() === 'code_exhausted' || str_contains($e->getMessage(), 'UNIQUE') || str_contains($e->getMessage(), 'Duplicate')) {
                    Http::fail(422, 'code_exhausted');
                }
                throw $e;
            }
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
