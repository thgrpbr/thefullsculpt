<?php
declare(strict_types=1);

/**
 * Configurações técnicas do admin: SMTP e Banco de Dados. Incluído por routes/admin.php (admin já autenticado).
 * Variáveis no escopo: $pdo, $cfg, $method, $path, $admin, $aid, $route.
 */

use TFS\Audit;
use TFS\Config;
use TFS\Crypto;
use TFS\DB;
use TFS\Http;
use TFS\Mailer;
use TFS\Migrator;
use TFS\Schema;
use TFS\Settings;

/** @return array<string,mixed> */
$smtpPublic = static function (PDO $pdo): array {
    $s = Settings::all($pdo)['smtp'];
    $has = $s['pass_enc'] !== '';
    unset($s['pass_enc']);
    return $s + ['has_password' => $has, 'configured' => $s['host'] !== '' && $s['from_email'] !== ''];
};

/** Valida e normaliza os campos SMTP enviados. @param array<string,mixed> $b @param array<string,mixed> $old @return array<string,mixed> */
$smtpFrom = static function (array $b, array $old) use ($cfg): array {
    $host = trim((string) ($b['host'] ?? ''));
    $port = $b['port'] ?? 587;
    $secure = (string) ($b['secure'] ?? 'tls');
    $from = trim((string) ($b['from_email'] ?? ''));
    $reply = trim((string) ($b['reply_to'] ?? ''));
    $url = rtrim(trim((string) ($b['public_url'] ?? $old['public_url'])), '/');
    if (($host !== '' && !preg_match('/^[A-Za-z0-9.\\-]{3,190}$/', $host)) || !is_int($port) || $port < 1 || $port > 65535 || !in_array($secure, ['ssl', 'tls', 'none'], true)) {
        Http::fail(422, 'invalid_smtp');
    }
    if (($from !== '' && !filter_var($from, FILTER_VALIDATE_EMAIL)) || ($reply !== '' && !filter_var($reply, FILTER_VALIDATE_EMAIL))) {
        Http::fail(422, 'invalid_smtp');
    }
    if ($url !== '' && !preg_match('#^https://[a-z0-9.-]+(:\\d+)?$#i', $url)) {
        Http::fail(422, 'invalid_url');
    }
    $pass = $b['password'] ?? null;
    $passEnc = $old['pass_enc'];
    if (is_string($pass) && $pass !== '') {
        $passEnc = Crypto::enc($pass, $cfg);
    } elseif (($b['clear_password'] ?? false) === true) {
        $passEnc = '';
    }
    return [
        'enabled' => ($b['enabled'] ?? false) === true, 'host' => $host, 'port' => $port, 'secure' => $secure,
        'user' => mb_substr(trim((string) ($b['user'] ?? '')), 0, 190), 'pass_enc' => $passEnc,
        'from_email' => $from, 'from_name' => mb_substr(trim((string) ($b['from_name'] ?? 'THE FULL SCULPT')), 0, 80) ?: 'THE FULL SCULPT',
        'reply_to' => $reply, 'verify_tls' => ($b['verify_tls'] ?? true) !== false, 'public_url' => $url !== '' ? $url : $old['public_url'],
    ];
};

