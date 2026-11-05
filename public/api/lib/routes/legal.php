<?php
declare(strict_types=1);

/**
 * Central jurídica.
 *  - Público: GET /legal e /legal/{slug} (somente versões PUBLICADAS).
 *  - Painel: /admin/legal* para os papéis "admin" e "legal" (advogado), com fluxo rascunho → revisão → aprovado → publicado.
 */

use TFS\Audit;
use TFS\Auth;
use TFS\DB;
use TFS\Http;
use TFS\Perms;
use TFS\Seed;
use TFS\Util;
use TFS\Settings;

$route = "$method $path";
$m = [];

/** Insere os modelos iniciais (rascunho) que ainda não existem. */
$seedLegal = static function (PDO $pdo, ?callable $log = null): int {
    $defaults = require __DIR__ . '/../legal_defaults.php';
    $now = DB::now();
    $added = 0;
    $sort = 0;
    foreach ($defaults as $d) {
        $sort += 10;
        if (DB::one($pdo, 'SELECT slug FROM legal_docs WHERE slug = ?', [$d['slug']])) {
            continue;
        }
        DB::run($pdo, 'INSERT INTO legal_docs (slug, category, title, required, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$d['slug'], $d['category'], $d['title'], $d['required'], $sort, $now]);
        DB::run($pdo, "INSERT INTO legal_versions (slug, version, status, content, change_note, created_at, updated_at) VALUES (?, 1, 'draft', ?, 'Modelo inicial (rascunho) — requer revisão jurídica', ?, ?)",
            [$d['slug'], json_encode(['pt' => $d['content'], 'en' => '', 'es' => ''], JSON_UNESCAPED_UNICODE), $now, $now]);
        if ($log) {
            $log($d['slug'], null, 1, 'created', 'Modelo inicial (rascunho)', null, ['pt' => $d['content'], 'en' => '', 'es' => '']);
        }
        $added++;
    }
    return $added;
};

/* ============ Público ============ */
if ($method === 'GET' && ($path === '/legal' || str_starts_with($path, '/legal/'))) {
    if ($path === '/legal') {
        Http::json(['docs' => DB::all($pdo, "SELECT d.slug, d.title, d.category, v.version, v.published_at FROM legal_docs d JOIN legal_versions v ON v.slug = d.slug AND v.status = 'published' ORDER BY d.sort"), 'company' => Settings::all($pdo)['company']]);
    }
    if (!preg_match('#^/legal/([a-z_]{2,40})$#', $path, $m)) {
        Http::fail(404, 'not_found');
    }
    $row = DB::one($pdo, "SELECT d.title, d.slug, v.version, v.content, v.published_at FROM legal_docs d JOIN legal_versions v ON v.slug = d.slug AND v.status = 'published' WHERE d.slug = ?", [$m[1]]);
    if (!$row) {
        Http::fail(404, 'not_published');
    }
    $c = json_decode((string) $row['content'], true) ?: [];
    $lang = in_array($_GET['lang'] ?? '', ['pt', 'en', 'es'], true) ? $_GET['lang'] : 'pt';
    $text = trim((string) ($c[$lang] ?? '')) !== '' ? $c[$lang] : (string) ($c['pt'] ?? '');
    Http::json(['slug' => $row['slug'], 'title' => $row['title'], 'version' => (int) $row['version'], 'published_at' => $row['published_at'], 'lang' => trim((string) ($c[$lang] ?? '')) !== '' ? $lang : 'pt', 'content' => $text,
        'langs' => array_values(array_filter(['pt', 'en', 'es'], static fn($l) => trim((string) ($c[$l] ?? '')) !== '')), 'company' => Settings::all($pdo)['company']]);
}

/* ============ Painel (admin e advogado) ============ */
$me = requireRole($pdo, $cfg, ['admin', 'legal', 'staff']);
$uid = (int) $me['id'];
$isAdmin = $me['role'] === 'admin';
$canPublish = Perms::can($me, 'legal.publish');
$perms = Perms::of($me);

/** Trilha de auditoria imutável (encadeada por hash): quem fez o quê, quando, e o texto antes/depois. */
$logEdit = static function (string $slug, ?int $versionId, int $version, string $action, ?string $note, ?array $before, ?array $after) use ($pdo, $me, $uid): void {
    $flat = static function (?array $c): array {
        $out = [];
        foreach (['pt', 'en', 'es'] as $l) {
            foreach (preg_split('/\R/u', (string) ($c[$l] ?? '')) ?: [] as $line) {
                if (trim($line) !== '') {
                    $out[] = "$l|" . trim($line);
                }
            }
        }
        return $out;
    };
    $count = static function (array $from, array $against): int {
        $pool = array_count_values($against);
        $chars = 0;
        foreach ($from as $line) {
            if (($pool[$line] ?? 0) > 0) {
                $pool[$line]--;
            } else {
                $chars += mb_strlen($line) - 3;
            }
        }
        return max(0, $chars);
    };
    $b = $flat($before);
    $a = $flat($after);
    $track = in_array($action, ['created', 'saved'], true);
    $added = $track && $after ? $count($a, $b) : 0;
    $removed = $track && $before ? $count($b, $a) : 0;
    $afterJson = $after ? json_encode($after, JSON_UNESCAPED_UNICODE) : null;
    $prev = (string) (DB::one($pdo, 'SELECT entry_hash FROM legal_edits ORDER BY id DESC')['entry_hash'] ?? str_repeat('0', 64));
    $now = DB::now();
    $contentHash = $afterJson !== null ? hash('sha256', $afterJson) : null;
    $uname = mb_substr((string) $me['name'], 0, 120);
    $entry = hash('sha256', implode('|', [$prev, $slug, $version, $uid, $uname, $action, $now, (string) $contentHash, $added, $removed]));
    DB::run($pdo, 'INSERT INTO legal_edits (slug, version_id, version, user_id, user_name, user_role, action, note, chars_added, chars_removed, content_before, content_after, content_hash, prev_hash, entry_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$slug, $versionId, $version, $uid, mb_substr((string) $me['name'], 0, 120), (string) $me['role'], $action, $note !== null ? mb_substr($note, 0, 300) : null, $added, $removed,
            $before ? json_encode($before, JSON_UNESCAPED_UNICODE) : null, $afterJson, $contentHash, $prev, $entry, $now]);
};

