<?php
declare(strict_types=1);

namespace TFS;

use PDO;

/* ============================================================
 * Núcleo da API THE FULL SCULPT (PHP 8.1+, MySQL/MariaDB).
 * Segredos ficam FORA do public_html (tfs-config.php).
 * ============================================================ */

final class Config
{
    public static function path(): string
    {
        $env = getenv('TFS_CONFIG');
        if ($env !== false && $env !== '') {
            return $env;
        }
        // .../site/public_html/api/lib -> .../site/tfs-config.php
        return dirname(__DIR__, 3) . '/tfs-config.php';
    }

    public static function lockPath(): string
    {
        return dirname(self::path()) . '/tfs-installed.lock';
    }

    /** @return array<string,mixed>|null */
    public static function load(): ?array
    {
        $p = self::path();
        if (!is_file($p)) {
            return null;
        }
        $cfg = require $p;
        return is_array($cfg) ? $cfg : null;
    }
}

final class Http
{
    /** @param array<string,mixed> $data */
    public static function json(array $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function fail(int $status, string $code): never
    {
        self::json(['error' => $code], $status);
    }

    /** @return array<string,mixed> */
    public static function body(): array
    {
        $raw = file_get_contents('php://input', false, null, 0, 65537);
        if ($raw === false || $raw === '') {
            return [];
        }
        if (strlen($raw) > 65536) {
            self::fail(413, 'too_large');
        }
        try {
            $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            self::fail(400, 'invalid_json');
        }
        return is_array($data) ? $data : [];
    }

    /** Proteção CSRF: cabeçalho customizado + Origin igual ao host + JSON. */
    /** @param list<string> $allowedOrigins origens extras (somente desenvolvimento) */
    public static function guardWrite(array $allowedOrigins = []): void
    {
        $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (!in_array($m, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return;
        }
        if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'tfs') {
            self::fail(403, 'forbidden');
        }
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '') {
            $oh = strtolower((string) parse_url($origin, PHP_URL_HOST));
            $op = parse_url($origin, PHP_URL_PORT);
            $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
            $oc = $op ? "$oh:$op" : $oh;
            if ($oc !== $host && $oh !== $host && !in_array(rtrim($origin, '/'), $allowedOrigins, true)) {
                self::fail(403, 'forbidden');
            }
        }
        $ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
        if ($ct !== '' && !str_contains($ct, 'application/json')) {
            self::fail(415, 'unsupported_media_type');
        }
    }

    public static function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }
}

final class DB
{
    private static ?PDO $pdo = null;