/* ---------------- SMTP ---------------- */
if ($route === 'GET /admin/smtp') {
    Http::json($smtpPublic($pdo));
}
if ($route === 'PUT /admin/smtp') {
    $new = $smtpFrom(Http::body(), Settings::all($pdo)['smtp']);
    if ($new['enabled'] && ($new['host'] === '' || $new['from_email'] === '')) {
        Http::fail(422, 'smtp_incomplete');
    }
    Settings::set($pdo, 'smtp', $new);
    Audit::log($pdo, $cfg, $aid, 'admin_smtp_updated', $new['enabled'] ? 'enabled' : 'disabled');
    Http::json($smtpPublic($pdo));
}
if ($route === 'POST /admin/smtp/test') {
    if (!TFS\Rate::hit($pdo, "smtptest:$aid", 10, 600)) {
        Http::fail(429, 'rate_limited');
    }
    $b = Http::body();
    $to = trim((string) ($b['to'] ?? $admin['email']));
    $old = Settings::all($pdo)['smtp'];
    // Permite testar os valores digitados ANTES de salvar (senha em branco = usa a salva).
    $use = isset($b['host']) ? $smtpFrom($b, $old) : $old;
    $use['password'] = (isset($b['password']) && $b['password'] !== '') ? (string) $b['password'] : ($use['pass_enc'] !== '' ? (Crypto::dec((string) $use['pass_enc'], $cfg) ?? '') : '');
    [$subject, $html, $text] = Mailer::template($pdo, 'test', 'pt', []);
    $r = Mailer::send($pdo, $cfg, $to, $subject, $html, $text, $use);
    Audit::log($pdo, $cfg, $aid, 'admin_smtp_test', $r['ok'] ? 'ok' : 'fail');
    Http::json(['ok' => $r['ok'], 'error' => $r['error'], 'log' => $r['log']]);
}

