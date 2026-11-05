<?php
declare(strict_types=1);

/**
 * Webhooks dos gateways (públicos, sem cookie/CSRF). Toda chamada é registrada em webhook_events.
 * Cada provedor é verificado do seu jeito e normalizado para dois eventos internos: "pago" e "assinatura cancelada".
 * Para o webhook ser processado é preciso ter o segredo/token do webhook cadastrado no gateway (Admin > Gateways).
 *
 * Convenção para o checkout (a ser montado quando o parceiro for escolhido): enviar o ID do aluno
 *   Stripe/Pagar.me -> metadata.user_id · Mercado Pago/Asaas -> external_reference / externalReference.
 *
 * ATENÇÃO: os formatos de Mercado Pago, Pagar.me e Asaas seguem a documentação pública de cada um, mas só foram
 * exercitados com simuladores; valide cada provedor no ambiente sandbox assim que as credenciais existirem.
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
$event = is_array($event) ? $event : [];
$evId = mb_substr((string) ($event['id'] ?? ''), 0, 80);
$evType = mb_substr((string) ($event['type'] ?? ($event['action'] ?? $event['event'] ?? '')), 0, 60);

$log = static function (bool $valid, bool $processed, ?string $error) use ($pdo, $provider, &$evId, &$evType, $raw): void {
    DB::run($pdo, 'INSERT INTO webhook_events (provider, event_id, type, valid, processed, error, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$provider, $evId ?: null, $evType ?: null, $valid ? 1 : 0, $processed ? 1 : 0, $error, mb_substr($raw, 0, 60000), DB::now()]);
};
$gateways = DB::all($pdo, 'SELECT * FROM payment_gateways WHERE provider = ? AND enabled = 1', [$provider]);

/** Valor decimal em reais (número ou string) -> centavos. */
$cents = static fn(mixed $v): int => (int) round(((float) $v) * 100);
$hdr = static fn(string $name): string => (string) ($_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $name))] ?? '');

/**
 * Normalizado: ['kind' => 'paid'|'canceled', 'uid' => int, 'cents' => int, 'method' => string, 'ref' => string] ou null (evento ignorado).
 * Lança \RuntimeException('invalid') se a assinatura/autenticação não confere.
 */
