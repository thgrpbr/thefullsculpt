<?php
declare(strict_types=1);

/**
 * Instalador único do THE FULL SCULPT.
 * - Exige o token de instalação (só o hash fica no código).
 * - Você digita aqui os dados do MySQL; a senha NUNCA vai para o repositório.
 * - Grava tfs-config.php FORA do public_html e cria um lock: depois disso este arquivo recusa qualquer uso.
 */

require __DIR__ . '/lib/core.php';

use TFS\Auth;
use TFS\Config;
use TFS\DB;
use TFS\Schema;
use TFS\Seed;

const SETUP_TOKEN_SHA256 = 'c6c3e3891a30a721267cb9830cc1076e64010086c304419e9f21f146cd0220a4';

ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex');

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function page(string $body): never
{
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalação</title>'
        . '<style>body{font:16px/1.5 system-ui,sans-serif;background:#f6f3ee;color:#161514;margin:0;padding:32px}'
        . 'main{max-width:560px;margin:0 auto}h1{font-weight:400;letter-spacing:.2em;font-size:18px;text-transform:uppercase}'
        . 'label{display:block;margin:14px 0 4px;font-size:13px;color:#6b645c}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d8d2c8;border-radius:10px;font:inherit;background:#fff}'
        . 'button{margin-top:22px;padding:14px 26px;border:0;border-radius:999px;background:#161514;color:#f6f3ee;font:inherit;cursor:pointer}'
        . '.ok{color:#2a6b3a}.err{color:#b3261e}code{background:#efebe4;padding:2px 6px;border-radius:6px}li{margin:4px 0}</style><main>'
        . '<h1>THE FULL SCULPT · instalação</h1>' . $body . '</main>';
    exit;
}

if (is_file(Config::lockPath())) {
    http_response_code(403);
    page('<p>A instalação já foi concluída. Este instalador está desativado.</p>');
}

$checks = [
    'PHP 8.1 ou superior' => PHP_VERSION_ID >= 80100,
    'Extensão pdo_mysql' => extension_loaded('pdo_mysql'),
    'Extensão sodium (criptografia)' => extension_loaded('sodium'),
    'Extensão mbstring' => extension_loaded('mbstring'),
];
$envOk = !in_array(false, $checks, true);

$msgs = [];
$form = static function (array $v = []) use ($checks): string {
    $li = '';
    foreach ($checks as $k => $ok) {
        $li .= '<li class="' . ($ok ? 'ok' : 'err') . '">' . ($ok ? '✓ ' : '✗ ') . h($k) . '</li>';
    }
    $f = static fn(string $n, string $d = '') => h($v[$n] ?? $d);
    return '<ul>' . $li . '</ul><form method="post" autocomplete="off">'
        . '<label>Token de instalação</label><input name="token" type="password" required>'
        . '<label>Servidor MySQL</label><input name="host" value="' . $f('host', 'localhost') . '" required>'
        . '<label>Nome do banco</label><input name="dbname" value="' . $f('dbname') . '" required>'
        . '<label>Usuário do banco</label><input name="dbuser" value="' . $f('dbuser') . '" required>'
        . '<label>Senha do banco</label><input name="dbpass" type="password" required>'
        . '<hr style="margin:24px 0;border:0;border-top:1px solid #d8d2c8"><p>Administrador do sistema (opcional, para o futuro painel):</p>'
        . '<label>Nome</label><input name="aname" value="' . $f('aname') . '">'
        . '<label>E-mail</label><input name="aemail" type="email" value="' . $f('aemail') . '">'
        . '<label>Senha (mínimo 12 caracteres)</label><input name="apass" type="password">'
        . '<hr style="margin:24px 0;border:0;border-top:1px solid #d8d2c8">'
        . '<label style="display:flex;gap:10px;align-items:flex-start;margin:0;color:#161514"><input type="checkbox" name="seedtest" value="1" checked style="width:auto;margin-top:5px">'
        . '<span>Criar usuário de teste (<code>' . h(Seed::TEST_EMAIL) . '</code>) com dados fictícios: Fase 4, assinatura ativa e 14 aulas no histórico. A senha é gerada agora e aparece uma única vez. Para remover depois: entre com ele e use Perfil, Excluir minha conta.</span></label>'
        . '<button type="submit">Instalar</button></form>';
};

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    page($form());
}