if (DB::one($pdo, 'SELECT slug FROM legal_docs') === null) {
    $seedLegal($pdo, $logEdit);
}

if ($route === 'POST /admin/legal/seed') {
    $n = $seedLegal($pdo, $logEdit);
    Audit::log($pdo, $cfg, $uid, 'legal_seed', (string) $n);
    Http::json(['added' => $n]);
}

if ($route === 'GET /admin/legal') {
    $docs = DB::all($pdo, 'SELECT * FROM legal_docs ORDER BY sort');
    $out = [];
    $published = 0;
    $required = 0;
    foreach ($docs as $d) {
        $latest = DB::one($pdo, 'SELECT id, version, status, updated_at, change_note FROM legal_versions WHERE slug = ? ORDER BY version DESC', [$d['slug']]);
        $pub = DB::one($pdo, "SELECT version, published_at FROM legal_versions WHERE slug = ? AND status = 'published'", [$d['slug']]);
        $open = (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM legal_comments WHERE slug = ? AND resolved = 0', [$d['slug']])['n'];
        if ($d['required']) {
            $required++;
            $published += $pub ? 1 : 0;
        }
        $out[] = ['slug' => $d['slug'], 'title' => $d['title'], 'category' => $d['category'], 'required' => (bool) $d['required'], 'latest' => $latest, 'published' => $pub, 'open_comments' => $open];
    }
    $count = static fn(string $st) => count(array_filter($out, static fn($o) => ($o['latest']['status'] ?? '') === $st));
    Http::json([
        'docs' => $out,
        'summary' => ['total' => count($out), 'required' => $required, 'required_published' => $published, 'draft' => $count('draft'), 'review' => $count('review'), 'approved' => $count('approved'), 'published' => $count('published'),
            'open_comments' => array_sum(array_column($out, 'open_comments')), 'readiness' => $required ? (int) round($published / $required * 100) : 0],
        'consent_version' => Settings::all($pdo)['consent_version'],
        'role' => $me['role'],
        'perms' => $perms,
        'company' => Settings::all($pdo)['company'],
    ]);
}

/* ---- Dados da empresa (rodapé legal / identificação do controlador) ---- */
if ($route === 'PUT /admin/legal/company') {
    $b = Http::body();
    $cur = Settings::all($pdo)['company'];
    $new = [];
    foreach (['legal_name' => 160, 'trade_name' => 120, 'cnpj' => 20, 'address' => 240, 'support_email' => 160, 'dpo_name' => 120, 'dpo_email' => 160] as $k => $max) {
        $v = trim((string) ($b[$k] ?? ''));
        if (mb_strlen($v) > $max || (str_ends_with($k, 'email') && $v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL))) {
            Http::fail(422, 'invalid_input');
        }
        $new[$k] = $v;
    }
    Settings::set($pdo, 'company', $new);
    $logEdit('company', null, 0, 'company', 'Dados da empresa', $cur, $new);
    Audit::log($pdo, $cfg, $uid, 'legal_company');
    Http::json(['ok' => true]);
}

