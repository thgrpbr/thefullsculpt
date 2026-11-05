<?php
declare(strict_types=1);

/**
 * Admin > Planos e Preços (permissões pricing.view / pricing.manage, validadas em index.php).
 *  GET    /admin/pricing                     tudo: planos, promoções, códigos, regras
 *  POST|PUT|DELETE /admin/pricing/plans[/id]
 *  POST|PUT|DELETE /admin/pricing/promotions[/id]
 *  POST|PUT|DELETE /admin/pricing/codes[/id]
 *  PUT    /admin/pricing/rules
 *  GET    /admin/pricing/calendar?year=YYYY  feriados e datas comerciais (+ promoções do período)
 *  POST|DELETE /admin/pricing/calendar[/id]  datas personalizadas
 *  POST   /admin/pricing/quote               simulador de preço final
 */

use TFS\Audit;
use TFS\DB;
use TFS\FestiveCalendar;
use TFS\Http;
use TFS\Pricing;
use TFS\Settings;

$me = requireRole($pdo, $cfg, ['admin', 'legal', 'staff']);
$uid = (int) $me['id'];
$route = "$method $path";
$m = [];

$int = static function (mixed $v, int $min, int $max): int {
    if (!is_numeric($v) || (int) $v != $v || (int) $v < $min || (int) $v > $max) {
        Http::fail(422, 'invalid_input');
    }
    return (int) $v;
};
$date = static function (mixed $v): ?string {
    if ($v === null || $v === '') {
        return null;
    }
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $d) || !checkdate((int) $d[2], (int) $d[3], (int) $d[1])) {
        Http::fail(422, 'invalid_date');
    }
    return $v;
};
$str = static function (mixed $v, int $min, int $max): string {
    $v = is_string($v) ? trim($v) : '';
    if (mb_strlen($v) < $min || mb_strlen($v) > $max) {
        Http::fail(422, 'invalid_input');
    }
    return $v;
};
/** Lista de planos a que a regra se aplica (null = todos). */
$planIds = static function (mixed $v) use ($pdo): ?string {
    if ($v === null || $v === [] || $v === '') {
        return null;
    }
    if (!is_array($v)) {
        Http::fail(422, 'invalid_input');
    }
    $ids = array_values(array_unique(array_map('intval', $v)));
    foreach ($ids as $id) {
        if (!DB::one($pdo, 'SELECT id FROM plans WHERE id = ?', [$id])) {
            Http::fail(422, 'invalid_input');
        }
    }
    return json_encode($ids);
};
/** Valor do desconto: percentual 1–90 ou valor fixo (centavos). @return array{0:string,1:int} */
$discount = static function (array $b) use ($int): array {
    $kind = (string) ($b['kind'] ?? '');
    if (!in_array($kind, ['percent', 'fixed'], true)) {
        Http::fail(422, 'invalid_input');
    }
    return [$kind, $kind === 'percent' ? $int($b['value'] ?? null, 1, 90) : $int($b['value'] ?? null, 1, 100000)];
};
$period = static function (array $b) use ($date): array {
    $s = $date($b['starts_on'] ?? null);
    $e = $date($b['ends_on'] ?? null);
    if ($s && $e && $e < $s) {
        Http::fail(422, 'invalid_period');
    }
    return [$s, $e];
};
$flag = static fn(mixed $v): int => $v === true || $v === 1 || $v === '1' ? 1 : 0;