    /** @param array<string,mixed> $cfg */
    public static function pdo(array $cfg): PDO
    {
        if (self::$pdo) {
            return self::$pdo;
        }
        $db = $cfg['db'];
        $opts = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        $pdo = new PDO($db['dsn'], $db['user'] ?? null, $db['pass'] ?? null, $opts);
        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            $pdo->exec('PRAGMA foreign_keys = ON');
        } else {
            $pdo->exec("SET time_zone = '+00:00'");
        }
        return self::$pdo = $pdo;
    }

    public static function driver(PDO $pdo): string
    {
        return (string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    }

    public static function now(): string
    {
        return gmdate('Y-m-d H:i:s');
    }

    /** @param array<int|string,mixed> $params */
    public static function one(PDO $pdo, string $sql, array $params = []): ?array
    {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $row = $st->fetch();
        return $row === false ? null : $row;
    }

    /** @param array<int|string,mixed> $params @return list<array<string,mixed>> */
    public static function all(PDO $pdo, string $sql, array $params = []): array
    {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    /** @param array<int|string,mixed> $params */
    public static function run(PDO $pdo, string $sql, array $params = []): int
    {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }
}

final class Crypto
{
    /** @param array<string,mixed> $cfg */
    private static function key(array $cfg): string
    {
        $k = base64_decode((string) ($cfg['key'] ?? ''), true);
        if ($k === false || strlen($k) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
            throw new \RuntimeException('bad_key');
        }
        return $k;
    }

    /** @param array<string,mixed> $cfg */
    public static function enc(string $plain, array $cfg): string
    {
        $n = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($n . sodium_crypto_secretbox($plain, $n, self::key($cfg)));
    }

    /** @param array<string,mixed> $cfg */
    public static function dec(string $b64, array $cfg): ?string
    {
        $raw = base64_decode($b64, true);
        $nl = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
        if ($raw === false || strlen($raw) <= $nl) {
            return null;
        }
        $out = sodium_crypto_secretbox_open(substr($raw, $nl), substr($raw, 0, $nl), self::key($cfg));
        return $out === false ? null : $out;
    }

    /** Hash do IP (minimização de dados — LGPD). @param array<string,mixed> $cfg */
    public static function ipHash(array $cfg): string
    {
        return hash_hmac('sha256', Http::ip(), (string) ($cfg['pepper'] ?? ''));
    }
}

final class Rate
{
    /** @return bool true se ainda dentro do limite */
    public static function hit(PDO $pdo, string $key, int $max, int $windowSec): bool
    {
        $win = intdiv(time(), $windowSec);
        $k = hash('sha256', $key);
        $row = DB::one($pdo, 'SELECT hits FROM rate_limits WHERE k = ? AND win = ?', [$k, $win]);
        if ($row) {
            if ((int) $row['hits'] >= $max) {
                return false;
            }
            DB::run($pdo, 'UPDATE rate_limits SET hits = hits + 1 WHERE k = ? AND win = ?', [$k, $win]);
        } else {
            DB::run($pdo, 'INSERT INTO rate_limits (k, win, hits) VALUES (?, ?, 1)', [$k, $win]);
            if (random_int(1, 50) === 1) {
                DB::run($pdo, 'DELETE FROM rate_limits WHERE win < ?', [$win - 4]);
            }
        }
        return true;
    }
}

final class Audit
{
    /** @param array<string,mixed> $cfg */
    public static function log(PDO $pdo, array $cfg, ?int $userId, string $action, string $meta = ''): void
    {
        DB::run(
            $pdo,
            'INSERT INTO audit_log (user_id, action, ip_hash, meta, created_at) VALUES (?, ?, ?, ?, ?)',
            [$userId, $action, Crypto::ipHash($cfg), mb_substr($meta, 0, 200), DB::now()],
        );
    }
}

final class Auth
{
    public const COOKIE = 'tfs_session';
    public const TTL = 2592000; // 30 dias

    /** @param array<string,mixed> $cfg */
    private static function setCookie(string $value, int $expires, array $cfg): void
    {
        setcookie(self::COOKIE, $value, [
            'expires' => $expires,
            'path' => '/',
            'secure' => (bool) ($cfg['cookie_secure'] ?? true),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    /** @param array<string,mixed> $cfg */
    public static function start(PDO $pdo, array $cfg, int $userId): void
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $now = time();
        DB::run(
            $pdo,
            'INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at, ip_hash, ua) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                $userId,
                hash('sha256', $token),
                gmdate('Y-m-d H:i:s', $now),
                gmdate('Y-m-d H:i:s', $now + self::TTL),
                gmdate('Y-m-d H:i:s', $now),
                Crypto::ipHash($cfg),
                mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
            ],
        );
        self::setCookie($token, $now + self::TTL, $cfg);
    }

    /** @param array<string,mixed> $cfg @return array<string,mixed>|null */
    public static function user(PDO $pdo, array $cfg): ?array
    {
        $token = $_COOKIE[self::COOKIE] ?? '';
        if (!is_string($token) || $token === '' || strlen($token) > 100) {
            return null;
        }
        $row = DB::one(
            $pdo,
            'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL AND u.status = ?',
            [hash('sha256', $token), DB::now(), 'active'],
        );
        return $row;
    }

    /** @param array<string,mixed> $cfg */
    public static function logout(PDO $pdo, array $cfg): void
    {
        $token = $_COOKIE[self::COOKIE] ?? '';
        if (is_string($token) && $token !== '') {
            DB::run($pdo, 'DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', $token)]);
        }
        self::setCookie('', time() - 3600, $cfg);
    }

    public static function hash(string $password): string
    {
        $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        return password_hash($password, $algo);
    }
}

final class Game
{
    public const LESSONS_PER_PHASE = 6;
    public const LEVELS = ['basic', 'intermediate', 'advanced'];
    public const INTENSITIES = ['light', 'moderate', 'intense'];

    /** @return array{level:string,intensity:string} */
    public static function phase(int $phase): array
    {
        $i = max(1, min(9, $phase)) - 1;
        return ['level' => self::LEVELS[intdiv($i, 3)], 'intensity' => self::INTENSITIES[$i % 3]];
    }

    public static function dayDiff(string $a, string $b): int
    {
        return (int) round((strtotime($b . ' 00:00:00 UTC') - strtotime($a . ' 00:00:00 UTC')) / 86400);
    }

    public static function validDay(?string $day): string
    {
        $today = gmdate('Y-m-d');
        if (!is_string($day) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) || strtotime($day . ' UTC') === false) {
            return $today;
        }
        return abs(self::dayDiff($today, $day)) <= 1 ? $day : $today;
    }
}