/* ---- Trilha de auditoria das edições ---- */
if ($route === 'GET /admin/legal/history' || $route === 'GET /admin/legal/history.csv') {
    $slug = (string) ($_GET['slug'] ?? '');
    $where = preg_match('/^[a-z_]{2,40}$/', $slug) ? ' WHERE e.slug = ?' : '';
    $params = $where ? [$slug] : [];
    $limit = $route === 'GET /admin/legal/history.csv' ? 20000 : max(1, min(300, (int) ($_GET['limit'] ?? 100)));
    $rows = DB::all($pdo, "SELECT e.id, e.slug, d.title, e.version, e.user_id, e.user_name, e.user_role, e.action, e.note, e.chars_added, e.chars_removed,
        (e.content_after IS NOT NULL) AS has_content, e.content_hash, e.entry_hash, e.created_at
        FROM legal_edits e LEFT JOIN legal_docs d ON d.slug = e.slug$where ORDER BY e.id DESC LIMIT $limit", $params);
    if ($route === 'GET /admin/legal/history.csv') {
        Audit::log($pdo, $cfg, $uid, 'legal_export', 'history');
        Util::csv('auditoria-juridico.csv', ['id', 'data_utc', 'documento', 'versao', 'usuario', 'perfil', 'acao', 'caracteres_adicionados', 'caracteres_removidos', 'nota', 'hash'],
            array_map(static fn($r) => [$r['id'], $r['created_at'], $r['slug'], $r['version'], $r['user_name'], $r['user_role'], $r['action'], $r['chars_added'], $r['chars_removed'], $r['note'], $r['entry_hash']], $rows));
    }
    // verificação da cadeia de hashes (detecta adulteração direta no banco)
    $ok = true;
    $prev = str_repeat('0', 64);
    foreach (DB::all($pdo, 'SELECT slug, version, user_id, user_name, action, created_at, content_hash, chars_added, chars_removed, prev_hash, entry_hash FROM legal_edits ORDER BY id') as $e) {
        $calc = hash('sha256', implode('|', [$e['prev_hash'], $e['slug'], $e['version'], (int) $e['user_id'], $e['user_name'], $e['action'], $e['created_at'], (string) $e['content_hash'], $e['chars_added'], $e['chars_removed']]));
        if ($e['prev_hash'] !== $prev || $calc !== $e['entry_hash']) {
            $ok = false;
            break;
        }
        $prev = $e['entry_hash'];
    }
    Http::json(['rows' => $rows, 'chain_ok' => $ok]);
}
if ($method === 'GET' && preg_match('#^/admin/legal/edits/(\d+)$#', $path, $m)) {
    $e = DB::one($pdo, 'SELECT e.*, d.title FROM legal_edits e LEFT JOIN legal_docs d ON d.slug = e.slug WHERE e.id = ?', [$m[1]]);
    if (!$e) {
        Http::fail(404, 'not_found');
    }
    Http::json(['id' => (int) $e['id'], 'slug' => $e['slug'], 'title' => $e['title'], 'version' => (int) $e['version'], 'user_name' => $e['user_name'], 'user_role' => $e['user_role'], 'action' => $e['action'],
        'note' => $e['note'], 'created_at' => $e['created_at'], 'entry_hash' => $e['entry_hash'],
        'before' => $e['content_before'] ? json_decode((string) $e['content_before'], true) : null, 'after' => $e['content_after'] ? json_decode((string) $e['content_after'], true) : null]);
}

if ($route === 'GET /admin/legal/export') {
    $docs = [];
    foreach (DB::all($pdo, 'SELECT * FROM legal_docs ORDER BY sort') as $d) {
        $v = DB::one($pdo, 'SELECT * FROM legal_versions WHERE slug = ? ORDER BY version DESC', [$d['slug']]);
        $docs[] = [
            'slug' => $d['slug'], 'title' => $d['title'], 'category' => $d['category'], 'required' => (bool) $d['required'],
            'version' => $v ? (int) $v['version'] : null, 'status' => $v['status'] ?? null, 'updated_at' => $v['updated_at'] ?? null,
            'content' => $v ? (json_decode((string) $v['content'], true) ?: []) : [],
            'comments' => DB::all($pdo, 'SELECT author_name, body, resolved, created_at FROM legal_comments WHERE slug = ? ORDER BY id', [$d['slug']]),
        ];
    }
    Audit::log($pdo, $cfg, $uid, 'legal_export');
    Http::json(['generatedAt' => gmdate('c'), 'docs' => $docs]);
}

if ($route === 'POST /admin/legal/invite') {
    if (!$isAdmin) {
        Http::fail(403, 'forbidden');
    }
    $b = Http::body();
    $name = trim((string) ($b['name'] ?? ''));
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        Http::fail(422, 'invalid_input');
    }
    if (DB::one($pdo, 'SELECT id FROM users WHERE email = ?', [$email])) {
        Http::fail(409, 'email_taken');
    }
    $temp = Seed::password();
    DB::run($pdo, "INSERT INTO users (email, password_hash, name, role, locale, permissions, profile_label, created_at) VALUES (?, ?, ?, 'legal', 'pt', ?, 'Advogado', ?)",
        [$email, Auth::hash($temp), $name, json_encode(Perms::PRESETS['advogado']['perms']), DB::now()]);
    $newId = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $uid, 'legal_user_invited', (string) $newId);
    Http::json(['id' => $newId, 'tempPassword' => $temp], 201);
}
if ($route === 'GET /admin/legal/users') {
    Http::json(['rows' => DB::all($pdo, "SELECT id, name, email, last_login_at, created_at FROM users WHERE role = 'legal' ORDER BY name")]);
}

