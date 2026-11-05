<?php
declare(strict_types=1);

/**
 * Webhooks dos gateways (públicos, sem cookie/CSRF). Toda chamada é registrada em webhook_events.
 * Stripe: assinatura HMAC verificada e pagamento registrado (idempotente). Demais provedores: recebidos e registrados
 * (a verificação de assinatura de cada um entra junto com o checkout daquele provedor).
 */

use TFS\Billing;
use TFS\DB;
use TFS\Gateways;
use TFS\Http;

if ($method !== 'POST' || !preg_match('#^/webhooks/(stripe|mercadopago|pagarme|asaas)$#', $path, $wm)) {
    Http::fail(404, 'not_found');
}
$provider = $wm[1];
$raw = (string) file_get_contents('php://input', false, null, 0, 262145);
if (strlen($raw) > 262144) {
    Http::fail(413, 'too_large');
}
if (!TFS\Rate::hit($pdo, 'wh:' . Http::ip(), 600, 60)) {
    Http::fail(429, 'rate_limited');
}
$event = json_decode($raw, true);
$evId = is_array($event) ? mb_substr((string) ($event['id'] ?? ''), 0, 80) : '';
$evType = is_array($event) ? mb_substr((string) ($event['type'] ?? ($event['action'] ?? $event['event'] ?? '')), 0, 60) : '';

$log = static function (bool $valid, bool $processed, ?string $error) use ($pdo, $provider, $evId, $evType, $raw): void {
    DB::run($pdo, 'INSERT INTO webhook_events (provider, event_id, type, valid, processed, error, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$provider, $evId ?: null, $evType ?: null, $valid ? 1 : 0, $processed ? 1 : 0, $error, mb_substr($raw, 0, 60000), DB::now()]);
};

if ($provider !== 'stripe') {
    $log(false, false, 'verificação de assinatura deste provedor ainda não habilitada');
    Http::json(['received' => true, 'verified' => false], 202);
}

/* ---- Stripe ---- */
$sigHeader = (string) ($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '');
$t = null;
$v1 = [];
foreach (explode(',', $sigHeader) as $part) {
    [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
    if ($k === 't') {
        $t = (int) $v;
    } elseif ($k === 'v1') {
        $v1[] = $v;
    }
}
$valid = false;
if ($t && abs(time() - $t) <= 300 && $v1) {
    foreach (DB::all($pdo, "SELECT * FROM payment_gateways WHERE provider = 'stripe' AND enabled = 1") as $g) {
        $secret = Gateways::config($g, $cfg)['webhook_secret'] ?? '';
        if ($secret === '') {
            continue;
        }
        $expected = hash_hmac('sha256', $t . '.' . $raw, $secret);
        foreach ($v1 as $sig) {
            if (hash_equals($expected, $sig)) {
                $valid = true;
            }
        }
    }
}
if (!$valid || !is_array($event)) {
    $log(false, false, 'assinatura inválida');
    Http::fail(400, 'invalid_signature');
}
if ($evId !== '' && DB::one($pdo, 'SELECT id FROM webhook_events WHERE provider = ? AND event_id = ? AND processed = 1', ['stripe', $evId])) {
    Http::json(['received' => true, 'duplicate' => true]);
}

$obj = is_array($event['data']['object'] ?? null) ? $event['data']['object'] : [];
$uid = (int) ($obj['metadata']['user_id'] ?? $obj['subscription_details']['metadata']['user_id'] ?? 0);
$user = $uid > 0 ? DB::one($pdo, "SELECT id FROM users WHERE id = ? AND role = 'student'", [$uid]) : null;
try {
    if (in_array($evType, ['invoice.paid', 'payment_intent.succeeded'], true) && $user) {
        $amount = (int) ($obj['amount_paid'] ?? $obj['amount_received'] ?? $obj['amount'] ?? 0);
        $ref = mb_substr((string) ($obj['id'] ?? $evId), 0, 80);
        if ($amount > 0 && !DB::one($pdo, 'SELECT id FROM payments WHERE provider_ref = ?', [$ref])) {
            $method = in_array('pix', (array) ($obj['payment_method_types'] ?? []), true) && !in_array('card', (array) ($obj['payment_method_types'] ?? []), true) ? 'pix' : 'card';
            Billing::recordPayment($pdo, $uid, $amount, $method, 'stripe', $ref);
            DB::run($pdo, "UPDATE user_stats SET sub_status = 'active', updated_at = ? WHERE user_id = ?", [DB::now(), $uid]);
        }
    } elseif ($evType === 'customer.subscription.deleted' && $user) {
        $now = DB::now();
        DB::run($pdo, "UPDATE subscriptions SET status = 'canceled', canceled_at = ? WHERE user_id = ? AND status = 'active'", [$now, $uid]);
        DB::run($pdo, "UPDATE user_stats SET sub_status = 'free', updated_at = ? WHERE user_id = ?", [$now, $uid]);
    }
    $log(true, true, null);
} catch (\Throwable $e) {
    error_log('[tfs-webhook] ' . $e->getMessage());
    $log(true, false, 'erro ao processar');
    Http::fail(500, 'server_error');
}
Http::json(['received' => true]);