final class State
{
    /** @param array<string,mixed> $cfg @param array<string,mixed> $user @return array<string,mixed> */
    public static function forUser(PDO $pdo, array $cfg, array $user): array
    {
        $uid = (int) $user['id'];
        $stats = DB::one($pdo, 'SELECT * FROM user_stats WHERE user_id = ?', [$uid]) ?? [];
        $an = DB::one($pdo, 'SELECT data_enc FROM anamneses WHERE user_id = ?', [$uid]);
        $blob = null;
        if ($an) {
            $plain = Crypto::dec((string) $an['data_enc'], $cfg);
            $blob = $plain ? json_decode($plain, true) : null;
        }
        $phase = (int) ($stats['phase'] ?? 1);
        $consents = [];
        foreach (DB::all($pdo, 'SELECT type, granted, created_at FROM consents WHERE user_id = ? ORDER BY id', [$uid]) as $c) {
            $consents[$c['type']] = ['granted' => (bool) $c['granted'], 'at' => $c['created_at']];
        }
        $log = array_map(
            static fn(array $r): array => [
                'date' => $r['day'], 'lessonId' => $r['lesson_id'], 'sec' => (int) $r['sec'], 'rpe' => (int) $r['rpe'], 'xp' => (int) $r['xp'],
            ],
            DB::all($pdo, 'SELECT day, lesson_id, sec, rpe, xp FROM lesson_logs WHERE user_id = ? ORDER BY id', [$uid]),
        );
        $p = Game::phase($phase);
        return [
            'profile' => ['name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']],
            'consents' => [
                'health' => (bool) ($consents['health']['granted'] ?? false),
                'terms' => (bool) ($consents['terms']['granted'] ?? false),
                'marketing' => (bool) ($consents['marketing']['granted'] ?? false),
                'at' => ($consents['health']['at'] ?? $consents['terms']['at'] ?? '') . 'Z',
            ],
            'answers' => $blob['answers'] ?? null,
            'assignment' => $blob ? [
                'phase' => $phase, 'level' => $p['level'], 'intensity' => $p['intensity'],
                'medicalClearance' => (bool) ($blob['medicalClearance'] ?? false),
                'restrictions' => array_values($blob['restrictions'] ?? []),
            ] : null,
            'sub' => ($stats['sub_status'] ?? 'free') === 'active' ? 'active' : 'free',
            'xp' => (int) ($stats['xp'] ?? 0),
            'streak' => (int) ($stats['streak'] ?? 0),
            'bestStreak' => (int) ($stats['best_streak'] ?? 0),
            'lastDay' => $stats['last_day'] ?? null,
            'log' => $log,
        ];
    }
}

final class Schema
{
    /** @return list<string> */
    public static function statements(string $driver): array
    {
        $sqlite = $driver === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $uidType = $sqlite ? 'INTEGER' : 'BIGINT UNSIGNED';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        $ix = static fn(string $name, string $table, string $cols): string => "CREATE INDEX $name ON $table ($cols)";

        $s = [];
        $s[] = "CREATE TABLE IF NOT EXISTS users (
            id $id,
            email VARCHAR(190) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(120) NOT NULL,
            role VARCHAR(10) NOT NULL DEFAULT 'student',
            teacher_id $uidType NULL,
            locale VARCHAR(2) NOT NULL DEFAULT 'pt',
            created_at $dt NOT NULL,
            deleted_at $dt NULL,
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
        )$tail";
        $s[] = "CREATE TABLE IF NOT EXISTS sessions (
            id $id,
            user_id $uidType NOT NULL,
            token_hash CHAR(64) NOT NULL UNIQUE,
            created_at $dt NOT NULL,
            expires_at $dt NOT NULL,
            last_seen_at $dt NOT NULL,
            ip_hash CHAR(64) NOT NULL,
            ua VARCHAR(200) NOT NULL DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )$tail";
        $s[] = "CREATE TABLE IF NOT EXISTS consents (
            id $id,
            user_id $uidType NOT NULL,
            type VARCHAR(20) NOT NULL,
            granted TINYINT NOT NULL,
            version VARCHAR(20) NOT NULL,
            ip_hash CHAR(64) NOT NULL,
            created_at $dt NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )$tail";
        $s[] = "CREATE TABLE IF NOT EXISTS anamneses (
            user_id $uidType NOT NULL PRIMARY KEY,
            data_enc $text NOT NULL,
            updated_at $dt NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )$tail";
        $s[] = "CREATE TABLE IF NOT EXISTS user_stats (
            user_id $uidType NOT NULL PRIMARY KEY,
            xp INT NOT NULL DEFAULT 0,
            streak INT NOT NULL DEFAULT 0,
            best_streak INT NOT NULL DEFAULT 0,
            last_day VARCHAR(10) NULL,
            phase TINYINT NOT NULL DEFAULT 1,
            sub_status VARCHAR(10) NOT NULL DEFAULT 'free',
            updated_at $dt NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )$tail";
        $s[] = "CREATE TABLE IF NOT EXISTS lesson_logs (
            id $id,
            user_id $uidType NOT NULL,
            lesson_id VARCHAR(8) NOT NULL,
            day VARCHAR(10) NOT NULL,
            sec INT NOT NULL,
            rpe TINYINT NOT NULL,
            xp INT NOT NULL,
            created_at $dt NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )$tail";
        $s[] = "CREATE TABLE IF NOT EXISTS audit_log (
            id $id,
            user_id $uidType NULL,
            action VARCHAR(40) NOT NULL,
            ip_hash CHAR(64) NOT NULL,
            meta VARCHAR(200) NOT NULL DEFAULT '',
            created_at $dt NOT NULL
        )$tail";
        $s[] = "CREATE TABLE IF NOT EXISTS rate_limits (
            k CHAR(64) NOT NULL,
            win INT NOT NULL,
            hits INT NOT NULL,
            PRIMARY KEY (k, win)
        )$tail";

        if ($sqlite) {
            $s[] = 'CREATE INDEX IF NOT EXISTS ix_logs_user ON lesson_logs (user_id)';
            $s[] = 'CREATE INDEX IF NOT EXISTS ix_consents_user ON consents (user_id)';
            $s[] = 'CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions (user_id)';
        } else {
            // índices dentro do CREATE seriam melhores; aqui o IF NOT EXISTS não existe em MySQL<8.0.29, então ignoramos duplicados
            $s[] = $ix('ix_logs_user', 'lesson_logs', 'user_id');
            $s[] = $ix('ix_consents_user', 'consents', 'user_id');
            $s[] = $ix('ix_sessions_user', 'sessions', 'user_id');
        }
        return $s;
    }

    public static function install(PDO $pdo): void
    {
        foreach (self::statements(DB::driver($pdo)) as $sql) {
            try {
                $pdo->exec($sql);
            } catch (\PDOException $e) {
                // índice duplicado em reinstalação (MySQL 1061) é inofensivo
                if (!str_contains($e->getMessage(), 'Duplicate key name')) {
                    throw $e;
                }
            }
        }
    }
}