$normalize = static function () use ($provider, $gateways, $event, $raw, $cfg, $cents, $hdr, &$evId, &$evType): ?array {
    $verified = false;
    $usedConf = [];
    $usedMode = 'sandbox';

    if ($provider === 'stripe') {
        $t = null;
        $v1 = [];
        foreach (explode(',', $hdr('Stripe-Signature')) as $part) {
            [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($k === 't') {
                $t = (int) $v;
            } elseif ($k === 'v1') {
                $v1[] = $v;
            }
        }
        if ($t && abs(time() - $t) <= 300 && $v1) {
            foreach ($gateways as $g) {
                $secret = Gateways::config($g, $cfg)['webhook_secret'] ?? '';
                $expected = $secret !== '' ? hash_hmac('sha256', $t . '.' . $raw, $secret) : '';
                foreach ($v1 as $sig) {
                    $verified = $verified || ($expected !== '' && hash_equals($expected, $sig));
                }
            }
        }
    } elseif ($provider === 'asaas') {
        $tok = $hdr('Asaas-Access-Token');
        foreach ($gateways as $g) {
            $want = Gateways::config($g, $cfg)['webhook_token'] ?? '';
            if ($want !== '' && $tok !== '' && hash_equals($want, $tok)) {
                $verified = true;
            }
        }
    } elseif ($provider === 'pagarme') {
        // Basic user:senha — cada servidor expõe o cabeçalho de um jeito (HTTP_AUTHORIZATION, REDIRECT_…, PHP_AUTH_*, getallheaders)
        $given = '';
        $auth = $hdr('Authorization') ?: (string) ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if ($auth === '' && function_exists('getallheaders')) {
            foreach (getallheaders() as $hk => $hv) {
                if (strcasecmp((string) $hk, 'Authorization') === 0) {
                    $auth = (string) $hv;
                }
            }
        }
        if (str_starts_with($auth, 'Basic ')) {
            $given = (string) base64_decode(substr($auth, 6), true);
        } elseif (isset($_SERVER['PHP_AUTH_USER'])) {
            $given = $_SERVER['PHP_AUTH_USER'] . ':' . ($_SERVER['PHP_AUTH_PW'] ?? '');
        }
        foreach ($gateways as $g) {
            $want = Gateways::config($g, $cfg)['webhook_secret'] ?? '';
            if ($want !== '' && $given !== '' && hash_equals($want, $given)) {
                $verified = true;
            }
        }
    } elseif ($provider === 'mercadopago') {
        // x-signature: "ts=...,v1=..." ; manifesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
        $ts = '';
        $v1 = '';
        foreach (explode(',', $hdr('X-Signature')) as $part) {
            [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($k === 'ts') {
                $ts = $v;
            } elseif ($k === 'v1') {
                $v1 = $v;
            }
        }
        $dataId = strtolower((string) ($_GET['data_id'] ?? $_GET['data.id'] ?? ($event['data']['id'] ?? '')));
        foreach ($gateways as $g) {
            $secret = Gateways::config($g, $cfg)['webhook_secret'] ?? '';
            if ($secret !== '' && $ts !== '' && $v1 !== '' && hash_equals(hash_hmac('sha256', "id:$dataId;request-id:" . $hdr('X-Request-Id') . ";ts:$ts;", $secret), $v1)) {
                $verified = true;
                $usedConf = Gateways::config($g, $cfg);
                $usedMode = (string) $g['mode'];
            }
        }
    }
    if (!$verified) {
        throw new \RuntimeException('invalid');
    }

    $methodOf = static fn(string $s): string => match (true) {
        str_contains($s, 'pix') || $s === 'bank_transfer' => 'pix',
        str_contains($s, 'boleto') || $s === 'ticket' => 'boleto',
        default => 'card',
    };

    if ($provider === 'stripe') {
        $obj = is_array($event['data']['object'] ?? null) ? $event['data']['object'] : [];
        $uid = (int) ($obj['metadata']['user_id'] ?? $obj['subscription_details']['metadata']['user_id'] ?? 0);
        if (in_array($evType, ['invoice.paid', 'payment_intent.succeeded'], true)) {
            $types = (array) ($obj['payment_method_types'] ?? []);
            return ['kind' => 'paid', 'uid' => $uid, 'cents' => (int) ($obj['amount_paid'] ?? $obj['amount_received'] ?? $obj['amount'] ?? 0),
                'method' => in_array('pix', $types, true) && !in_array('card', $types, true) ? 'pix' : 'card', 'ref' => mb_substr((string) ($obj['id'] ?? $evId), 0, 80)];
        }
        return $evType === 'customer.subscription.deleted' ? ['kind' => 'canceled', 'uid' => $uid, 'cents' => 0, 'method' => 'card', 'ref' => ''] : null;
    }

    if ($provider === 'asaas') {
        $pay = is_array($event['payment'] ?? null) ? $event['payment'] : [];
        $sub = is_array($event['subscription'] ?? null) ? $event['subscription'] : [];
        if (in_array($evType, ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'], true)) {
            return ['kind' => 'paid', 'uid' => (int) ($pay['externalReference'] ?? 0), 'cents' => $cents($pay['value'] ?? 0),
                'method' => $methodOf(strtolower((string) ($pay['billingType'] ?? 'credit_card'))), 'ref' => 'asaas_' . mb_substr((string) ($pay['id'] ?? $evId), 0, 70)];
        }
        return in_array($evType, ['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'], true)
            ? ['kind' => 'canceled', 'uid' => (int) ($sub['externalReference'] ?? 0), 'cents' => 0, 'method' => 'card', 'ref' => ''] : null;
    }

    if ($provider === 'pagarme') {
        $d = is_array($event['data'] ?? null) ? $event['data'] : [];
        $uid = (int) ($d['metadata']['user_id'] ?? 0);
        if (in_array($evType, ['order.paid', 'charge.paid'], true)) {
            $ch = is_array($d['charges'][0] ?? null) ? $d['charges'][0] : [];
            return ['kind' => 'paid', 'uid' => $uid, 'cents' => (int) ($d['amount'] ?? 0),
                'method' => $methodOf((string) ($d['payment_method'] ?? $ch['payment_method'] ?? 'credit_card')), 'ref' => 'pagarme_' . mb_substr((string) ($d['id'] ?? $evId), 0, 66)];
        }
        return $evType === 'subscription.canceled' ? ['kind' => 'canceled', 'uid' => $uid, 'cents' => 0, 'method' => 'card', 'ref' => ''] : null;
    }

    // Mercado Pago: a notificação traz só o id; os detalhes vêm da API do provedor (com o Access Token).
    $dataId = preg_replace('/[^0-9A-Za-z_-]/', '', (string) ($event['data']['id'] ?? ''));
    $tok = $usedConf['access_token'] ?? '';
    if ($dataId === '' || $tok === '') {
        return null;
    }
    $base = isset($cfg['gateway_test_base']) ? rtrim((string) $cfg['gateway_test_base'], '/') : 'https://api.mercadopago.com';
    $kind = (string) ($event['type'] ?? explode('.', $evType)[0]);
    if ($kind === 'payment') {
        [$st, $body] = Gateways::http("$base/v1/payments/$dataId", ["Authorization: Bearer $tok", 'User-Agent: THE-FULL-SCULPT/1.0']);
        $p = json_decode($body, true);
        if ($st !== 200 || !is_array($p)) {
            throw new \RuntimeException('fetch_failed');
        }
        return ($p['status'] ?? '') === 'approved'
            ? ['kind' => 'paid', 'uid' => (int) ($p['external_reference'] ?? 0), 'cents' => $cents($p['transaction_amount'] ?? 0), 'method' => $methodOf((string) ($p['payment_type_id'] ?? 'credit_card')), 'ref' => 'mp_' . $dataId]
            : null;
    }
    if (in_array($kind, ['subscription_preapproval', 'preapproval'], true)) {
        [$st, $body] = Gateways::http("$base/preapproval/$dataId", ["Authorization: Bearer $tok", 'User-Agent: THE-FULL-SCULPT/1.0']);
        $p = json_decode($body, true);
        if ($st !== 200 || !is_array($p)) {
            throw new \RuntimeException('fetch_failed');
        }
        return ($p['status'] ?? '') === 'cancelled' ? ['kind' => 'canceled', 'uid' => (int) ($p['external_reference'] ?? 0), 'cents' => 0, 'method' => 'card', 'ref' => ''] : null;
    }
    return null;
};

try {
    $norm = $normalize();
} catch (\RuntimeException $e) {
    if ($e->getMessage() === 'fetch_failed') {
        $log(true, false, 'não foi possível consultar o provedor');
        Http::fail(502, 'provider_unreachable');   // o provedor reenviará
    }
    $log(false, false, 'assinatura/autenticação inválida');
    Http::fail(400, 'invalid_signature');
}
if ($evId !== '' && DB::one($pdo, 'SELECT id FROM webhook_events WHERE provider = ? AND event_id = ? AND processed = 1', [$provider, $evId])) {
    Http::json(['received' => true, 'duplicate' => true]);
}

try {
    $user = $norm && $norm['uid'] > 0 ? DB::one($pdo, "SELECT id FROM users WHERE id = ? AND role = 'student'", [$norm['uid']]) : null;
    if ($norm && $user) {
        $uid = (int) $norm['uid'];
        if ($norm['kind'] === 'paid') {
            if ($norm['cents'] > 0 && !DB::one($pdo, 'SELECT id FROM payments WHERE provider_ref = ?', [$norm['ref']])) {
                Billing::recordPayment($pdo, $uid, $norm['cents'], $norm['method'], $provider, $norm['ref']);
                DB::run($pdo, "UPDATE user_stats SET sub_status = 'active', updated_at = ? WHERE user_id = ?", [DB::now(), $uid]);
            }
        } else {
            $now = DB::now();
            DB::run($pdo, "UPDATE subscriptions SET status = 'canceled', canceled_at = ? WHERE user_id = ? AND status = 'active'", [$now, $uid]);
            DB::run($pdo, "UPDATE user_stats SET sub_status = 'free', updated_at = ? WHERE user_id = ?", [$now, $uid]);
        }
    }
    $log(true, true, $norm && !$user ? 'aluno não identificado no evento (external_reference/metadata.user_id)' : null);
} catch (\Throwable $e) {
    error_log('[tfs-webhook] ' . $e->getMessage());
    $log(true, false, 'erro ao processar');
    Http::fail(500, 'server_error');
}
Http::json(['received' => true]);
