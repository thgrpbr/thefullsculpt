<?php
declare(strict_types=1);

/** Rotas /teacher/* — professor (vê apenas os próprios alunos; nunca dados de saúde). */

use TFS\Analytics;
use TFS\Audit;
use TFS\DB;
use TFS\Http;
use TFS\Util;

$teacher = requireRole($pdo, $cfg, ['teacher']);
$tid = (int) $teacher['id'];
$route = "$method $path";
$m = [];

if ($route === 'GET /teacher/overview') {
    $profile = DB::one($pdo, 'SELECT code, cref, bio, status FROM teacher_profiles WHERE user_id = ?', [$tid]);
    Http::json([
        'profile' => ['name' => $teacher['name'], 'email' => $teacher['email']] + ($profile ?? []),
        'stats' => Analytics::teacher($pdo, $tid),
        'upcoming' => DB::all($pdo, "SELECT a.id, a.starts_at, a.status, a.duration_min, a.link, u.name AS student FROM appointments a JOIN users u ON u.id = a.user_id
            WHERE a.teacher_id = ? AND a.starts_at >= ? AND a.status IN ('requested','confirmed') ORDER BY a.starts_at LIMIT 10", [$tid, DB::now()]),
    ]);
}
if ($route === 'GET /teacher/students') {
    [$page, $size, $off] = Util::page();
    $total = (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM users WHERE teacher_id = ?', [$tid])['n'];
    $rows = DB::all($pdo, "SELECT u.id, u.name, u.created_at, s.phase, s.xp, s.streak, s.best_streak, s.sub_status, s.last_day,
            (SELECT COUNT(*) FROM lesson_logs l WHERE l.user_id = u.id) AS lessons
        FROM users u LEFT JOIN user_stats s ON s.user_id = u.id WHERE u.teacher_id = ? ORDER BY u.created_at DESC LIMIT $size OFFSET $off", [$tid]);
    Http::json(['total' => $total, 'page' => $page, 'size' => $size, 'rows' => $rows]);
}
if ($route === 'GET /teacher/commissions') {
    [$page, $size, $off] = Util::page();
    $total = (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM commissions WHERE teacher_id = ?', [$tid])['n'];
    $rows = DB::all($pdo, "SELECT c.id, c.amount_cents, c.percent, c.status, c.available_at, c.paid_at, c.created_at, u.name AS student FROM commissions c JOIN users u ON u.id = c.user_id WHERE c.teacher_id = ? ORDER BY c.id DESC LIMIT $size OFFSET $off", [$tid]);
    Http::json(['total' => $total, 'page' => $page, 'size' => $size, 'rows' => $rows, 'payouts' => DB::all($pdo, 'SELECT id, amount_cents, period, paid_at FROM payouts WHERE teacher_id = ? ORDER BY id DESC LIMIT 24', [$tid])]);
}
if ($route === 'GET /teacher/appointments') {
    Http::json(['rows' => DB::all($pdo, "SELECT a.id, a.starts_at, a.duration_min, a.status, a.link, a.notes, u.name AS student FROM appointments a JOIN users u ON u.id = a.user_id WHERE a.teacher_id = ? AND a.starts_at >= ? ORDER BY a.starts_at LIMIT 100", [$tid, gmdate('Y-m-d H:i:s', time() - 14 * 86400)])]);
}
if ($method === 'PATCH' && preg_match('#^/teacher/appointments/(\d+)$#', $path, $m)) {
    $ap = DB::one($pdo, 'SELECT id FROM appointments WHERE id = ? AND teacher_id = ?', [$m[1], $tid]);
    if (!$ap) {
        Http::fail(404, 'not_found');
    }
    $b = Http::body();
    if (isset($b['status'])) {
        if (!in_array($b['status'], ['confirmed', 'done', 'canceled', 'no_show'], true)) {
            Http::fail(422, 'invalid_input');
        }
        DB::run($pdo, 'UPDATE appointments SET status = ? WHERE id = ?', [$b['status'], $m[1]]);
    }
    foreach (['link' => 300, 'notes' => 500] as $f => $max) {
        if (array_key_exists($f, $b)) {
            DB::run($pdo, "UPDATE appointments SET $f = ? WHERE id = ?", [mb_substr((string) $b[$f], 0, $max) ?: null, $m[1]]);
        }
    }
    Audit::log($pdo, $cfg, $tid, 'teacher_appointment_update', (string) $m[1]);
    Http::json(['ok' => true]);
}

Http::fail(404, 'not_found');