if ($method === 'PATCH' && preg_match('#^/admin/legal/comments/(\d+)$#', $path, $m)) {
    $b = Http::body();
    $n = DB::run($pdo, 'UPDATE legal_comments SET resolved = ? WHERE id = ?', [($b['resolved'] ?? false) === true ? 1 : 0, $m[1]]);
    if ($n === 0 && !DB::one($pdo, 'SELECT id FROM legal_comments WHERE id = ?', [$m[1]])) {
        Http::fail(404, 'not_found');
    }
    Http::json(['ok' => true]);
}

if (preg_match('#^/admin/legal/([a-z_]{2,40})(?:/(draft|submit|approve|reopen|publish|comments))?$#', $path, $m)) {
    $slug = $m[1];
    $action = $m[2] ?? '';
    $doc = DB::one($pdo, 'SELECT * FROM legal_docs WHERE slug = ?', [$slug]);
    if (!$doc) {
        Http::fail(404, 'not_found');
    }
    $latest = DB::one($pdo, 'SELECT * FROM legal_versions WHERE slug = ? ORDER BY version DESC', [$slug]);

    if ($action === '' && $method === 'GET') {
        $vid = ctype_digit((string) ($_GET['v'] ?? '')) ? (int) $_GET['v'] : (int) ($latest['id'] ?? 0);
        $sel = DB::one($pdo, 'SELECT * FROM legal_versions WHERE id = ? AND slug = ?', [$vid, $slug]) ?? $latest;
        $versions = DB::all($pdo, 'SELECT v.id, v.version, v.status, v.change_note, v.created_at, v.updated_at, v.submitted_at, v.approved_at, v.published_at, a.name AS approved_by_name, u.name AS author
            FROM legal_versions v LEFT JOIN users a ON a.id = v.approved_by LEFT JOIN users u ON u.id = v.author_id WHERE v.slug = ? ORDER BY v.version DESC', [$slug]);
        Http::json([
            'doc' => ['slug' => $slug, 'title' => $doc['title'], 'category' => $doc['category'], 'required' => (bool) $doc['required']],
            'selected' => $sel ? ['id' => (int) $sel['id'], 'version' => (int) $sel['version'], 'status' => $sel['status'], 'content' => json_decode((string) $sel['content'], true) ?: ['pt' => '', 'en' => '', 'es' => ''], 'change_note' => $sel['change_note']] : null,
            'versions' => $versions,
            'comments' => DB::all($pdo, 'SELECT id, version_id, author_name, body, resolved, created_at FROM legal_comments WHERE slug = ? ORDER BY id DESC LIMIT 200', [$slug]),
            'role' => $me['role'],
            'perms' => $perms,
        ]);
    }

    if ($action === 'draft' && $method === 'PUT') {
        $b = Http::body();
        $c = is_array($b['content'] ?? null) ? $b['content'] : [];
        $content = [];
        foreach (['pt', 'en', 'es'] as $l) {
            $t = (string) ($c[$l] ?? '');
            if (mb_strlen($t) > 60000) {
                Http::fail(422, 'too_long');
            }
            $content[$l] = $t;
        }
        if (trim($content['pt']) === '') {
            Http::fail(422, 'pt_required');
        }
        $note = mb_substr(trim((string) ($b['change_note'] ?? '')), 0, 300) ?: null;
        $now = DB::now();
        if ($latest && in_array($latest['status'], ['draft', 'review'], true)) {
            DB::run($pdo, "UPDATE legal_versions SET content = ?, change_note = COALESCE(?, change_note), status = 'draft', submitted_at = NULL, approved_by = NULL, approved_at = NULL, author_id = ?, updated_at = ? WHERE id = ?",
                [json_encode($content, JSON_UNESCAPED_UNICODE), $note, $uid, $now, $latest['id']]);
            $vid = (int) $latest['id'];
        } else {
            DB::run($pdo, "INSERT INTO legal_versions (slug, version, status, content, change_note, author_id, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)",
                [$slug, (int) ($latest['version'] ?? 0) + 1, json_encode($content, JSON_UNESCAPED_UNICODE), $note, $uid, $now, $now]);
            $vid = (int) $pdo->lastInsertId();
        }
        $verNo = $latest && in_array($latest['status'], ['draft', 'review'], true) ? (int) $latest['version'] : (int) ($latest['version'] ?? 0) + 1;
        $logEdit($slug, $vid, $verNo, 'saved', $note, $latest ? (json_decode((string) $latest['content'], true) ?: null) : null, $content);
        Audit::log($pdo, $cfg, $uid, 'legal_draft_saved', $slug);
        Http::json(['ok' => true, 'version_id' => $vid]);
    }

    if ($method === 'POST' && in_array($action, ['submit', 'approve', 'reopen', 'publish'], true)) {
        if (!$latest) {
            Http::fail(409, 'no_version');
        }
        $now = DB::now();
        $st = $latest['status'];
        if ($action === 'submit') {
            if ($st !== 'draft') {
                Http::fail(409, 'invalid_state');
            }
            DB::run($pdo, "UPDATE legal_versions SET status = 'review', submitted_at = ?, updated_at = ? WHERE id = ?", [$now, $now, $latest['id']]);
        } elseif ($action === 'approve') {
            if ($st !== 'review') {
                Http::fail(409, 'invalid_state');
            }
            DB::run($pdo, "UPDATE legal_versions SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?", [$uid, $now, $now, $latest['id']]);
        } elseif ($action === 'reopen') {
            if (!in_array($st, ['review', 'approved'], true)) {
                Http::fail(409, 'invalid_state');
            }
            DB::run($pdo, "UPDATE legal_versions SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = ? WHERE id = ?", [$now, $latest['id']]);
        } else {
            if (!$canPublish) {
                Http::fail(403, 'forbidden');
            }
            if ($st !== 'approved') {
                Http::fail(409, 'invalid_state');
            }
            $pdo->beginTransaction();
            try {
                DB::run($pdo, "UPDATE legal_versions SET status = 'archived' WHERE slug = ? AND status = 'published'", [$slug]);
                DB::run($pdo, "UPDATE legal_versions SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?", [$now, $now, $latest['id']]);
                if (in_array($slug, ['privacy', 'terms', 'health', 'consent_health'], true)) {
                    Settings::set($pdo, 'consent_version', gmdate('Y-m-d') . '.' . $slug . 'v' . $latest['version']);
                }
                $pdo->commit();
            } catch (\Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
        }
        $logEdit($slug, (int) $latest['id'], (int) $latest['version'], $action, null, null, json_decode((string) $latest['content'], true) ?: null);
        Audit::log($pdo, $cfg, $uid, 'legal_' . $action, $slug . ' v' . $latest['version']);
        Http::json(['ok' => true]);
    }

    if ($action === 'comments' && $method === 'POST') {
        $b = Http::body();
        $body = trim((string) ($b['body'] ?? ''));
        if ($body === '' || mb_strlen($body) > 2000) {
            Http::fail(422, 'invalid_input');
        }
        DB::run($pdo, 'INSERT INTO legal_comments (slug, version_id, author_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$slug, $latest['id'] ?? null, $uid, mb_substr((string) $me['name'], 0, 120), $body, DB::now()]);
        $newId = (int) $pdo->lastInsertId();
        $logEdit($slug, isset($latest['id']) ? (int) $latest['id'] : null, (int) ($latest['version'] ?? 0), 'comment', mb_substr($body, 0, 300), null, null);
        Audit::log($pdo, $cfg, $uid, 'legal_comment', $slug);
        Http::json(['id' => $newId], 201);
    }
}

Http::fail(404, 'not_found');
