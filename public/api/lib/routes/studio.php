<?php
declare(strict_types=1);

/**
 * Estúdio 3D (Admin > Método e exercícios): rig/biomecânica por exercício, com histórico de versões.
 * Permissões: method.view (ler) / method.edit (salvar, restaurar, apagar) — validadas em index.php.
 *  GET    /admin/studio              exercícios e quais têm rig personalizado
 *  GET    /admin/studio/{slug}       rig atual + histórico
 *  PUT    /admin/studio/{slug}       salva nova versão {def, note}
 *  POST   /admin/studio/{slug}/restore {version}
 *  DELETE /admin/studio/{slug}       volta ao movimento padrão
 */

use TFS\Audit;
use TFS\DB;
use TFS\Http;

$me = requireRole($pdo, $cfg, ['admin', 'legal', 'staff']);
$uid = (int) $me['id'];
$route = "$method $path";
$m = [];

const RIG_JOINTS = ['knee', 'hip', 'trunk', 'elbow', 'shoulder'];
const RIG_LENGTHS = ['thigh' => [0.25, 0.65], 'shank' => [0.25, 0.65], 'torso' => [0.3, 0.8], 'uarm' => [0.18, 0.45], 'farm' => [0.15, 0.4], 'neck' => [0.05, 0.3]];

/** Valida e normaliza a definição do movimento. Falha com 422 em qualquer valor fora de faixa. */
$cleanDef = static function (mixed $d): array {
    $bad = static fn(string $why = 'invalid_rig') => Http::fail(422, $why);
    if (!is_array($d) || ($d['v'] ?? null) !== 1) {
        $bad();
    }
    $num = static function (mixed $v, float $min, float $max) use ($bad): float {
        if (!is_int($v) && !is_float($v) || !is_finite((float) $v) || $v < $min || $v > $max) {
            $bad();
        }
        return round((float) $v, 4);
    };
    $lengths = [];
    foreach (RIG_LENGTHS as $k => [$lo, $hi]) {
        $lengths[$k] = $num($d['lengths'][$k] ?? null, $lo, $hi);
    }
    $keys = is_array($d['keys'] ?? null) ? array_values($d['keys']) : [];
    if (count($keys) < 2 || count($keys) > 16) {
        $bad();
    }
    $outKeys = [];
    foreach ($keys as $k) {
        if (!is_array($k)) {
            $bad();
        }
        $outKeys[] = [
            'p' => $num($k['p'] ?? null, 0, 1),
            'hip' => ['x' => $num($k['hip']['x'] ?? null, -1.5, 1.5), 'y' => $num($k['hip']['y'] ?? null, 0.1, 1.6)],
            'lean' => $num($k['lean'] ?? null, -1.6, 1.6),
            'headLean' => $num($k['headLean'] ?? null, -1.6, 1.6),
            'hand' => ['x' => $num($k['hand']['x'] ?? null, -1.5, 1.5), 'y' => $num($k['hand']['y'] ?? null, -0.2, 2.4)],
        ];
    }
    usort($outKeys, static fn($a, $b) => $a['p'] <=> $b['p']);
    if ($outKeys[0]['p'] !== 0.0 || $outKeys[count($outKeys) - 1]['p'] !== 1.0) {
        $bad('rig_keys_range');   // precisa começar em 0% e terminar em 100%
    }
    for ($i = 1; $i < count($outKeys); $i++) {
        if ($outKeys[$i]['p'] <= $outKeys[$i - 1]['p']) {
            $bad('rig_keys_duplicate');
        }
    }
    $limits = [];
    foreach (RIG_JOINTS as $j) {
        $lo = $num($d['limits'][$j][0] ?? null, -20, 200);
        $hi = $num($d['limits'][$j][1] ?? null, -20, 200);
        if ($hi < $lo) {
            $bad();
        }
        $limits[$j] = [$lo, $hi];
    }
    $checks = [];
    foreach (is_array($d['checks'] ?? null) ? $d['checks'] : [] as $c) {
        if (!is_array($c) || !in_array($c['joint'] ?? '', RIG_JOINTS, true)) {
            $bad();
        }
        $cue = static function (mixed $x) use ($bad): array {
            $o = [];
            foreach (['pt', 'en', 'es'] as $l) {
                $t = is_array($x) ? trim((string) ($x[$l] ?? '')) : '';
                if (mb_strlen($t) > 160) {
                    $bad();
                }
                $o[$l] = $t;
            }
            return $o;
        };
        $checks[] = ['joint' => $c['joint'], 'enabled' => ($c['enabled'] ?? false) === true, 'tolerance' => $num($c['tolerance'] ?? null, 1, 60),
            'weight' => (int) $num($c['weight'] ?? null, 1, 5), 'cueLow' => $cue($c['cueLow'] ?? null), 'cueHigh' => $cue($c['cueHigh'] ?? null)];
    }
    return ['v' => 1, 'lengths' => $lengths, 'keys' => $outKeys, 'limits' => $limits, 'checks' => $checks, 'repSeconds' => $num($d['repSeconds'] ?? 4, 1.5, 12)];
};

