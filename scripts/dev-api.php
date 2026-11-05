<?php
declare(strict_types=1);

/**
 * Helpers de desenvolvimento/teste da API (NÃO vão para produção: ficam fora de public/).
 *   php scripts/dev-api.php init <config.php> <db.sqlite>   cria config + banco SQLite de teste
 *   (servidor) php -S 127.0.0.1:8081 scripts/dev-api.php     roteia /api/* para public/api/index.php
 */

if (PHP_SAPI === 'cli') {
    [$self, $cmd, $cfgPath, $dbPath] = $argv + [null, null, null, null];
    if ($cmd !== 'init' || !$cfgPath || !$dbPath) {
        fwrite(STDERR, "uso: php dev-api.php init <config.php> <db.sqlite>\n");
        exit(1);
    }
    require __DIR__ . '/../public/api/lib/core.php';
    @unlink($dbPath);
    $cfg = [
        'db' => ['dsn' => 'sqlite:' . $dbPath],
        'key' => base64_encode(random_bytes(SODIUM_CRYPTO_SECRETBOX_KEYBYTES)),
        'pepper' => bin2hex(random_bytes(16)),
        'cookie_secure' => false,
        'allow_test_subscription' => true,
        'allowed_origins' => ['http://localhost:3000', 'http://localhost:3001'],
    ];
    file_put_contents($cfgPath, "<?php\nreturn " . var_export($cfg, true) . ";\n");
    putenv("TFS_CONFIG=$cfgPath");
    TFS\Schema::install(TFS\DB::pdo($cfg));
    echo "ok\n";
    exit(0);
}

// roteador do servidor embutido
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (str_starts_with((string) $path, '/api')) {
    require __DIR__ . '/../public/api/index.php';
    return true;
}
http_response_code(404);
echo 'not found';