/* ---------------- Banco de dados ---------------- */
$dbInfo = static function (PDO $pdo, array $cfg): array {
    $dsn = (string) $cfg['db']['dsn'];
    $driver = DB::driver($pdo);
    preg_match('/host=([^;]+)/', $dsn, $mh);
    preg_match('/dbname=([^;]+)/', $dsn, $md);
    $t0 = microtime(true);
    $pdo->query('SELECT 1')->fetch();
    $latency = round((microtime(true) - $t0) * 1000, 1);
    $version = $driver === 'sqlite' ? (string) DB::one($pdo, 'SELECT sqlite_version() AS v')['v'] : (string) DB::one($pdo, 'SELECT VERSION() AS v')['v'];
    $tables = [];
    if ($driver === 'sqlite') {
        foreach (DB::all($pdo, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as $r) {
            $tables[] = ['name' => $r['name'], 'rows' => (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM "' . str_replace('"', '', $r['name']) . '"')['n'], 'kb' => null];
        }
    } else {
        foreach (DB::all($pdo, 'SELECT table_name AS t, table_rows AS r, ROUND((data_length + index_length) / 1024) AS kb FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name') as $r) {
            $tables[] = ['name' => $r['t'], 'rows' => (int) $r['r'], 'kb' => (int) $r['kb']];
        }
    }
    $path = Config::path();
    return [
        'driver' => $driver, 'host' => $mh[1] ?? ($driver === 'sqlite' ? 'arquivo local' : '–'), 'database' => $md[1] ?? basename($dsn),
        'user' => $driver === 'sqlite' ? '–' : (string) ($cfg['db']['user'] ?? ''), 'version' => $version, 'latency_ms' => $latency,
        'schema' => Migrator::version($pdo), 'latest_schema' => Migrator::LATEST, 'tables' => $tables,
        'total_kb' => array_sum(array_map(static fn($t) => (int) ($t['kb'] ?? 0), $tables)),
        'config_writable' => is_writable(dirname($path)) && (!is_file($path) || is_writable($path)), 'config_file' => basename($path),
    ];
};

/** Conecta ao MySQL informado (tempo limite curto) e devolve [PDO|null, erro]. @param array<string,mixed> $b @return array{0:?PDO,1:?string,2:array<string,string>} */
$dbConnect = static function (array $b): array {
    $host = trim((string) ($b['host'] ?? ''));
    $name = trim((string) ($b['dbname'] ?? ''));
    $user = trim((string) ($b['user'] ?? ''));
    $pass = (string) ($b['password'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_.\\-]{1,190}$/', $host) || !preg_match('/^[A-Za-z0-9_\\-]{1,64}$/', $name) || $user === '' || mb_strlen($user) > 64) {
        return [null, 'Servidor, banco ou usuário com formato inválido.', []];
    }
    try {
        $dsn = "mysql:host=$host;dbname=$name;charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_TIMEOUT => 8]);
        $pdo->exec("SET time_zone = '+00:00'");
        return [$pdo, null, ['dsn' => $dsn, 'user' => $user, 'pass' => $pass]];
    } catch (\Throwable $e) {
        error_log('[tfs-db-test] ' . $e->getMessage());
        return [null, 'Não foi possível conectar. Confira servidor, banco, usuário e senha.', []];
    }
};

if ($route === 'GET /admin/database') {
    Http::json($dbInfo($pdo, $cfg));
}
if ($route === 'POST /admin/database/test') {
    if (!TFS\Rate::hit($pdo, "dbtest:$aid", 10, 600)) {
        Http::fail(429, 'rate_limited');
    }
    [$np, $err] = $dbConnect(Http::body());
    if (!$np) {
        Http::json(['ok' => false, 'error' => $err]);
    }
    $has = DB::one($np, "SHOW TABLES LIKE 'users'") !== null;
    $users = $has ? (int) DB::one($np, 'SELECT COUNT(*) AS n FROM users')['n'] : 0;
    Http::json(['ok' => true, 'version' => (string) DB::one($np, 'SELECT VERSION() AS v')['v'], 'hasSchema' => $has, 'users' => $users]);
}
if ($route === 'PUT /admin/database') {
    // Troca das credenciais do banco: exige a senha do admin, testa a conexão antes e guarda cópia (.bak) do config.
    if (!TFS\Rate::hit($pdo, "dbsave:$aid", 5, 3600)) {
        Http::fail(429, 'rate_limited');
    }
    $b = Http::body();
    if (!password_verify((string) ($b['admin_password'] ?? ''), (string) $admin['password_hash'])) {
        Http::fail(401, 'invalid_credentials');
    }
    [$np, $err, $creds] = $dbConnect($b);
    if (!$np) {
        Http::json(['ok' => false, 'error' => $err], 422);
    }
    $has = DB::one($np, "SHOW TABLES LIKE 'users'") !== null;
    if (!$has) {
        if (($b['confirm_empty'] ?? false) !== true) {
            Http::json(['ok' => false, 'error' => 'O banco de destino está vazio. Confirme para criar as tabelas nele (os dados atuais NÃO são copiados).', 'needsConfirm' => true], 409);
        }
        Schema::install($np);
        Migrator::run($np, true);
    } else {
        Migrator::run($np, true);
    }
    $path = Config::path();
    $dir = dirname($path);
    if (!is_writable($dir) || (is_file($path) && !is_writable($path))) {
        Http::json(['ok' => false, 'error' => 'O arquivo de configuração não é gravável pelo servidor. Edite-o manualmente.'], 500);
    }
    $new = $cfg;
    $new['db'] = ['dsn' => $creds['dsn'], 'user' => $creds['user'], 'pass' => $creds['pass']];
    $php = "<?php\n// Gerado pelo painel. NÃO versionar, NÃO expor.\nreturn " . var_export($new, true) . ";\n";
    if (is_file($path)) {
        @copy($path, $path . '.bak');
        @chmod($path . '.bak', 0600);
    }
    $tmp = $path . '.new';
    if (@file_put_contents($tmp, $php, LOCK_EX) === false || !@rename($tmp, $path)) {
        @unlink($tmp);
        Http::json(['ok' => false, 'error' => 'Não foi possível gravar o novo arquivo de configuração.'], 500);
    }
    @chmod($path, 0600);
    // auditoria no banco ATUAL (ainda é o que esta requisição usa)
    Audit::log($pdo, $cfg, $aid, 'admin_database_changed', ($b['host'] ?? '') . '/' . ($b['dbname'] ?? ''));
    Http::json(['ok' => true, 'note' => $has ? 'Credenciais atualizadas. As próximas requisições já usam o novo banco.' : 'Novo banco inicializado e ativado. Os usuários e dados do banco anterior não foram copiados.']);
}