if ($route === 'GET /admin/pricing') {
    $plans = array_map(static function ($p) use ($pdo) {
        $v = Pricing::planView($p);
        $v['subscribers'] = (int) DB::one($pdo, "SELECT COUNT(*) AS n FROM subscriptions WHERE plan = ? AND status = 'active' AND is_demo = 0", [$p['slug']])['n'];
        return $v;
    }, DB::all($pdo, 'SELECT * FROM plans ORDER BY sort, id'));
    $today = Pricing::today();
    $promos = array_map(static fn($p) => [
        'id' => (int) $p['id'], 'name' => $p['name'], 'label' => $p['label'], 'kind' => $p['kind'], 'value' => (int) $p['value'],
        'plan_ids' => $p['plan_ids'] ? json_decode((string) $p['plan_ids'], true) : null, 'starts_on' => $p['starts_on'], 'ends_on' => $p['ends_on'],
        'first_purchase_only' => (bool) $p['first_purchase_only'], 'active' => (bool) $p['active'], 'event_key' => $p['event_key'],
        'running' => (bool) $p['active'] && (!$p['starts_on'] || $today >= $p['starts_on']) && (!$p['ends_on'] || $today <= $p['ends_on']),
    ], DB::all($pdo, 'SELECT * FROM promotions ORDER BY active DESC, COALESCE(starts_on, \'9999-12-31\'), id'));
    $codes = array_map(static fn($c) => [
        'id' => (int) $c['id'], 'code' => $c['code'], 'note' => $c['note'], 'kind' => $c['kind'], 'value' => (int) $c['value'],
        'plan_ids' => $c['plan_ids'] ? json_decode((string) $c['plan_ids'], true) : null, 'starts_on' => $c['starts_on'], 'ends_on' => $c['ends_on'],
        'max_uses' => $c['max_uses'] !== null ? (int) $c['max_uses'] : null, 'uses' => (int) $c['uses'], 'first_purchase_only' => (bool) $c['first_purchase_only'],
        'stackable' => (bool) $c['stackable'], 'active' => (bool) $c['active'],
        'discounted_cents' => (int) DB::one($pdo, 'SELECT COALESCE(SUM(discount_cents), 0) AS n FROM promo_redemptions WHERE code_id = ?', [$c['id']])['n'],
    ], DB::all($pdo, 'SELECT * FROM promo_codes ORDER BY active DESC, id DESC'));
    Http::json(['plans' => $plans, 'promotions' => $promos, 'codes' => $codes, 'rules' => Pricing::rules($pdo), 'today' => $today, 'intervals' => Pricing::INTERVALS]);
}