if ($route === 'GET /admin/studio') {
    $rows = DB::all($pdo, "SELECT e.id, e.slug, e.motion, e.depth, e.i18n, e.active,
        (SELECT r.version FROM exercise_rigs r WHERE r.slug = e.slug AND r.is_current = 1) AS rig_version,
        (SELECT r.created_at FROM exercise_rigs r WHERE r.slug = e.slug AND r.is_current = 1) AS rig_at
        FROM exercises e ORDER BY e.slug");
    Http::json(['rows' => array_map(static function ($r) {
        $i = json_decode((string) $r['i18n'], true);
        return ['slug' => $r['slug'], 'name' => $i['pt']['name'] ?? $r['slug'], 'motion' => $r['motion'], 'depth' => (float) $r['depth'], 'active' => (bool) $r['active'],
            'rig_version' => $r['rig_version'] !== null ? (int) $r['rig_version'] : null, 'rig_at' => $r['rig_at']];
    }, $rows)]);
}

if (preg_match('#^/admin/studio/([A-Za-z0-9_-]{2,40})(?:/(restore))?$#', $path, $m)) {
    $slug = $m[1];
    $ex = DB::one($pdo, 'SELECT slug, motion, depth, i18n FROM exercises WHERE slug = ?', [$slug]);
    if (!$ex) {
        Http::fail(404, 'not_found');
    }
    if ($method === 'GET') {
        $cur = DB::one($pdo, 'SELECT id, version, def, note, created_at FROM exercise_rigs WHERE slug = ? AND is_current = 1', [$slug]);
        $hist = DB::all($pdo, 'SELECT r.id, r.version, r.note, r.created_at, r.is_current, u.name AS author FROM exercise_rigs r LEFT JOIN users u ON u.id = r.author_id WHERE r.slug = ? ORDER BY r.version DESC LIMIT 50', [$slug]);
        $i = json_decode((string) $ex['i18n'], true);
        Http::json(['slug' => $slug, 'name' => $i['pt']['name'] ?? $slug, 'motion' => $ex['motion'], 'depth' => (float) $ex['depth'],
            'def' => $cur ? json_decode((string) $cur['def'], true) : null, 'version' => $cur ? (int) $cur['version'] : null, 'history' => $hist]);
    }
    if ($method === 'PUT') {
        $b = Http::body();
        $def = $cleanDef($b['def'] ?? null);
        $note = mb_substr(trim((string) ($b['note'] ?? '')), 0, 200) ?: null;
        $ver = (int) (DB::one($pdo, 'SELECT COALESCE(MAX(version), 0) AS v FROM exercise_rigs WHERE slug = ?', [$slug])['v']) + 1;
        $pdo->beginTransaction();
        try {
            DB::run($pdo, 'UPDATE exercise_rigs SET is_current = 0 WHERE slug = ?', [$slug]);
            DB::run($pdo, 'INSERT INTO exercise_rigs (slug, version, def, note, author_id, created_at, is_current) VALUES (?, ?, ?, ?, ?, ?, 1)',
                [$slug, $ver, json_encode($def, JSON_UNESCAPED_UNICODE), $note, $uid, DB::now()]);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log($pdo, $cfg, $uid, 'admin_rig_saved', "$slug v$ver");
        Http::json(['ok' => true, 'version' => $ver]);
    }
    if ($method === 'POST' && ($m[2] ?? '') === 'restore') {
        $b = Http::body();
        $row = ctype_digit((string) ($b['version'] ?? '')) ? DB::one($pdo, 'SELECT def, version FROM exercise_rigs WHERE slug = ? AND version = ?', [$slug, (int) $b['version']]) : null;
        if (!$row) {
            Http::fail(404, 'not_found');
        }
        $ver = (int) (DB::one($pdo, 'SELECT MAX(version) AS v FROM exercise_rigs WHERE slug = ?', [$slug])['v']) + 1;
        DB::run($pdo, 'UPDATE exercise_rigs SET is_current = 0 WHERE slug = ?', [$slug]);
        DB::run($pdo, 'INSERT INTO exercise_rigs (slug, version, def, note, author_id, created_at, is_current) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [$slug, $ver, $row['def'], 'Restaurada a partir da v' . $row['version'], $uid, DB::now()]);
        Audit::log($pdo, $cfg, $uid, 'admin_rig_restored', "$slug v{$row['version']} -> v$ver");
        Http::json(['ok' => true, 'version' => $ver]);
    }
    if ($method === 'DELETE') {
        DB::run($pdo, 'UPDATE exercise_rigs SET is_current = 0 WHERE slug = ?', [$slug]);
        Audit::log($pdo, $cfg, $uid, 'admin_rig_reset', $slug);
        Http::json(['ok' => true]);
    }
}

Http::fail(404, 'not_found');