// ---- POST ----
$in = static fn(string $k): string => trim((string) ($_POST[$k] ?? ''));
$token = (string) ($_POST['token'] ?? '');
if (!hash_equals(SETUP_TOKEN_SHA256, hash('sha256', $token))) {
    usleep(600000);
    http_response_code(403);
    page('<p class="err">Token inválido.</p>' . $form(['host' => $in('host'), 'dbname' => $in('dbname'), 'dbuser' => $in('dbuser')]));
}
if (!$envOk) {
    page('<p class="err">O servidor não atende aos requisitos acima.</p>');
}

$host = $in('host');
$dbname = $in('dbname');
$dbuser = $in('dbuser');
$dbpass = (string) ($_POST['dbpass'] ?? '');
$aemail = strtolower($in('aemail'));
$apass = (string) ($_POST['apass'] ?? '');
$aname = $in('aname');
$wantSeed = isset($_POST['seedtest']);
$seedPass = null;
$keep = ['host' => $host, 'dbname' => $dbname, 'dbuser' => $dbuser, 'aname' => $aname, 'aemail' => $aemail];

if (!preg_match('/^[A-Za-z0-9_.\-]+$/', $host) || !preg_match('/^[A-Za-z0-9_\-]+$/', $dbname)) {
    page('<p class="err">Servidor ou nome do banco com caracteres inválidos.</p>' . $form($keep));
}
$wantAdmin = $aemail !== '' || $apass !== '' || $aname !== '';
if ($wantAdmin && (!filter_var($aemail, FILTER_VALIDATE_EMAIL) || strlen($apass) < 12 || mb_strlen($aname) < 2)) {
    page('<p class="err">Para criar o administrador, informe nome, e-mail válido e senha com 12+ caracteres.</p>' . $form($keep));
}

try {
    $dsn = "mysql:host=$host;dbname=$dbname;charset=utf8mb4";
    $cfg = [
        'db' => ['dsn' => $dsn, 'user' => $dbuser, 'pass' => $dbpass],
        'key' => base64_encode(random_bytes(SODIUM_CRYPTO_SECRETBOX_KEYBYTES)),
        'pepper' => bin2hex(random_bytes(32)),
        'cookie_secure' => true,
        'allow_test_subscription' => true, // desligar quando o Stripe entrar
    ];
    $pdo = DB::pdo($cfg);
    Schema::install($pdo);
    if ($wantSeed) {
        $seedPass = Seed::password();
        Seed::testUser($pdo, $cfg, $seedPass);
    }
    if ($wantAdmin) {
        $exists = DB::one($pdo, 'SELECT id FROM users WHERE email = ?', [$aemail]);
        if (!$exists) {
            $now = DB::now();
            DB::run($pdo, 'INSERT INTO users (email, password_hash, name, role, locale, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [$aemail, Auth::hash($apass), $aname, 'admin', 'pt', $now]);
            DB::run($pdo, 'INSERT INTO user_stats (user_id, updated_at) VALUES (?, ?)', [(int) $pdo->lastInsertId(), $now]);
        }
    }
} catch (\Throwable $e) {
    error_log('[tfs-install] ' . $e->getMessage());
    page('<p class="err">Não consegui conectar ou criar as tabelas. Confira servidor, banco, usuário e senha.</p>' . $form($keep));
}

$creds = $seedPass === null ? '' : '<div style="margin:18px 0;padding:14px;border:1px solid #d8d2c8;border-radius:10px;background:#fff"><strong>Usuário de teste</strong><br>E-mail: <code>' . h(Seed::TEST_EMAIL) . '</code><br>Senha: <code>' . h($seedPass) . '</code><br><small>Anote agora: esta senha não será mostrada de novo.</small></div>';
$php = "<?php\n// Gerado pelo instalador. NÃO versionar, NÃO expor.\nreturn " . var_export($cfg, true) . ";\n";
$path = Config::path();
$written = @file_put_contents($path, $php, LOCK_EX) !== false;
if ($written) {
    @chmod($path, 0600);
    @file_put_contents(Config::lockPath(), gmdate('c') . "\n");
    page('<p class="ok">✓ Banco criado e configuração gravada fora do site público.</p><p>Instalação concluída. Este instalador está desativado.</p>' . $creds);
}
// Sem permissão de escrita fora do public_html: mostra o conteúdo uma única vez.
page('<p class="err">Não consegui gravar <code>' . h($path) . '</code>.</p><p>Crie esse arquivo manualmente (fora do <code>public_html</code>) com o conteúdo abaixo e depois crie o arquivo vazio <code>tfs-installed.lock</code> ao lado dele:</p><pre style="white-space:pre-wrap;word-break:break-all;background:#efebe4;padding:12px;border-radius:10px">' . h($php) . '</pre>' . $creds);