final class Seed
{
    public const TEST_EMAIL = 'teste@thefullsculpt.com.br';

    /** Senha aleatória legível (sem caracteres ambíguos), mostrada uma única vez. */
    public static function password(): string
    {
        $alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $out = '';
        for ($i = 0; $i < 16; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $out;
    }

    /**
     * Cria (ou recria) o usuário de teste: aluna na Fase 4, assinatura ativa e 14 aulas no histórico.
     * Dados 100% fictícios, só para validar a área restrita antes da versão final.
     *
     * @param array<string,mixed> $cfg
     * @return int id do usuário
     */
    public static function testUser(PDO $pdo, array $cfg, string $password): int
    {
        DB::run($pdo, 'DELETE FROM users WHERE email = ?', [self::TEST_EMAIL]);
        $now = DB::now();
        $pdo->beginTransaction();
        try {
            DB::run($pdo, 'INSERT INTO users (email, password_hash, name, role, locale, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [self::TEST_EMAIL, Auth::hash($password), 'Marina Duarte (teste)', 'student', 'pt', $now]);
            $uid = (int) $pdo->lastInsertId();
            foreach (['terms', 'health'] as $type) {
                DB::run($pdo, 'INSERT INTO consents (user_id, type, granted, version, ip_hash, created_at) VALUES (?, ?, 1, ?, ?, ?)',
                    [$uid, $type, 'seed', Crypto::ipHash($cfg), $now]);
            }
            $blob = json_encode([
                'answers' => ['goal' => 'sculpt', 'experience' => 'y1to3', 'days' => 4, 'injuries' => [], 'parq' => [], 'coaching' => true],
                'medicalClearance' => false,
                'restrictions' => [],
            ], JSON_UNESCAPED_UNICODE);
            DB::run($pdo, 'INSERT INTO anamneses (user_id, data_enc, updated_at) VALUES (?, ?, ?)', [$uid, Crypto::enc((string) $blob, $cfg), $now]);
            $yesterday = gmdate('Y-m-d', time() - 86400);
            DB::run($pdo, "INSERT INTO user_stats (user_id, xp, streak, best_streak, last_day, phase, sub_status, updated_at) VALUES (?, 1840, 5, 9, ?, 4, 'active', ?)",
                [$uid, $yesterday, $now]);
            foreach ([1, 2, 4, 5, 7, 8, 9, 11, 12, 14, 15, 16, 18, 19] as $i => $offset) {
                DB::run($pdo, 'INSERT INTO lesson_logs (user_id, lesson_id, day, sec, rpe, xp, created_at) VALUES (?, ?, ?, ?, ?, 110, ?)', [
                    $uid,
                    sprintf('f%d-%d', $i < 8 ? 3 : 4, ($i % 6) + 1),
                    gmdate('Y-m-d', time() - $offset * 86400),
                    540 + (($i * 53) % 300),
                    5 + ($i % 4),
                    $now,
                ]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        return $uid;
    }
}