/* ---------------- Planos ---------------- */
$planFromBody = static function (array $b) use ($int, $str, $flag): array {
    $names = [];
    $descs = [];
    foreach (['pt', 'en', 'es'] as $l) {
        $names[$l] = $l === 'pt' ? $str($b['name'][$l] ?? null, 2, 80) : mb_substr(trim((string) ($b['name'][$l] ?? '')), 0, 80);
        $descs[$l] = mb_substr(trim((string) ($b['description'][$l] ?? '')), 0, 240);
    }
    $feat = [];
    foreach (['pt', 'en', 'es'] as $l) {
        $list = is_array($b['features'][$l] ?? null) ? $b['features'][$l] : [];
        $feat[$l] = array_slice(array_values(array_filter(array_map(static fn($x) => mb_substr(trim((string) $x), 0, 120), $list), static fn($x) => $x !== '')), 0, 12);
    }
    $months = $int($b['interval_months'] ?? null, 1, 12);
    if (!in_array($months, Pricing::INTERVALS, true)) {
        Http::fail(422, 'invalid_input');
    }
    return [$names, $descs, $feat, $months, $int($b['price_cents'] ?? null, 500, 10000000), $flag($b['active'] ?? true), $flag($b['featured'] ?? false), $int($b['sort'] ?? 10, 0, 9999)];
};
$slugify = static function (string $s): string {
    $s = strtolower((string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s));
    $s = trim((string) preg_replace('/[^a-z0-9]+/', '-', $s), '-');
    return $s !== '' ? mb_substr($s, 0, 40) : 'plano';
};
if ($route === 'POST /admin/pricing/plans') {
    [$n, $d, $f, $months, $price, $active, $featured, $sort] = $planFromBody(Http::body());
    $base = $slugify($n['pt']);
    $slug = $base;
    for ($i = 2; DB::one($pdo, 'SELECT id FROM plans WHERE slug = ?', [$slug]); $i++) {
        $slug = mb_substr($base, 0, 36) . '-' . $i;
    }
    $now = DB::now();
    DB::run($pdo, 'INSERT INTO plans (slug, name_pt, name_en, name_es, desc_pt, desc_en, desc_es, features, interval_months, price_cents, active, featured, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$slug, $n['pt'], $n['en'], $n['es'], $d['pt'], $d['en'], $d['es'], json_encode($f, JSON_UNESCAPED_UNICODE), $months, $price, $active, $featured, $sort, $now, $now]);
    $id = (int) $pdo->lastInsertId();
    if ($featured) {
        DB::run($pdo, 'UPDATE plans SET featured = 0 WHERE id <> ?', [$id]);
    }
    Audit::log($pdo, $cfg, $uid, 'admin_plan_created', "plan:$id $slug");
    Http::json(['id' => $id, 'slug' => $slug], 201);
}
if (preg_match('#^/admin/pricing/plans/(\d+)$#', $path, $m)) {
    $pid = (int) $m[1];
    $plan = DB::one($pdo, 'SELECT * FROM plans WHERE id = ?', [$pid]);
    if (!$plan) {
        Http::fail(404, 'not_found');
    }
    if ($method === 'PUT') {
        [$n, $d, $f, $months, $price, $active, $featured, $sort] = $planFromBody(Http::body());
        if (!$active && !DB::one($pdo, 'SELECT id FROM plans WHERE active = 1 AND id <> ?', [$pid])) {
            Http::fail(409, 'last_plan');   // sempre deve existir um plano à venda
        }
        DB::run($pdo, 'UPDATE plans SET name_pt = ?, name_en = ?, name_es = ?, desc_pt = ?, desc_en = ?, desc_es = ?, features = ?, interval_months = ?, price_cents = ?, active = ?, featured = ?, sort = ?, updated_at = ? WHERE id = ?',
            [$n['pt'], $n['en'], $n['es'], $d['pt'], $d['en'], $d['es'], json_encode($f, JSON_UNESCAPED_UNICODE), $months, $price, $active, $featured, $sort, DB::now(), $pid]);
        if ($featured) {
            DB::run($pdo, 'UPDATE plans SET featured = 0 WHERE id <> ?', [$pid]);
        }
        Audit::log($pdo, $cfg, $uid, 'admin_plan_updated', "plan:$pid price:$price");
        Http::json(['ok' => true]);
    }
    if ($method === 'DELETE') {
        if (DB::one($pdo, 'SELECT id FROM subscriptions WHERE plan = ?', [$plan['slug']]) || DB::one($pdo, 'SELECT id FROM promo_redemptions WHERE plan_id = ?', [$pid])) {
            Http::fail(409, 'in_use');   // há assinaturas/resgates: desative em vez de excluir
        }
        if ((int) $plan['active'] && !DB::one($pdo, 'SELECT id FROM plans WHERE active = 1 AND id <> ?', [$pid])) {
            Http::fail(409, 'last_plan');
        }
        DB::run($pdo, 'DELETE FROM plans WHERE id = ?', [$pid]);
        Audit::log($pdo, $cfg, $uid, 'admin_plan_deleted', "plan:$pid {$plan['slug']}");
        Http::json(['ok' => true]);
    }
}

/* ---------------- Promoções automáticas ---------------- */
if ($route === 'POST /admin/pricing/promotions' || (preg_match('#^/admin/pricing/promotions/(\d+)$#', $path, $m) && in_array($method, ['PUT', 'DELETE'], true))) {
    $pid = isset($m[1]) ? (int) $m[1] : null;
    if ($pid && !DB::one($pdo, 'SELECT id FROM promotions WHERE id = ?', [$pid])) {
        Http::fail(404, 'not_found');
    }
    if ($method === 'DELETE') {
        DB::run($pdo, 'DELETE FROM promotions WHERE id = ?', [$pid]);
        Audit::log($pdo, $cfg, $uid, 'admin_promo_deleted', "promo:$pid");
        Http::json(['ok' => true]);
    }
    $b = Http::body();
    $name = $str($b['name'] ?? null, 2, 80);
    $label = mb_substr(trim((string) ($b['label'] ?? '')), 0, 30) ?: null;
    [$kind, $value] = $discount($b);
    [$s, $e] = $period($b);
    $ev = mb_substr(trim((string) ($b['event_key'] ?? '')), 0, 60) ?: null;
    $vals = [$name, $label, $kind, $value, $planIds($b['plan_ids'] ?? null), $s, $e, $flag($b['first_purchase_only'] ?? false), $flag($b['active'] ?? true), $ev, DB::now()];
    if ($pid) {
        DB::run($pdo, 'UPDATE promotions SET name = ?, label = ?, kind = ?, value = ?, plan_ids = ?, starts_on = ?, ends_on = ?, first_purchase_only = ?, active = ?, event_key = ?, updated_at = ? WHERE id = ?', [...$vals, $pid]);
        Audit::log($pdo, $cfg, $uid, 'admin_promo_updated', "promo:$pid");
        Http::json(['ok' => true]);
    }
    DB::run($pdo, 'INSERT INTO promotions (name, label, kind, value, plan_ids, starts_on, ends_on, first_purchase_only, active, event_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [...$vals, DB::now()]);
    $id = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $uid, 'admin_promo_created', "promo:$id $name");
    Http::json(['id' => $id], 201);
}

/* ---------------- Códigos promocionais ---------------- */
if ($route === 'POST /admin/pricing/codes' || (preg_match('#^/admin/pricing/codes/(\d+)$#', $path, $m) && in_array($method, ['PUT', 'DELETE'], true))) {
    $cid = isset($m[1]) ? (int) $m[1] : null;
    $cur = $cid ? DB::one($pdo, 'SELECT * FROM promo_codes WHERE id = ?', [$cid]) : null;
    if ($cid && !$cur) {
        Http::fail(404, 'not_found');
    }
    if ($method === 'DELETE') {
        if ((int) $cur['uses'] > 0) {
            Http::fail(409, 'in_use');   // já foi usado: desative para preservar o histórico
        }
        DB::run($pdo, 'DELETE FROM promo_codes WHERE id = ?', [$cid]);
        Audit::log($pdo, $cfg, $uid, 'admin_code_deleted', "code:{$cur['code']}");
        Http::json(['ok' => true]);
    }
    $b = Http::body();
    $code = strtoupper(trim((string) ($b['code'] ?? '')));
    if (!preg_match('/^[A-Z0-9_-]{3,24}$/', $code)) {
        Http::fail(422, 'invalid_code');
    }
    if (DB::one($pdo, 'SELECT id FROM promo_codes WHERE code = ? AND id <> ?', [$code, $cid ?? 0])) {
        Http::fail(409, 'code_taken');
    }
    [$kind, $value] = $discount($b);
    [$s, $e] = $period($b);
    $max = ($b['max_uses'] ?? null) === null || $b['max_uses'] === '' ? null : $int($b['max_uses'], 1, 1000000);
    if ($cur && $max !== null && $max < (int) $cur['uses']) {
        Http::fail(422, 'max_below_uses');
    }
    $note = mb_substr(trim((string) ($b['note'] ?? '')), 0, 120) ?: null;
    $vals = [$code, $note, $kind, $value, $planIds($b['plan_ids'] ?? null), $s, $e, $max, $flag($b['first_purchase_only'] ?? false), $flag($b['stackable'] ?? false), $flag($b['active'] ?? true), DB::now()];
    if ($cid) {
        DB::run($pdo, 'UPDATE promo_codes SET code = ?, note = ?, kind = ?, value = ?, plan_ids = ?, starts_on = ?, ends_on = ?, max_uses = ?, first_purchase_only = ?, stackable = ?, active = ?, updated_at = ? WHERE id = ?', [...$vals, $cid]);
        Audit::log($pdo, $cfg, $uid, 'admin_code_updated', "code:$code");
        Http::json(['ok' => true]);
    }
    DB::run($pdo, 'INSERT INTO promo_codes (code, note, kind, value, plan_ids, starts_on, ends_on, max_uses, first_purchase_only, stackable, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [...$vals, DB::now()]);
    $id = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $uid, 'admin_code_created', "code:$code");
    Http::json(['id' => $id], 201);
}

/* ---------------- Regras gerais de desconto ---------------- */
if ($route === 'PUT /admin/pricing/rules') {
    $b = Http::body();
    $rules = ['max_discount_pct' => $int($b['max_discount_pct'] ?? null, 0, 100), 'allow_stack' => ($b['allow_stack'] ?? false) === true, 'min_price_cents' => $int($b['min_price_cents'] ?? null, 0, 10000000)];
    Settings::set($pdo, 'pricing_rules', $rules);
    Audit::log($pdo, $cfg, $uid, 'admin_pricing_rules', json_encode($rules));
    Http::json(['ok' => true, 'rules' => $rules]);
}

/* ---------------- Calendário ---------------- */
if ($route === 'GET /admin/pricing/calendar') {
    $year = ctype_digit((string) ($_GET['year'] ?? '')) ? (int) $_GET['year'] : (int) substr(Pricing::today(), 0, 4);
    if ($year < 2020 || $year > 2100) {
        Http::fail(422, 'invalid_input');
    }
    $events = FestiveCalendar::year($pdo, $year);
    $promos = DB::all($pdo, "SELECT id, name, starts_on, ends_on, active FROM promotions WHERE (starts_on IS NULL OR starts_on <= ?) AND (ends_on IS NULL OR ends_on >= ?)", ["$year-12-31", "$year-01-01"]);
    Http::json(['year' => $year, 'events' => $events, 'promotions' => $promos, 'today' => Pricing::today()]);
}
if ($route === 'POST /admin/pricing/calendar') {
    $b = Http::body();
    $d = $date($b['date'] ?? null);
    if (!$d) {
        Http::fail(422, 'invalid_date');
    }
    $kind = in_array($b['kind'] ?? '', ['holiday', 'optional', 'commercial', 'health', 'custom'], true) ? (string) $b['kind'] : 'custom';
    DB::run($pdo, 'INSERT INTO calendar_events (date, name, kind, yearly, active, created_at) VALUES (?, ?, ?, ?, 1, ?)', [$d, $str($b['name'] ?? null, 2, 100), $kind, $flag($b['yearly'] ?? false), DB::now()]);
    $id = (int) $pdo->lastInsertId();
    Audit::log($pdo, $cfg, $uid, 'admin_calendar_added', "event:$id $d");
    Http::json(['id' => $id], 201);
}
if ($method === 'DELETE' && preg_match('#^/admin/pricing/calendar/(\d+)$#', $path, $m)) {
    if (DB::run($pdo, 'DELETE FROM calendar_events WHERE id = ?', [$m[1]]) === 0) {
        Http::fail(404, 'not_found');
    }
    Audit::log($pdo, $cfg, $uid, 'admin_calendar_removed', "event:{$m[1]}");
    Http::json(['ok' => true]);
}

/* ---------------- Simulador ---------------- */
if ($route === 'POST /admin/pricing/quote') {
    $b = Http::body();
    $pl = ctype_digit((string) ($b['plan_id'] ?? '')) ? DB::one($pdo, 'SELECT * FROM plans WHERE id = ?', [(int) $b['plan_id']]) : null;
    if (!$pl) {
        Http::fail(404, 'plan_not_found');
    }
    Http::json(Pricing::quote($pdo, $pl, is_string($b['code'] ?? null) ? $b['code'] : null, null));
}

Http::fail(404, 'not_found');
