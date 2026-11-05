<?php
declare(strict_types=1);

/**
 * Rotas /admin/* — somente papel "admin". Incluído por index.php (variáveis $pdo, $cfg, $method, $path no escopo).
 */

use TFS\Analytics;
use TFS\Audit;
use TFS\Auth;
use TFS\Billing;
use TFS\Crypto;
use TFS\Demo;
use TFS\DB;
use TFS\Http;
use TFS\Mailer;
use TFS\Migrator;
use TFS\Seed;
use TFS\Settings;
use TFS\Util;

$admin = requireRole($pdo, $cfg, ['admin']);
$aid = (int) $admin['id'];
$route = "$method $path";
$m = [];

/* ---------------- Visão geral e analytics ---------------- */
if ($route === 'GET /admin/overview') {
    Http::json(Analytics::overview($pdo, max(7, min(365, (int) ($_GET['range'] ?? 90))), (string) ($_GET['demo'] ?? 'all')));
}
if ($route === 'GET /admin/billing/summary') {
    Http::json(Analytics::billing($pdo, (string) ($_GET['demo'] ?? 'all')));
}

/* ---------------- Alunos ---------------- */
if ($route === 'GET /admin/students') {
    [$page, $size, $off] = Util::page();
    $where = " WHERE u.role = 'student'" . Util::demoSql('u.is_demo');
    $p = [];
    if (($q = trim((string) ($_GET['q'] ?? ''))) !== '') {
        $where .= ' AND (u.name LIKE ? OR u.email LIKE ?)';
        $p[] = Util::like($q);
        $p[] = Util::like($q);
    }
    if (in_array($_GET['status'] ?? '', ['active', 'suspended'], true)) {
        $where .= ' AND u.status = ?';
        $p[] = $_GET['status'];
    }
    if (in_array($_GET['sub'] ?? '', ['active', 'free'], true)) {
        $where .= ' AND s.sub_status = ?';
        $p[] = $_GET['sub'];
    }
    if (ctype_digit((string) ($_GET['phase'] ?? ''))) {
        $where .= ' AND s.phase = ?';
        $p[] = (int) $_GET['phase'];
    }
    if (ctype_digit((string) ($_GET['teacher'] ?? ''))) {
        $where .= ' AND u.teacher_id = ?';
        $p[] = (int) $_GET['teacher'];
    }
    if (($_GET['risk'] ?? '') === '1') {
        $where .= " AND s.sub_status = 'active' AND (s.last_day IS NULL OR s.last_day < ?)";
        $p[] = gmdate('Y-m-d', time() - 7 * 86400);
    }
    $sorts = ['name' => 'u.name', 'created' => 'u.created_at', 'xp' => 's.xp', 'streak' => 's.streak', 'activity' => 's.last_day', 'phase' => 's.phase', 'lessons' => 'lessons'];
    $order = $sorts[$_GET['sort'] ?? 'created'] ?? 'u.created_at';
    $dir = ($_GET['dir'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';
    $from = ' FROM users u LEFT JOIN user_stats s ON s.user_id = u.id';
    $total = (int) DB::one($pdo, "SELECT COUNT(*) AS n $from $where", $p)['n'];
    $rows = DB::all($pdo, "SELECT u.id, u.name, u.email, u.status, u.created_at, u.last_login_at, u.teacher_id, u.is_demo,
            s.phase, s.xp, s.streak, s.sub_status, s.last_day,
            (SELECT t.name FROM users t WHERE t.id = u.teacher_id) AS teacher_name,
            (SELECT COUNT(*) FROM lesson_logs l WHERE l.user_id = u.id) AS lessons
        $from $where ORDER BY $order $dir, u.id DESC LIMIT $size OFFSET $off", $p);
    Http::json(['total' => $total, 'page' => $page, 'size' => $size, 'rows' => $rows]);
}

if (preg_match('#^/admin/students/(\d+)$#', $path, $m)) {
    $sid = (int) $m[1];
    $st = DB::one($pdo, "SELECT * FROM users WHERE id = ? AND role = 'student'", [$sid]);
    if (!$st) {
        Http::fail(404, 'not_found');
    }
    if ($method === 'GET') {
        unset($st['password_hash']);
        Http::json([
            'user' => $st,
            'stats' => DB::one($pdo, 'SELECT * FROM user_stats WHERE user_id = ?', [$sid]),
            'teacher' => $st['teacher_id'] ? DB::one($pdo, 'SELECT id, name, email FROM users WHERE id = ?', [$st['teacher_id']]) : null,
            'subscriptions' => DB::all($pdo, 'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 10', [$sid]),
            'payments' => DB::all($pdo, 'SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 20', [$sid]),
            'logs' => DB::all($pdo, 'SELECT lesson_id, day, sec, rpe, xp FROM lesson_logs WHERE user_id = ? ORDER BY id DESC LIMIT 40', [$sid]),
            'appointments' => DB::all($pdo, 'SELECT * FROM appointments WHERE user_id = ? ORDER BY starts_at DESC LIMIT 10', [$sid]),
            'notes' => DB::all($pdo, 'SELECT n.id, n.note, n.created_at, a.name AS author FROM student_notes n LEFT JOIN users a ON a.id = n.author_id WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 30', [$sid]),
            'consents' => DB::all($pdo, 'SELECT type, granted, version, created_at FROM consents WHERE user_id = ? ORDER BY id', [$sid]),
            'hasAnamnese' => DB::one($pdo, 'SELECT 1 AS x FROM anamneses WHERE user_id = ?', [$sid]) !== null,
        ]);
    }
    if ($method === 'PATCH') {
        $b = Http::body();
        $now = DB::now();
        if (isset($b['status'])) {
            if (!in_array($b['status'], ['active', 'suspended'], true)) {
                Http::fail(422, 'invalid_input');
            }
            DB::run($pdo, 'UPDATE users SET status = ? WHERE id = ?', [$b['status'], $sid]);
            if ($b['status'] === 'suspended') {
                DB::run($pdo, 'DELETE FROM sessions WHERE user_id = ?', [$sid]);
            }
            Audit::log($pdo, $cfg, $aid, 'admin_student_status', "$sid:" . $b['status']);
        }
        if (isset($b['phase'])) {
            if (!is_int($b['phase']) || $b['phase'] < 1 || $b['phase'] > 9) {
                Http::fail(422, 'invalid_input');
            }
            DB::run($pdo, 'UPDATE user_stats SET phase = ?, updated_at = ? WHERE user_id = ?', [$b['phase'], $now, $sid]);
            Audit::log($pdo, $cfg, $aid, 'admin_student_phase', "$sid:" . $b['phase']);
        }
        if (array_key_exists('teacher_id', $b)) {
            $tid = $b['teacher_id'];
            if ($tid !== null && !(is_int($tid) && DB::one($pdo, "SELECT id FROM users WHERE id = ? AND role = 'teacher'", [$tid]))) {
                Http::fail(422, 'invalid_input');
            }
            DB::run($pdo, 'UPDATE users SET teacher_id = ? WHERE id = ?', [$tid, $sid]);
            Audit::log($pdo, $cfg, $aid, 'admin_student_teacher', "$sid:" . ($tid ?? 'none'));
        }
        if (isset($b['sub'])) {
            if ($b['sub'] === 'active') {
                if (!DB::one($pdo, "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'", [$sid])) {
                    DB::run($pdo, "INSERT INTO subscriptions (user_id, plan, status, price_cents, started_at, provider) VALUES (?, 'monthly', 'active', 0, ?, 'admin_grant')", [$sid, $now]);
                }
                DB::run($pdo, "UPDATE user_stats SET sub_status = 'active', updated_at = ? WHERE user_id = ?", [$now, $sid]);
            } elseif ($b['sub'] === 'free') {
                DB::run($pdo, "UPDATE subscriptions SET status = 'canceled', canceled_at = ? WHERE user_id = ? AND status = 'active'", [$now, $sid]);
                DB::run($pdo, "UPDATE user_stats SET sub_status = 'free', updated_at = ? WHERE user_id = ?", [$now, $sid]);
            } else {
                Http::fail(422, 'invalid_input');
            }
            Audit::log($pdo, $cfg, $aid, 'admin_student_sub', "$sid:" . $b['sub']);
        }
        Http::json(['ok' => true]);
    }
    if ($method === 'DELETE') {
        // Direito ao apagamento (LGPD) exercido pela administração a pedido do titular.
        $b = Http::body();
        if (($b['confirm'] ?? false) !== true) {
            Http::fail(422, 'confirm_required');
        }
        $pdo->beginTransaction();
        try {
            DB::run($pdo, 'UPDATE audit_log SET user_id = NULL WHERE user_id = ?', [$sid]);
            DB::run($pdo, 'DELETE FROM users WHERE id = ?', [$sid]);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log($pdo, $cfg, $aid, 'admin_student_deleted', (string) $sid);
        Http::json(['ok' => true]);
    }
}
if ($method === 'POST' && preg_match('#^/admin/students/(\d+)/note$#', $path, $m)) {
    $b = Http::body();
    $note = trim((string) ($b['note'] ?? ''));
    if ($note === '' || mb_strlen($note) > 1000 || !DB::one($pdo, "SELECT id FROM users WHERE id = ? AND role = 'student'", [$m[1]])) {
        Http::fail(422, 'invalid_input');
    }
    DB::run($pdo, 'INSERT INTO student_notes (user_id, author_id, note, created_at) VALUES (?, ?, ?, ?)', [$m[1], $aid, $note, DB::now()]);
    Http::json(['ok' => true], 201);
}
if ($method === 'POST' && preg_match('#^/admin/students/(\d+)/anamnese$#', $path, $m)) {
    // Dado de saúde (sensível): leitura explícita e SEMPRE auditada.
    $row = DB::one($pdo, 'SELECT data_enc FROM anamneses WHERE user_id = ?', [$m[1]]);
    Audit::log($pdo, $cfg, $aid, 'admin_view_anamnese', (string) $m[1]);
    $plain = $row ? Crypto::dec((string) $row['data_enc'], $cfg) : null;
    Http::json(['anamnese' => $plain ? json_decode($plain, true) : null]);
}

/* ---------------- Professores ---------------- */
if ($route === 'GET /admin/teachers') {
    $rows = DB::all($pdo, "SELECT u.id, u.name, u.email, u.status AS user_status, u.created_at, u.last_login_at, u.is_demo,
            p.code, p.cref, p.status, p.tier_percent,
            (SELECT COUNT(*) FROM users s WHERE s.teacher_id = u.id) AS students,
            (SELECT COUNT(*) FROM users s JOIN user_stats x ON x.user_id = s.id WHERE s.teacher_id = u.id AND x.sub_status = 'active') AS active_students,
            (SELECT COALESCE(SUM(c.amount_cents), 0) FROM commissions c WHERE c.teacher_id = u.id AND c.status = 'pending') AS c_pending,
            (SELECT COALESCE(SUM(c.amount_cents), 0) FROM commissions c WHERE c.teacher_id = u.id AND c.status = 'approved') AS c_approved,
            (SELECT COALESCE(SUM(c.amount_cents), 0) FROM commissions c WHERE c.teacher_id = u.id AND c.status = 'paid') AS c_paid
        FROM users u LEFT JOIN teacher_profiles p ON p.user_id = u.id WHERE u.role = 'teacher'" . Util::demoSql('u.is_demo') . ' ORDER BY active_students DESC, u.name');
    foreach ($rows as &$r) {
        $r['percent'] = $r['code'] ? Billing::percentFor($pdo, (int) $r['id']) : 0;
    }
    Http::json(['rows' => $rows]);
}
if ($route === 'POST /admin/teachers') {
    $b = Http::body();
    $name = trim((string) ($b['name'] ?? ''));
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        Http::fail(422, 'invalid_input');
    }
    if (DB::one($pdo, 'SELECT id FROM users WHERE email = ?', [$email])) {
        Http::fail(409, 'email_taken');
    }
    $tier = $b['tier_percent'] ?? null;
    if ($tier !== null && (!is_int($tier) || $tier < 0 || $tier > 60)) {
        Http::fail(422, 'invalid_input');
    }
    $temp = Seed::password();
    $now = DB::now();
    $pdo->beginTransaction();
    try {
        DB::run($pdo, "INSERT INTO users (email, password_hash, name, role, locale, created_at) VALUES (?, ?, ?, 'teacher', 'pt', ?)", [$email, Auth::hash($temp), $name, $now]);
        $tid = (int) $pdo->lastInsertId();
        do {
            $code = Util::slugCode($name) . random_int(100, 999);
        } while (DB::one($pdo, 'SELECT user_id FROM teacher_profiles WHERE code = ?', [$code]));
        DB::run($pdo, "INSERT INTO teacher_profiles (user_id, code, cref, bio, status, tier_percent, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
            [$tid, $code, mb_substr((string) ($b['cref'] ?? ''), 0, 30) ?: null, mb_substr((string) ($b['bio'] ?? ''), 0, 400) ?: null, $tier, $now]);
        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    Audit::log($pdo, $cfg, $aid, 'admin_teacher_created', (string) $tid);
    Http::json(['id' => $tid, 'code' => $code, 'tempPassword' => $temp], 201);
}
if (preg_match('#^/admin/teachers/(\d+)$#', $path, $m)) {
    $tid = (int) $m[1];
    $t = DB::one($pdo, "SELECT u.id, u.name, u.email, u.created_at, u.last_login_at, p.* FROM users u LEFT JOIN teacher_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.role = 'teacher'", [$tid]);
    if (!$t) {
        Http::fail(404, 'not_found');
    }
    if ($method === 'GET') {
        Http::json([
            'teacher' => $t,
            'percent' => Billing::percentFor($pdo, $tid),
            'students' => DB::all($pdo, "SELECT u.id, u.name, u.created_at, s.phase, s.xp, s.streak, s.sub_status, s.last_day FROM users u LEFT JOIN user_stats s ON s.user_id = u.id WHERE u.teacher_id = ? ORDER BY u.created_at DESC LIMIT 200", [$tid]),
            'commissions' => DB::all($pdo, 'SELECT c.*, u.name AS student FROM commissions c JOIN users u ON u.id = c.user_id WHERE c.teacher_id = ? ORDER BY c.id DESC LIMIT 100', [$tid]),
            'payouts' => DB::all($pdo, 'SELECT * FROM payouts WHERE teacher_id = ? ORDER BY id DESC LIMIT 30', [$tid]),
        ]);
    }
    if ($method === 'PATCH') {
        $b = Http::body();
        if (isset($b['status'])) {
            if (!in_array($b['status'], ['active', 'pending', 'suspended'], true)) {
                Http::fail(422, 'invalid_input');
            }
            DB::run($pdo, 'UPDATE teacher_profiles SET status = ? WHERE user_id = ?', [$b['status'], $tid]);
        }
        if (array_key_exists('tier_percent', $b)) {
            $v = $b['tier_percent'];
            if ($v !== null && (!is_int($v) || $v < 0 || $v > 60)) {
                Http::fail(422, 'invalid_input');
            }
            DB::run($pdo, 'UPDATE teacher_profiles SET tier_percent = ? WHERE user_id = ?', [$v, $tid]);
        }
        foreach (['cref' => 30, 'bio' => 400] as $f => $max) {
            if (isset($b[$f])) {
                DB::run($pdo, "UPDATE teacher_profiles SET $f = ? WHERE user_id = ?", [mb_substr((string) $b[$f], 0, $max), $tid]);
            }
        }
        if (isset($b['name']) && mb_strlen(trim((string) $b['name'])) >= 2) {
            DB::run($pdo, 'UPDATE users SET name = ? WHERE id = ?', [mb_substr(trim((string) $b['name']), 0, 120), $tid]);
        }
        Audit::log($pdo, $cfg, $aid, 'admin_teacher_update', (string) $tid);
        Http::json(['ok' => true]);
    }
}

/* ---------------- Método: exercícios e grade de aulas ---------------- */
$validateExercise = static function (array $b): array {
    $slug = (string) ($b['slug'] ?? '');
    $motion = (string) ($b['motion'] ?? '');
    $depth = (float) ($b['depth'] ?? 1);
    $i18n = is_array($b['i18n'] ?? null) ? $b['i18n'] : [];
    if (!preg_match('/^[a-zA-Z][a-zA-Z0-9]{1,38}$/', $slug) || !in_array($motion, ['squat', 'hinge', 'press', 'raise'], true) || $depth < 0.2 || $depth > 1) {
        Http::fail(422, 'invalid_input');
    }
    $clean = [];
    foreach (['pt', 'en', 'es'] as $lang) {
        $d = is_array($i18n[$lang] ?? null) ? $i18n[$lang] : [];
        $clean[$lang] = [
            'name' => mb_substr(trim((string) ($d['name'] ?? '')), 0, 80),
            'bio' => mb_substr(trim((string) ($d['bio'] ?? '')), 0, 600),
            'cues' => array_slice(array_map(static fn($c) => mb_substr(trim((string) $c), 0, 160), is_array($d['cues'] ?? null) ? $d['cues'] : []), 0, 6),
        ];
    }
    if ($clean['pt']['name'] === '') {
        Http::fail(422, 'name_required');
    }
    $url = trim((string) ($b['video_url'] ?? ''));
    if ($url !== '' && !preg_match('#^https://#i', $url)) {
        Http::fail(422, 'invalid_input');
    }
    return [
        'slug' => $slug, 'motion' => $motion, 'depth' => $depth,
        'primary' => implode(',', Util::muscles($b['primary'] ?? [])),
        'secondary' => implode(',', Util::muscles($b['secondary'] ?? [])),
        'stabilizers' => implode(',', Util::muscles($b['stabilizers'] ?? [])),
        'video_url' => $url !== '' ? mb_substr($url, 0, 300) : null,
        'i18n' => json_encode($clean, JSON_UNESCAPED_UNICODE),
        'active' => ($b['active'] ?? true) === false ? 0 : 1,
    ];
};

if ($route === 'GET /admin/exercises') {
    Http::json(['rows' => DB::all($pdo, 'SELECT e.*, (SELECT COUNT(*) FROM lesson_exercises le WHERE le.exercise_id = e.id) AS used FROM exercises e ORDER BY e.id')]);
}
if ($route === 'POST /admin/exercises') {
    $v = $validateExercise(Http::body());
    if (DB::one($pdo, 'SELECT id FROM exercises WHERE slug = ?', [$v['slug']])) {
        Http::fail(409, 'slug_taken');
    }
    $now = DB::now();
    DB::run($pdo, 'INSERT INTO exercises (slug, motion, depth, primary_m, secondary_m, stabilizers_m, video_url, i18n, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$v['slug'], $v['motion'], $v['depth'], $v['primary'], $v['secondary'], $v['stabilizers'], $v['video_url'], $v['i18n'], $v['active'], $now, $now]);
    $newId = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $aid, 'admin_exercise_created', $v['slug']);
    Http::json(['id' => $newId], 201);
}
if (preg_match('#^/admin/exercises/(\d+)$#', $path, $m)) {
    $ex = DB::one($pdo, 'SELECT * FROM exercises WHERE id = ?', [$m[1]]);
    if (!$ex) {
        Http::fail(404, 'not_found');
    }
    if ($method === 'PUT') {
        $v = $validateExercise(Http::body());
        if (DB::one($pdo, 'SELECT id FROM exercises WHERE slug = ? AND id <> ?', [$v['slug'], $m[1]])) {
            Http::fail(409, 'slug_taken');
        }
        DB::run($pdo, 'UPDATE exercises SET slug = ?, motion = ?, depth = ?, primary_m = ?, secondary_m = ?, stabilizers_m = ?, video_url = ?, i18n = ?, active = ?, updated_at = ? WHERE id = ?',
            [$v['slug'], $v['motion'], $v['depth'], $v['primary'], $v['secondary'], $v['stabilizers'], $v['video_url'], $v['i18n'], $v['active'], DB::now(), $m[1]]);
        Audit::log($pdo, $cfg, $aid, 'admin_exercise_updated', $v['slug']);
        Http::json(['ok' => true]);
    }
    if ($method === 'DELETE') {
        if ((int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM lesson_exercises WHERE exercise_id = ?', [$m[1]])['n'] > 0) {
            Http::fail(409, 'in_use');
        }
        DB::run($pdo, 'DELETE FROM exercises WHERE id = ?', [$m[1]]);
        Audit::log($pdo, $cfg, $aid, 'admin_exercise_deleted', (string) $ex['slug']);
        Http::json(['ok' => true]);
    }
}

if ($route === 'GET /admin/method') {
    $lessons = DB::all($pdo, 'SELECT * FROM lessons ORDER BY phase, n');
    $map = [];
    foreach (DB::all($pdo, 'SELECT le.lesson_id, le.pos, le.exercise_id, e.slug FROM lesson_exercises le JOIN exercises e ON e.id = le.exercise_id ORDER BY le.lesson_id, le.pos') as $r) {
        $map[$r['lesson_id']][] = ['id' => (int) $r['exercise_id'], 'slug' => $r['slug']];
    }
    foreach ($lessons as &$l) {
        $l['exercises'] = $map[$l['id']] ?? [];
    }
    // uso real: quantos alunos concluíram cada aula
    $done = [];
    foreach (DB::all($pdo, 'SELECT lesson_id, COUNT(*) AS n, AVG(rpe) AS rpe, AVG(sec) AS sec FROM lesson_logs GROUP BY lesson_id') as $r) {
        $done[$r['lesson_id']] = ['n' => (int) $r['n'], 'rpe' => round((float) $r['rpe'], 1), 'sec' => (int) $r['sec']];
    }
    Http::json(['lessons' => $lessons, 'usage' => $done, 'exerciseCount' => (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM exercises')['n']]);
}
if (preg_match('#^/admin/lessons/(\d+)$#', $path, $m) && $method === 'PUT') {
    $l = DB::one($pdo, 'SELECT * FROM lessons WHERE id = ?', [$m[1]]);
    if (!$l) {
        Http::fail(404, 'not_found');
    }
    $b = Http::body();
    $work = (int) ($b['work_sec'] ?? 0);
    $rest = (int) ($b['rest_sec'] ?? 0);
    $rounds = (int) ($b['rounds'] ?? 0);
    $ids = array_values(array_filter(is_array($b['exercises'] ?? null) ? $b['exercises'] : [], 'is_int'));
    if ($work < 10 || $work > 180 || $rest < 5 || $rest > 180 || $rounds < 1 || $rounds > 6 || count($ids) < 1 || count($ids) > 12) {
        Http::fail(422, 'invalid_input');
    }
    foreach ($ids as $eid) {
        if (!DB::one($pdo, 'SELECT id FROM exercises WHERE id = ?', [$eid])) {
            Http::fail(422, 'invalid_exercise');
        }
    }
    $pdo->beginTransaction();
    try {
        DB::run($pdo, 'UPDATE lessons SET work_sec = ?, rest_sec = ?, rounds = ?, active = ? WHERE id = ?', [$work, $rest, $rounds, ($b['active'] ?? true) === false ? 0 : 1, $m[1]]);
        DB::run($pdo, 'DELETE FROM lesson_exercises WHERE lesson_id = ?', [$m[1]]);
        foreach ($ids as $pos => $eid) {
            DB::run($pdo, 'INSERT INTO lesson_exercises (lesson_id, pos, exercise_id) VALUES (?, ?, ?)', [$m[1], $pos, $eid]);
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    Audit::log($pdo, $cfg, $aid, 'admin_lesson_updated', 'f' . $l['phase'] . '-' . $l['n']);
    Http::json(['ok' => true]);
}
if ($route === 'POST /admin/method/import-default') {
    $catalog = require __DIR__ . '/../default_catalog.php';
    $now = DB::now();
    $added = 0;
    $pdo->beginTransaction();
    try {
        foreach ($catalog as $e) {
            if (DB::one($pdo, 'SELECT id FROM exercises WHERE slug = ?', [$e['slug']])) {
                continue;
            }
            DB::run($pdo, 'INSERT INTO exercises (slug, motion, depth, primary_m, secondary_m, stabilizers_m, i18n, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$e['slug'], $e['motion'], $e['depth'], implode(',', $e['primary']), implode(',', $e['secondary']), implode(',', $e['stabilizers']),
                    json_encode($e['i18n'], JSON_UNESCAPED_UNICODE), $now, $now]);
            $added++;
        }
        $ids = [];
        foreach (DB::all($pdo, 'SELECT id, slug FROM exercises') as $r) {
            $ids[$r['slug']] = (int) $r['id'];
        }
        $focus = ['legs', 'upper', 'posterior', 'full', 'balance'];
        $seq = [
            'legs' => ['squat', 'halfSquat', 'hinge', 'squat', 'halfSquat'],
            'upper' => ['press', 'frontRaise', 'press', 'frontRaise', 'hinge'],
            'posterior' => ['hinge', 'squat', 'hinge', 'frontRaise', 'halfSquat'],
            'full' => ['squat', 'press', 'hinge', 'frontRaise', 'squat'],
            'balance' => ['halfSquat', 'frontRaise', 'hinge', 'press', 'halfSquat'],
        ];
        $timing = [[30, 30, 2], [40, 25, 2], [45, 20, 3]];
        $lessonsAdded = 0;
        for ($phase = 1; $phase <= 9; $phase++) {
            [$work, $rest, $rounds] = $timing[($phase - 1) % 3];
            for ($n = 1; $n <= 6; $n++) {
                if (DB::one($pdo, 'SELECT id FROM lessons WHERE phase = ? AND n = ?', [$phase, $n])) {
                    continue;
                }
                $f = $focus[($n - 1) % 5];
                DB::run($pdo, 'INSERT INTO lessons (phase, n, focus, work_sec, rest_sec, rounds, active) VALUES (?, ?, ?, ?, ?, ?, 1)', [$phase, $n, $f, $work, $rest, $rounds]);
                $lid = (int) $pdo->lastInsertId();
                foreach ($seq[$f] as $pos => $slug) {
                    if ((($phase - 1) % 3) === 0 && $slug === 'squat') {
                        $slug = 'halfSquat';
                    }
                    DB::run($pdo, 'INSERT INTO lesson_exercises (lesson_id, pos, exercise_id) VALUES (?, ?, ?)', [$lid, $pos, $ids[$slug]]);
                }
                $lessonsAdded++;
            }
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    Audit::log($pdo, $cfg, $aid, 'admin_import_default_method', "ex:$added lessons:$lessonsAdded");
    Http::json(['exercises' => $added, 'lessons' => $lessonsAdded]);
}

/* ---------------- Pagamentos, assinaturas, comissões ---------------- */
if ($route === 'GET /admin/payments') {
    [$page, $size, $off] = Util::page();
    $where = ' WHERE 1=1' . Util::demoSql('p.is_demo');
    $p = [];
    if (in_array($_GET['status'] ?? '', ['paid', 'refunded', 'failed', 'pending'], true)) {
        $where .= ' AND p.status = ?';
        $p[] = $_GET['status'];
    }
    if (in_array($_GET['method'] ?? '', ['card', 'pix'], true)) {
        $where .= ' AND p.method = ?';
        $p[] = $_GET['method'];
    }
    if (($q = trim((string) ($_GET['q'] ?? ''))) !== '') {
        $where .= ' AND (u.name LIKE ? OR u.email LIKE ?)';
        $p[] = Util::like($q);
        $p[] = Util::like($q);
    }
    $from = ' FROM payments p JOIN users u ON u.id = p.user_id';
    $total = (int) DB::one($pdo, "SELECT COUNT(*) AS n $from $where", $p)['n'];
    $rows = DB::all($pdo, "SELECT p.id, p.user_id, p.amount_cents, p.status, p.method, p.paid_at, p.created_at, p.provider_ref, p.is_demo, u.name, u.email $from $where ORDER BY p.id DESC LIMIT $size OFFSET $off", $p);
    Http::json(['total' => $total, 'page' => $page, 'size' => $size, 'rows' => $rows]);
}
if ($method === 'POST' && preg_match('#^/admin/payments/(\d+)/refund$#', $path, $m)) {
    $pay = DB::one($pdo, 'SELECT * FROM payments WHERE id = ?', [$m[1]]);
    if (!$pay) {
        Http::fail(404, 'not_found');
    }
    if ($pay['status'] !== 'paid') {
        Http::fail(409, 'not_refundable');
    }
    DB::run($pdo, "UPDATE payments SET status = 'refunded' WHERE id = ?", [$m[1]]);
    DB::run($pdo, "UPDATE commissions SET status = 'void' WHERE payment_id = ? AND status IN ('pending','approved')", [$m[1]]);
    Audit::log($pdo, $cfg, $aid, 'admin_refund', (string) $m[1]);
    Http::json(['ok' => true]);
}
if ($route === 'GET /admin/subscriptions') {
    [$page, $size, $off] = Util::page();
    $where = ' WHERE 1=1' . Util::demoSql('s.is_demo');
    $p = [];
    if (in_array($_GET['status'] ?? '', ['active', 'canceled', 'past_due'], true)) {
        $where .= ' AND s.status = ?';
        $p[] = $_GET['status'];
    }
    $from = ' FROM subscriptions s JOIN users u ON u.id = s.user_id';
    $total = (int) DB::one($pdo, "SELECT COUNT(*) AS n $from $where", $p)['n'];
    $rows = DB::all($pdo, "SELECT s.id, s.user_id, s.plan, s.status, s.price_cents, s.started_at, s.canceled_at, s.provider, s.is_demo, u.name, u.email $from $where ORDER BY s.id DESC LIMIT $size OFFSET $off", $p);
    Http::json(['total' => $total, 'page' => $page, 'size' => $size, 'rows' => $rows]);
}
if ($method === 'POST' && preg_match('#^/admin/subscriptions/(\d+)/cancel$#', $path, $m)) {
    $sub = DB::one($pdo, 'SELECT * FROM subscriptions WHERE id = ?', [$m[1]]);
    if (!$sub || $sub['status'] !== 'active') {
        Http::fail(409, 'not_cancelable');
    }
    $now = DB::now();
    DB::run($pdo, "UPDATE subscriptions SET status = 'canceled', canceled_at = ? WHERE id = ?", [$now, $m[1]]);
    if (!DB::one($pdo, "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'", [$sub['user_id']])) {
        DB::run($pdo, "UPDATE user_stats SET sub_status = 'free', updated_at = ? WHERE user_id = ?", [$now, $sub['user_id']]);
    }
    Audit::log($pdo, $cfg, $aid, 'admin_sub_cancel', (string) $m[1]);
    Http::json(['ok' => true]);
}
if ($route === 'GET /admin/commissions') {
    [$page, $size, $off] = Util::page();
    $where = ' WHERE 1=1' . Util::demoSql('c.is_demo');
    $p = [];
    if (in_array($_GET['status'] ?? '', ['pending', 'approved', 'paid', 'void'], true)) {
        $where .= ' AND c.status = ?';
        $p[] = $_GET['status'];
    }
    if (ctype_digit((string) ($_GET['teacher'] ?? ''))) {
        $where .= ' AND c.teacher_id = ?';
        $p[] = (int) $_GET['teacher'];
    }
    $from = ' FROM commissions c JOIN users t ON t.id = c.teacher_id JOIN users s ON s.id = c.user_id';
    $total = (int) DB::one($pdo, "SELECT COUNT(*) AS n $from $where", $p)['n'];
    $rows = DB::all($pdo, "SELECT c.id, c.teacher_id, c.user_id, c.amount_cents, c.percent, c.status, c.available_at, c.paid_at, c.created_at, c.is_demo, t.name AS teacher, s.name AS student $from $where ORDER BY c.id DESC LIMIT $size OFFSET $off", $p);
    $sum = DB::all($pdo, 'SELECT c.status, COALESCE(SUM(c.amount_cents), 0) AS cents, COUNT(*) AS n FROM commissions c WHERE 1=1' . Util::demoSql('c.is_demo') . ' GROUP BY c.status');
    Http::json(['total' => $total, 'page' => $page, 'size' => $size, 'rows' => $rows, 'summary' => $sum]);
}
if ($route === 'POST /admin/commissions/approve') {
    $b = Http::body();
    $sql = "UPDATE commissions SET status = 'approved' WHERE status = 'pending' AND available_at <= ?";
    $p = [DB::now()];
    if (isset($b['teacher_id']) && is_int($b['teacher_id'])) {
        $sql .= ' AND teacher_id = ?';
        $p[] = $b['teacher_id'];
    }
    $n = DB::run($pdo, $sql, $p);
    Audit::log($pdo, $cfg, $aid, 'admin_commissions_approve', "n:$n");
    Http::json(['approved' => $n]);
}
if ($route === 'POST /admin/payouts') {
    $b = Http::body();
    $tid = $b['teacher_id'] ?? null;
    if (!is_int($tid) || !DB::one($pdo, "SELECT id FROM users WHERE id = ? AND role = 'teacher'", [$tid])) {
        Http::fail(422, 'invalid_input');
    }
    $sum = (int) DB::one($pdo, "SELECT COALESCE(SUM(amount_cents), 0) AS s FROM commissions WHERE teacher_id = ? AND status = 'approved'", [$tid])['s'];
    if ($sum <= 0) {
        Http::fail(409, 'nothing_to_pay');
    }
    $now = DB::now();
    $pdo->beginTransaction();
    try {
        DB::run($pdo, "INSERT INTO payouts (teacher_id, amount_cents, period, status, paid_at, note, created_at) VALUES (?, ?, ?, 'paid', ?, ?, ?)",
            [$tid, $sum, gmdate('Y-m'), $now, mb_substr((string) ($b['note'] ?? ''), 0, 200) ?: null, $now]);
        $pid = (int) $pdo->lastInsertId();
        DB::run($pdo, "UPDATE commissions SET status = 'paid', paid_at = ?, payout_id = ? WHERE teacher_id = ? AND status = 'approved'", [$now, $pid, $tid]);
        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    Audit::log($pdo, $cfg, $aid, 'admin_payout', "teacher:$tid cents:$sum");
    Http::json(['id' => $pid, 'amount_cents' => $sum], 201);
}
if ($route === 'GET /admin/payouts') {
    Http::json(['rows' => DB::all($pdo, 'SELECT p.*, u.name AS teacher FROM payouts p JOIN users u ON u.id = p.teacher_id WHERE 1=1' . Util::demoSql('p.is_demo') . ' ORDER BY p.id DESC LIMIT 100')]);
}
if (preg_match('#^GET /admin/export/(payments|commissions|students)\.csv$#', $route, $m)) {
    Audit::log($pdo, $cfg, $aid, 'admin_export', $m[1]);
    if ($m[1] === 'payments') {
        $rows = DB::all($pdo, 'SELECT p.id, u.name, u.email, p.amount_cents, p.status, p.method, p.paid_at FROM payments p JOIN users u ON u.id = p.user_id WHERE 1=1' . Util::demoSql('p.is_demo') . ' ORDER BY p.id DESC LIMIT 20000');
        Util::csv('pagamentos.csv', ['id', 'aluno', 'email', 'valor_brl', 'status', 'metodo', 'pago_em'],
            array_map(static fn($r) => [$r['id'], $r['name'], $r['email'], Util::money((int) $r['amount_cents']), $r['status'], $r['method'], $r['paid_at']], $rows));
    }
    if ($m[1] === 'commissions') {
        $rows = DB::all($pdo, 'SELECT c.id, t.name AS teacher, s.name AS student, c.amount_cents, c.percent, c.status, c.available_at, c.paid_at FROM commissions c JOIN users t ON t.id = c.teacher_id JOIN users s ON s.id = c.user_id WHERE 1=1' . Util::demoSql('c.is_demo') . ' ORDER BY c.id DESC LIMIT 20000');
        Util::csv('comissoes.csv', ['id', 'professor', 'aluno', 'valor_brl', 'percentual', 'status', 'disponivel_em', 'pago_em'],
            array_map(static fn($r) => [$r['id'], $r['teacher'], $r['student'], Util::money((int) $r['amount_cents']), $r['percent'], $r['status'], $r['available_at'], $r['paid_at']], $rows));
    }
    $rows = DB::all($pdo, "SELECT u.id, u.name, u.email, u.created_at, s.phase, s.xp, s.streak, s.sub_status, s.last_day FROM users u LEFT JOIN user_stats s ON s.user_id = u.id WHERE u.role = 'student'" . Util::demoSql('u.is_demo') . ' ORDER BY u.id LIMIT 50000');
    Util::csv('alunos.csv', ['id', 'nome', 'email', 'cadastro', 'fase', 'xp', 'streak', 'plano', 'ultima_atividade'],
        array_map(static fn($r) => [$r['id'], $r['name'], $r['email'], $r['created_at'], $r['phase'], $r['xp'], $r['streak'], $r['sub_status'], $r['last_day']], $rows));
}

/* ---------------- Consultas online ---------------- */
if ($route === 'GET /admin/appointments') {
    $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['from'] ?? '')) ? $_GET['from'] : gmdate('Y-m-d', time() - 7 * 86400);
    $to = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['to'] ?? '')) ? $_GET['to'] : gmdate('Y-m-d', time() + 30 * 86400);
    $where = ' WHERE a.starts_at >= ? AND a.starts_at < ?' . Util::demoSql('a.is_demo');
    $p = ["$from 00:00:00", gmdate('Y-m-d', strtotime("$to UTC") + 86400) . ' 00:00:00'];
    if (in_array($_GET['status'] ?? '', ['requested', 'confirmed', 'done', 'canceled', 'no_show'], true)) {
        $where .= ' AND a.status = ?';
        $p[] = $_GET['status'];
    }
    $rows = DB::all($pdo, "SELECT a.*, u.name AS student, u.email AS student_email, t.name AS teacher FROM appointments a JOIN users u ON u.id = a.user_id LEFT JOIN users t ON t.id = a.teacher_id $where ORDER BY a.starts_at LIMIT 500", $p);
    Http::json(['rows' => $rows]);
}
if ($route === 'POST /admin/appointments') {
    $b = Http::body();
    $uid = $b['user_id'] ?? null;
    $starts = (string) ($b['starts_at'] ?? '');
    if (!is_int($uid) || !DB::one($pdo, "SELECT id FROM users WHERE id = ? AND role = 'student'", [$uid]) || !preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $starts)) {
        Http::fail(422, 'invalid_input');
    }
    $tid = $b['teacher_id'] ?? null;
    if ($tid !== null && !(is_int($tid) && DB::one($pdo, "SELECT id FROM users WHERE id = ? AND role = 'teacher'", [$tid]))) {
        Http::fail(422, 'invalid_input');
    }
    DB::run($pdo, 'INSERT INTO appointments (user_id, teacher_id, starts_at, duration_min, status, link, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$uid, $tid, $starts, max(15, min(120, (int) ($b['duration_min'] ?? 40))), in_array($b['status'] ?? '', ['requested', 'confirmed'], true) ? $b['status'] : 'confirmed',
            mb_substr((string) ($b['link'] ?? ''), 0, 300) ?: null, mb_substr((string) ($b['notes'] ?? ''), 0, 500) ?: null, DB::now()]);
    $newId = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $aid, 'admin_appointment_created', (string) $uid);
    Http::json(['id' => $newId], 201);
}
if (preg_match('#^/admin/appointments/(\d+)$#', $path, $m)) {
    $ap = DB::one($pdo, 'SELECT * FROM appointments WHERE id = ?', [$m[1]]);
    if (!$ap) {
        Http::fail(404, 'not_found');
    }
    if ($method === 'PATCH') {
        $b = Http::body();
        if (isset($b['status'])) {
            if (!in_array($b['status'], ['requested', 'confirmed', 'done', 'canceled', 'no_show'], true)) {
                Http::fail(422, 'invalid_input');
            }
            DB::run($pdo, 'UPDATE appointments SET status = ? WHERE id = ?', [$b['status'], $m[1]]);
        }
        if (array_key_exists('teacher_id', $b)) {
            $tid = $b['teacher_id'];
            if ($tid !== null && !(is_int($tid) && DB::one($pdo, "SELECT id FROM users WHERE id = ? AND role = 'teacher'", [$tid]))) {
                Http::fail(422, 'invalid_input');
            }
            DB::run($pdo, 'UPDATE appointments SET teacher_id = ? WHERE id = ?', [$tid, $m[1]]);
        }
        if (isset($b['starts_at']) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', (string) $b['starts_at'])) {
            DB::run($pdo, 'UPDATE appointments SET starts_at = ? WHERE id = ?', [$b['starts_at'], $m[1]]);
        }
        foreach (['link' => 300, 'notes' => 500] as $f => $max) {
            if (array_key_exists($f, $b)) {
                DB::run($pdo, "UPDATE appointments SET $f = ? WHERE id = ?", [mb_substr((string) $b[$f], 0, $max) ?: null, $m[1]]);
            }
        }
        Audit::log($pdo, $cfg, $aid, 'admin_appointment_update', (string) $m[1]);
        if (($b['status'] ?? '') === 'confirmed' && $ap['status'] !== 'confirmed') {
            $st = DB::one($pdo, 'SELECT u.email, u.locale, a.starts_at FROM appointments a JOIN users u ON u.id = a.user_id WHERE a.id = ? AND u.is_demo = 0', [$m[1]]);
            if ($st) {
                $when = (new DateTimeImmutable($st['starts_at'] . ' UTC'))->setTimezone(new DateTimeZone('America/Sao_Paulo'))->format('d/m/Y H:i');
                Mailer::notify($pdo, $cfg, 'appointment', (string) $st['email'], (string) $st['locale'], ['when' => $when . ' (Brasília)', 'url' => Mailer::publicUrl($pdo) . '/' . $st['locale'] . '/app/perfil/']);
            }
        }
        Http::json(['ok' => true]);
    }
    if ($method === 'DELETE') {
        DB::run($pdo, 'DELETE FROM appointments WHERE id = ?', [$m[1]]);
        Http::json(['ok' => true]);
    }
}

/* ---------------- Configurações, sistema, demo, auditoria ---------------- */
if ($route === 'GET /admin/settings') {
    $all = Settings::all($pdo);
    unset($all['smtp']);
    Http::json($all);
}
if ($route === 'PUT /admin/settings') {
    $b = Http::body();
    $out = [];
    if (isset($b['price_cents'])) {
        if (!is_int($b['price_cents']) || $b['price_cents'] < 500 || $b['price_cents'] > 100000) {
            Http::fail(422, 'invalid_price');
        }
        $out['price_cents'] = $b['price_cents'];
    }
    if (isset($b['commission_tiers'])) {
        $tiers = [];
        foreach (is_array($b['commission_tiers']) ? $b['commission_tiers'] : [] as $t) {
            if (!is_array($t) || !is_int($t['min'] ?? null) || !is_int($t['percent'] ?? null) || $t['min'] < 1 || $t['percent'] < 0 || $t['percent'] > 60) {
                Http::fail(422, 'invalid_tiers');
            }
            $tiers[] = ['id' => preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($t['id'] ?? 'tier'))) ?: 'tier', 'min' => $t['min'], 'percent' => $t['percent']];
        }
        if (count($tiers) < 1 || count($tiers) > 6) {
            Http::fail(422, 'invalid_tiers');
        }
        usort($tiers, static fn($a, $c) => $a['min'] <=> $c['min']);
        $out['commission_tiers'] = $tiers;
    }
    if (isset($b['commission_hold_days'])) {
        if (!is_int($b['commission_hold_days']) || $b['commission_hold_days'] < 0 || $b['commission_hold_days'] > 90) {
            Http::fail(422, 'invalid_input');
        }
        $out['commission_hold_days'] = $b['commission_hold_days'];
    }
    if (isset($b['consult_enabled'])) {
        $out['consult_enabled'] = $b['consult_enabled'] === true;
    }
    if (isset($b['consult_capacity'])) {
        if (!is_int($b['consult_capacity']) || $b['consult_capacity'] < 1 || $b['consult_capacity'] > 20) {
            Http::fail(422, 'invalid_input');
        }
        $out['consult_capacity'] = $b['consult_capacity'];
    }
    if (isset($b['free_lessons'])) {
        if (!is_int($b['free_lessons']) || $b['free_lessons'] < 0 || $b['free_lessons'] > 3) {
            Http::fail(422, 'invalid_input');
        }
        $out['free_lessons'] = $b['free_lessons'];
    }
    if (isset($b['availability']) && is_array($b['availability'])) {
        $a = $b['availability'];
        $wd = array_values(array_unique(array_filter(is_array($a['weekdays'] ?? null) ? $a['weekdays'] : [], static fn($d) => is_int($d) && $d >= 0 && $d <= 6)));
        if (!preg_match('/^\d{2}:\d{2}$/', (string) ($a['start'] ?? '')) || !preg_match('/^\d{2}:\d{2}$/', (string) ($a['end'] ?? '')) || !is_int($a['slot_min'] ?? null) || $a['slot_min'] < 15 || $a['slot_min'] > 120 || $a['start'] >= $a['end']) {
            Http::fail(422, 'invalid_availability');
        }
        $out['availability'] = ['weekdays' => $wd, 'start' => $a['start'], 'end' => $a['end'], 'slot_min' => $a['slot_min']];
    }
    foreach ($out as $k => $v) {
        Settings::set($pdo, $k, $v);
    }
    Audit::log($pdo, $cfg, $aid, 'admin_settings', implode(',', array_keys($out)));
    $all = Settings::all($pdo);
    unset($all['smtp']);
    Http::json($all);
}
if ($route === 'GET /admin/system') {
    $count = static fn(string $t, string $w = '1=1') => (int) DB::one($pdo, "SELECT COUNT(*) AS n FROM $t WHERE $w")['n'];
    Http::json([
        'php' => PHP_VERSION,
        'db' => DB::driver($pdo),
        'schema' => Migrator::version($pdo),
        'time' => gmdate('c'),
        'counts' => [
            'students' => $count('users', "role = 'student'"), 'teachers' => $count('users', "role = 'teacher'"), 'admins' => $count('users', "role = 'admin'"),
            'lessonLogs' => $count('lesson_logs'), 'payments' => $count('payments'), 'appointments' => $count('appointments'),
            'exercises' => $count('exercises'), 'lessons' => $count('lessons'),
            'demoUsers' => $count('users', 'is_demo = 1'),
        ],
    ]);
}
if ($route === 'POST /admin/demo/seed') {
    $b = Http::body();
    $n = max(50, min(600, (int) ($b['students'] ?? 400)));
    Audit::log($pdo, $cfg, $aid, 'admin_demo_seed', (string) $n);
    Http::json(Demo::seed($pdo, $n), 201);
}
if ($route === 'POST /admin/demo/purge') {
    $n = Demo::purge($pdo);
    Audit::log($pdo, $cfg, $aid, 'admin_demo_purge', (string) $n);
    Http::json(['removed' => $n]);
}
if ($route === 'GET /admin/audit') {
    [$page, $size, $off] = Util::page();
    $where = ' WHERE 1=1';
    $p = [];
    if (preg_match('/^[a-z_]{2,40}$/', (string) ($_GET['action'] ?? ''))) {
        $where .= ' AND a.action LIKE ?';
        $p[] = $_GET['action'] . '%';
    }
    $total = (int) DB::one($pdo, "SELECT COUNT(*) AS n FROM audit_log a $where", $p)['n'];
    $rows = DB::all($pdo, "SELECT a.id, a.user_id, a.action, a.meta, a.created_at, u.name, u.role FROM audit_log a LEFT JOIN users u ON u.id = a.user_id $where ORDER BY a.id DESC LIMIT $size OFFSET $off", $p);
    Http::json(['total' => $total, 'page' => $page, 'size' => $size, 'rows' => $rows]);
}
if ($route === 'GET /admin/privacy') {
    $cons = DB::all($pdo, 'SELECT c.type, c.granted, COUNT(*) AS n FROM consents c JOIN (SELECT user_id, type, MAX(id) AS mid FROM consents GROUP BY user_id, type) l ON l.mid = c.id JOIN users u ON u.id = c.user_id WHERE u.is_demo = 0 GROUP BY c.type, c.granted');
    $since = gmdate('Y-m-d H:i:s', time() - 90 * 86400);
    $acts = DB::all($pdo, "SELECT action, COUNT(*) AS n FROM audit_log WHERE created_at >= ? AND action IN ('export','account_deleted','admin_view_anamnese','admin_student_deleted','admin_export','login_fail') GROUP BY action", [$since]);
    Http::json([
        'consents' => $cons,
        'activity90d' => $acts,
        'withHealthData' => (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM anamneses a JOIN users u ON u.id = a.user_id WHERE u.is_demo = 0')['n'],
        'sessionsActive' => (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?', [DB::now()])['n'],
    ]);
}

if (str_starts_with($path, '/admin/gateways')) {
    require __DIR__ . '/gateways.php';
}
if (str_starts_with($path, '/admin/smtp') || str_starts_with($path, '/admin/database')) {
    require __DIR__ . '/admin_system.php';
}

Http::fail(404, 'not_found');
