<?php
declare(strict_types=1);

/** Rotas do aluno: catálogo do método e agendamento de consulta online. */

use TFS\Audit;
use TFS\DB;
use TFS\Http;
use TFS\Settings;

$route = "$method $path";
$m = [];

/** @return list<array{starts_at:string,local:string,free:int}> */
$buildSlots = static function (PDO $pdo): array {
    $s = Settings::all($pdo);
    if (($s['consult_enabled'] ?? true) !== true) {
        return [];
    }
    $av = $s['availability'];
    $cap = (int) ($s['consult_capacity'] ?? 2);
    $tz = new DateTimeZone('America/Sao_Paulo');
    $minStart = time() + 2 * 3600;
    $out = [];
    for ($d = 0; $d < 14; $d++) {
        $day = (new DateTimeImmutable('today', $tz))->modify("+$d day");
        if (!in_array((int) $day->format('w'), $av['weekdays'], true)) {
            continue;
        }
        [$h0, $m0] = array_map('intval', explode(':', $av['start']));
        [$h1, $m1] = array_map('intval', explode(':', $av['end']));
        $t = $day->setTime($h0, $m0);
        $end = $day->setTime($h1, $m1);
        while ($t->modify('+' . $av['slot_min'] . ' minutes') <= $end) {
            if ($t->getTimestamp() >= $minStart) {
                $utc = gmdate('Y-m-d H:i:s', $t->getTimestamp());
                $booked = (int) DB::one($pdo, "SELECT COUNT(*) AS n FROM appointments WHERE starts_at = ? AND status IN ('requested','confirmed')", [$utc])['n'];
                if ($booked < $cap) {
                    $out[] = ['starts_at' => $utc, 'local' => $t->format('Y-m-d H:i'), 'free' => $cap - $booked];
                }
            }
            $t = $t->modify('+' . $av['slot_min'] . ' minutes');
        }
    }
    return $out;
};

if ($route === 'GET /catalog') {
    $ex = DB::all($pdo, 'SELECT id, slug, motion, depth, primary_m, secondary_m, stabilizers_m, video_url, i18n FROM exercises WHERE active = 1 ORDER BY id');
    $map = [];
    foreach (DB::all($pdo, 'SELECT le.lesson_id, le.pos, e.slug FROM lesson_exercises le JOIN exercises e ON e.id = le.exercise_id ORDER BY le.lesson_id, le.pos') as $r) {
        $map[$r['lesson_id']][] = $r['slug'];
    }
    $lessons = [];
    foreach (DB::all($pdo, 'SELECT id, phase, n, focus, work_sec, rest_sec, rounds FROM lessons WHERE active = 1 ORDER BY phase, n') as $l) {
        $lessons[] = ['id' => 'f' . $l['phase'] . '-' . $l['n'], 'phase' => (int) $l['phase'], 'n' => (int) $l['n'], 'focus' => $l['focus'],
            'workSec' => (int) $l['work_sec'], 'restSec' => (int) $l['rest_sec'], 'rounds' => (int) $l['rounds'], 'exercises' => $map[$l['id']] ?? []];
    }
    $exercises = array_map(static fn($e) => [
        'slug' => $e['slug'], 'motion' => $e['motion'], 'depth' => (float) $e['depth'],
        'primary' => array_values(array_filter(explode(',', (string) $e['primary_m']))),
        'secondary' => array_values(array_filter(explode(',', (string) $e['secondary_m']))),
        'stabilizers' => array_values(array_filter(explode(',', (string) $e['stabilizers_m']))),
        'videoUrl' => $e['video_url'], 'i18n' => json_decode((string) $e['i18n'], true),
    ], $ex);
    Http::json(['exercises' => $exercises, 'lessons' => $lessons]);
}

if ($route === 'GET /appointments/slots') {
    requireUser($pdo, $cfg);
    Http::json(['slots' => $buildSlots($pdo), 'enabled' => (bool) Settings::all($pdo)['consult_enabled']]);
}
if ($route === 'GET /appointments') {
    $u = requireUser($pdo, $cfg);
    Http::json(['rows' => DB::all($pdo, 'SELECT a.id, a.starts_at, a.duration_min, a.status, a.link, t.name AS teacher FROM appointments a LEFT JOIN users t ON t.id = a.teacher_id WHERE a.user_id = ? ORDER BY a.starts_at DESC LIMIT 20', [$u['id']])]);
}
if ($route === 'POST /appointments') {
    $u = requireUser($pdo, $cfg);
    $uid = (int) $u['id'];
    if (!TFS\Rate::hit($pdo, "appt:$uid", 10, 3600)) {
        Http::fail(429, 'rate_limited');
    }
    $b = Http::body();
    $starts = (string) ($b['starts_at'] ?? '');
    $ok = false;
    foreach ($buildSlots($pdo) as $s) {
        if ($s['starts_at'] === $starts) {
            $ok = true;
            break;
        }
    }
    if (!$ok) {
        Http::fail(409, 'slot_unavailable');
    }
    if (DB::one($pdo, "SELECT id FROM appointments WHERE user_id = ? AND status IN ('requested','confirmed') AND starts_at >= ?", [$uid, DB::now()])) {
        Http::fail(409, 'already_booked');
    }
    DB::run($pdo, "INSERT INTO appointments (user_id, teacher_id, starts_at, duration_min, status, created_at) VALUES (?, ?, ?, ?, 'requested', ?)",
        [$uid, $u['teacher_id'], $starts, (int) Settings::all($pdo)['availability']['slot_min'], DB::now()]);
    $newId = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $uid, 'appointment_requested', $starts);
    Http::json(['id' => $newId], 201);
}
if ($method === 'DELETE' && preg_match('#^/appointments/(\d+)$#', $path, $m)) {
    $u = requireUser($pdo, $cfg);
    $n = DB::run($pdo, "UPDATE appointments SET status = 'canceled' WHERE id = ? AND user_id = ? AND status IN ('requested','confirmed') AND starts_at >= ?", [$m[1], $u['id'], DB::now()]);
    if ($n === 0) {
        Http::fail(404, 'not_found');
    }
    Audit::log($pdo, $cfg, (int) $u['id'], 'appointment_canceled', (string) $m[1]);
    Http::json(['ok' => true]);
}

Http::fail(404, 'not_found');
