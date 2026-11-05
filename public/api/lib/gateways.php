<?php
declare(strict_types=1);

namespace TFS;

use PDO;

/**
 * Gateways de pagamento (multi-empresa). Credenciais guardadas criptografadas; só a chave PÚBLICA é exposta ao checkout.
 * Provedores: Stripe, Mercado Pago, Pagar.me e Asaas (todos com cobrança recorrente no Brasil).
 */
final class Gateways
{
    public const CATALOG = [
        'stripe' => [
            'name' => 'Stripe', 'methods' => ['card', 'pix'],
            'fields' => [
                ['key' => 'secret_key', 'label' => 'Chave secreta (sk_… ou rk_…)', 'secret' => true],
                ['key' => 'public_key', 'label' => 'Chave publicável (pk_…)', 'secret' => false, 'public' => true],
                ['key' => 'webhook_secret', 'label' => 'Segredo do webhook (whsec_…)', 'secret' => true, 'optional' => true],
            ],
            'checkout' => 'Checkout transparente com Stripe Elements (Payment Element)',
            'recurring' => 'Assinaturas nativas. Pix recorrente depende de habilitação na conta.',
            'docs' => 'https://dashboard.stripe.com/apikeys',
        ],
        'mercadopago' => [
            'name' => 'Mercado Pago', 'methods' => ['card', 'pix'],
            'fields' => [
                ['key' => 'access_token', 'label' => 'Access Token', 'secret' => true],
                ['key' => 'public_key', 'label' => 'Public Key', 'secret' => false, 'public' => true],
                ['key' => 'webhook_secret', 'label' => 'Assinatura secreta do webhook', 'secret' => true, 'optional' => true],
            ],
            'checkout' => 'Checkout Transparente com MercadoPago.js / Bricks (cartão e Pix)',
            'recurring' => 'Assinaturas (preapproval) para cartão; Pix por cobrança mensal.',
            'docs' => 'https://www.mercadopago.com.br/developers/panel/app',
        ],
        'pagarme' => [
            'name' => 'Pagar.me', 'methods' => ['card', 'pix', 'boleto'],
            'fields' => [
                ['key' => 'secret_key', 'label' => 'Chave secreta (sk_…)', 'secret' => true],
                ['key' => 'public_key', 'label' => 'Chave pública (pk_…)', 'secret' => false, 'public' => true],
                ['key' => 'webhook_secret', 'label' => 'Usuário:senha do webhook (opcional)', 'secret' => true, 'optional' => true],
            ],
            'checkout' => 'Checkout transparente com tokenização do cartão no navegador',
            'recurring' => 'Planos e assinaturas nativos (cartão); Pix e boleto por cobrança.',
            'docs' => 'https://dash.pagar.me/',
        ],
        'asaas' => [
            'name' => 'Asaas', 'methods' => ['card', 'pix', 'boleto'],
            'fields' => [
                ['key' => 'api_key', 'label' => 'Chave de API ($aact_…)', 'secret' => true],
                ['key' => 'webhook_token', 'label' => 'Token de autenticação do webhook', 'secret' => true, 'optional' => true],
            ],
            'checkout' => 'Cobrança por API com cartão tokenizado e Pix dinâmico (QR Code)',
            'recurring' => 'Assinaturas recorrentes nativas (cartão, boleto e Pix).',
            'docs' => 'https://www.asaas.com/customerApiAccessToken/index',
        ],
    ];

    /** @return list<array<string,mixed>> */
    public static function catalog(): array
    {
        $out = [];
        foreach (self::CATALOG as $id => $c) {
            $out[] = ['provider' => $id] + $c;
        }
        return $out;
    }

    /** @return array<string,array<string,mixed>> campos por chave */
    public static function fieldMap(string $provider): array
    {
        $m = [];
        foreach (self::CATALOG[$provider]['fields'] ?? [] as $f) {
            $m[$f['key']] = $f;
        }
        return $m;
    }

    /** @param array<string,mixed> $cfg @return array<string,string> */
    public static function config(array $row, array $cfg): array
    {
        $plain = Crypto::dec((string) $row['config_enc'], $cfg);
        $j = $plain ? json_decode($plain, true) : null;
        return is_array($j) ? array_map('strval', $j) : [];
    }

    /** Visão segura (sem segredos) de um gateway. @param array<string,mixed> $row @param array<string,mixed> $cfg @return array<string,mixed> */
    public static function view(array $row, array $cfg): array
    {
        $conf = self::config($row, $cfg);
        $fields = [];
        foreach (self::CATALOG[$row['provider']]['fields'] ?? [] as $f) {
            $has = ($conf[$f['key']] ?? '') !== '';
            $fields[] = ['key' => $f['key'], 'label' => $f['label'], 'secret' => $f['secret'], 'has_value' => $has, 'value' => $f['secret'] ? null : ($conf[$f['key']] ?? '')];
        }
        return [
            'id' => (int) $row['id'], 'provider' => $row['provider'], 'label' => $row['label'], 'enabled' => (bool) $row['enabled'], 'is_default' => (bool) $row['is_default'],
            'priority' => (int) $row['priority'], 'mode' => $row['mode'], 'methods' => array_values(array_filter(explode(',', (string) $row['methods']))),
            'fields' => $fields, 'last_test_at' => $row['last_test_at'], 'last_test_ok' => $row['last_test_ok'] === null ? null : (bool) $row['last_test_ok'], 'last_test_msg' => $row['last_test_msg'],
            'created_at' => $row['created_at'],
        ];
    }

    /** @param list<string> $headers @return array{0:int,1:string} */
    public static function http(string $url, array $headers): array
    {
        $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => implode("\r\n", $headers), 'timeout' => 10, 'ignore_errors' => true]]);
        $body = @file_get_contents($url, false, $ctx);
        $status = 0;
        foreach ($http_response_header ?? [] as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) {
                $status = (int) $m[1];
            }
        }
        return [$status, $body === false ? '' : (string) $body];
    }

    /**
     * Testa as credenciais com uma chamada somente-leitura à API do provedor.
     *
     * @param array<string,string> $conf @param array<string,mixed> $cfg
     * @return array{ok:bool,msg:string}
     */
    public static function test(string $provider, string $mode, array $conf, array $cfg): array
    {
        $override = isset($cfg['gateway_test_base']) ? rtrim((string) $cfg['gateway_test_base'], '/') : null;
        $ua = 'User-Agent: THE-FULL-SCULPT/1.0';
        switch ($provider) {
            case 'stripe':
                $key = $conf['secret_key'] ?? '';
                if (!preg_match('/^(sk|rk)_(test|live)_/', $key, $m)) {
                    return ['ok' => false, 'msg' => 'A chave secreta deve começar com sk_test_ / sk_live_.'];
                }
                if (($m[2] === 'test') !== ($mode === 'sandbox')) {
                    return ['ok' => false, 'msg' => 'O modo escolhido não corresponde ao tipo da chave (teste × produção).'];
                }
                [$st] = self::http(($override ?? 'https://api.stripe.com') . '/v1/balance', ["Authorization: Bearer $key", $ua]);
                break;
            case 'mercadopago':
                $tok = $conf['access_token'] ?? '';
                if ($tok === '') {
                    return ['ok' => false, 'msg' => 'Informe o Access Token.'];
                }
                [$st] = self::http(($override ?? 'https://api.mercadopago.com') . '/users/me', ["Authorization: Bearer $tok", $ua]);
                break;
            case 'pagarme':
                $key = $conf['secret_key'] ?? '';
                if (!preg_match('/^sk_/', $key)) {
                    return ['ok' => false, 'msg' => 'A chave secreta do Pagar.me começa com sk_.'];
                }
                [$st] = self::http(($override ?? 'https://api.pagar.me') . '/core/v5/orders?size=1', ['Authorization: Basic ' . base64_encode($key . ':'), $ua]);
                break;
            case 'asaas':
                $key = $conf['api_key'] ?? '';
                if ($key === '') {
                    return ['ok' => false, 'msg' => 'Informe a chave de API.'];
                }
                $base = $mode === 'live' ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';
                [$st] = self::http(($override ?? $base) . '/finance/balance', ["access_token: $key", $ua]);
                break;
            default:
                return ['ok' => false, 'msg' => 'Provedor desconhecido.'];
        }
        if ($st === 200) {
            return ['ok' => true, 'msg' => 'Conexão autenticada com sucesso.'];
        }
        if ($st === 401 || $st === 403) {
            return ['ok' => false, 'msg' => 'Credenciais recusadas pelo provedor.'];
        }
        if ($st === 0) {
            return ['ok' => false, 'msg' => 'Não foi possível alcançar o provedor (rede ou bloqueio).'];
        }
        return ['ok' => false, 'msg' => "Resposta inesperada do provedor (HTTP $st)."];
    }

    /** Gateways ativos, na ordem de uso (padrão primeiro). @return list<array<string,mixed>> */
    public static function active(PDO $pdo): array
    {
        return DB::all($pdo, 'SELECT * FROM payment_gateways WHERE enabled = 1 ORDER BY is_default DESC, priority ASC, id ASC');
    }
}
