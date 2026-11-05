<?php
declare(strict_types=1);

namespace TFS;

use PDO;

/* ============================================================
 * Migrações do banco (executam sozinhas, uma vez, com lock).
 * v1 = esquema do instalador · v2 = back-office (gestão completa)
 * ============================================================ */

final class Migrator
{
    public const LATEST = 8;
    private static bool $done = false;

    public static function run(PDO $pdo, bool $force = false): void
    {
        if (self::$done && !$force) {
            return;
        }
        $sqlite = DB::driver($pdo) === 'sqlite';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $pdo->exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INT NOT NULL PRIMARY KEY, applied_at $dt NOT NULL)$tail");
        $cur = (int) (DB::one($pdo, 'SELECT MAX(version) AS v FROM schema_migrations')['v'] ?? 0);
        if ($cur >= self::LATEST) {
            self::$done = true;
            return;
        }
        $locked = false;
        if (!$sqlite) {
            $locked = (int) (DB::one($pdo, "SELECT GET_LOCK('tfs_migrate', 15) AS l")['l'] ?? 0) === 1;
            $cur = (int) (DB::one($pdo, 'SELECT MAX(version) AS v FROM schema_migrations')['v'] ?? 0);
        }
        try {
            if ($cur === 0) {
                DB::run($pdo, 'INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)', [DB::now()]);
                $cur = 1;
            }
            for ($v = $cur + 1; $v <= self::LATEST; $v++) {
                self::apply($pdo, $v);
                DB::run($pdo, 'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [$v, DB::now()]);
            }
        } finally {
            if ($locked) {
                $pdo->query("SELECT RELEASE_LOCK('tfs_migrate')");
            }
        }
        self::$done = true;
    }

    public static function version(PDO $pdo): int
    {
        return (int) (DB::one($pdo, 'SELECT MAX(version) AS v FROM schema_migrations')['v'] ?? 0);
    }

    private static function hasColumn(PDO $pdo, string $table, string $col): bool
    {
        if (DB::driver($pdo) === 'sqlite') {
            foreach (DB::all($pdo, "PRAGMA table_info($table)") as $c) {
                if ($c['name'] === $col) {
                    return true;
                }
            }
            return false;
        }
        return DB::one($pdo, "SHOW COLUMNS FROM `$table` LIKE '$col'") !== null;
    }

    private static function exec(PDO $pdo, string $sql): void
    {
        try {
            $pdo->exec($sql);
        } catch (\PDOException $e) {
            if (!str_contains($e->getMessage(), 'Duplicate key name') && !str_contains($e->getMessage(), 'already exists')) {
                throw $e;
            }
        }
    }

    private static function apply(PDO $pdo, int $v): void
    {
        if ($v === 2) {
            self::v2($pdo);
        }
        if ($v === 3) {
            self::v3($pdo);
        }
        if ($v === 4) {
            self::v4($pdo);
        }
        if ($v === 5) {
            self::v5($pdo);
        }
        if ($v === 6) {
            self::v6($pdo);
        }
        if ($v === 7) {
            self::v7($pdo);
        }
        if ($v === 8) {
            self::v8($pdo);
        }
    }

    /** v3: perfil do aluno (contato/endereço), meio de pagamento (só dados de exibição) e recuperação de senha. */
    private static function v3(PDO $pdo): void
    {
        $sqlite = DB::driver($pdo) === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $u = $sqlite ? 'INTEGER' : 'BIGINT UNSIGNED';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        foreach ([
            'phone' => 'VARCHAR(30) NULL',
            'profile_enc' => "$text NULL",
            'pay_method' => "VARCHAR(8) NOT NULL DEFAULT 'card'",
            'pay_brand' => 'VARCHAR(20) NULL',
            'pay_last4' => 'VARCHAR(4) NULL',
        ] as $col => $def) {
            if (!self::hasColumn($pdo, 'users', $col)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN $col $def");
            }
        }
        self::exec($pdo, "CREATE TABLE IF NOT EXISTS password_resets (
            id $id, user_id $u NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, expires_at $dt NOT NULL, used_at $dt NULL, created_at $dt NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)$tail");
        self::exec($pdo, ($sqlite ? 'CREATE INDEX IF NOT EXISTS' : 'CREATE INDEX') . ' ix_resets_user ON password_resets (user_id)');
    }

    /** v4: central jurídica (documentos versionados + comentários do advogado), gateways de pagamento e eventos de webhook. */
    private static function v4(PDO $pdo): void
    {
        $sqlite = DB::driver($pdo) === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $u = $sqlite ? 'INTEGER' : 'BIGINT UNSIGNED';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        foreach ([
            "CREATE TABLE IF NOT EXISTS legal_docs (
                slug VARCHAR(40) NOT NULL PRIMARY KEY, category VARCHAR(20) NOT NULL, title VARCHAR(160) NOT NULL,
                required TINYINT NOT NULL DEFAULT 1, sort INT NOT NULL DEFAULT 0, created_at $dt NOT NULL)$tail",
            "CREATE TABLE IF NOT EXISTS legal_versions (
                id $id, slug VARCHAR(40) NOT NULL, version INT NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'draft', content $text NOT NULL,
                change_note VARCHAR(300) NULL, author_id $u NULL, created_at $dt NOT NULL, updated_at $dt NOT NULL, submitted_at $dt NULL,
                approved_by $u NULL, approved_at $dt NULL, published_at $dt NULL, UNIQUE (slug, version),
                FOREIGN KEY (slug) REFERENCES legal_docs(slug) ON DELETE CASCADE)$tail",
            "CREATE TABLE IF NOT EXISTS legal_comments (
                id $id, slug VARCHAR(40) NOT NULL, version_id $u NULL, author_id $u NULL, author_name VARCHAR(120) NOT NULL,
                body VARCHAR(2000) NOT NULL, resolved TINYINT NOT NULL DEFAULT 0, created_at $dt NOT NULL,
                FOREIGN KEY (slug) REFERENCES legal_docs(slug) ON DELETE CASCADE)$tail",
            "CREATE TABLE IF NOT EXISTS payment_gateways (
                id $id, provider VARCHAR(20) NOT NULL, label VARCHAR(80) NOT NULL, enabled TINYINT NOT NULL DEFAULT 0, is_default TINYINT NOT NULL DEFAULT 0,
                priority INT NOT NULL DEFAULT 10, mode VARCHAR(8) NOT NULL DEFAULT 'sandbox', methods VARCHAR(60) NOT NULL DEFAULT 'card',
                public_key VARCHAR(200) NULL, config_enc $text NOT NULL, last_test_at $dt NULL, last_test_ok TINYINT NULL, last_test_msg VARCHAR(200) NULL,
                created_at $dt NOT NULL, updated_at $dt NOT NULL)$tail",
            "CREATE TABLE IF NOT EXISTS webhook_events (
                id $id, provider VARCHAR(20) NOT NULL, event_id VARCHAR(80) NULL, type VARCHAR(60) NULL, valid TINYINT NOT NULL DEFAULT 0,
                processed TINYINT NOT NULL DEFAULT 0, error VARCHAR(200) NULL, payload $text NOT NULL, created_at $dt NOT NULL)$tail",
        ] as $sql) {
            self::exec($pdo, $sql);
        }
        foreach ([['ix_lv_slug', 'legal_versions', 'slug, status'], ['ix_lc_slug', 'legal_comments', 'slug, resolved'], ['ix_wh_event', 'webhook_events', 'provider, event_id']] as [$n, $t, $c]) {
            self::exec($pdo, ($sqlite ? 'CREATE INDEX IF NOT EXISTS' : 'CREATE INDEX') . " $n ON $t ($c)");
        }
    }

    /** v5: permissões por usuário (equipe do painel) e trilha de auditoria das edições jurídicas (encadeada por hash). */
    private static function v5(PDO $pdo): void
    {
        $sqlite = DB::driver($pdo) === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $u = $sqlite ? 'INTEGER' : 'BIGINT UNSIGNED';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        if (!self::hasColumn($pdo, 'users', 'permissions')) {
            $pdo->exec('ALTER TABLE users ADD COLUMN permissions TEXT NULL');
        }
        if (!self::hasColumn($pdo, 'users', 'profile_label')) {
            $pdo->exec('ALTER TABLE users ADD COLUMN profile_label VARCHAR(40) NULL');
        }
        self::exec($pdo, "CREATE TABLE IF NOT EXISTS legal_edits (
            id $id, slug VARCHAR(40) NOT NULL, version_id $u NULL, version INT NOT NULL, user_id $u NULL, user_name VARCHAR(120) NOT NULL, user_role VARCHAR(10) NOT NULL,
            action VARCHAR(20) NOT NULL, note VARCHAR(300) NULL, chars_added INT NOT NULL DEFAULT 0, chars_removed INT NOT NULL DEFAULT 0,
            content_before $text NULL, content_after $text NULL, content_hash CHAR(64) NULL, prev_hash CHAR(64) NULL, entry_hash CHAR(64) NOT NULL, created_at $dt NOT NULL)$tail");
        self::exec($pdo, ($sqlite ? 'CREATE INDEX IF NOT EXISTS' : 'CREATE INDEX') . ' ix_le_slug ON legal_edits (slug, id)');
    }

    /** v6: verificação de e-mail do cadastro e templates de e-mail editáveis no admin. */
    private static function v6(PDO $pdo): void
    {
        $sqlite = DB::driver($pdo) === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $u = $sqlite ? 'INTEGER' : 'BIGINT UNSIGNED';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        if (!self::hasColumn($pdo, 'users', 'email_verified_at')) {
            $pdo->exec("ALTER TABLE users ADD COLUMN email_verified_at $dt NULL");
            // quem já tinha conta antes desta versão é considerado verificado
            $pdo->exec('UPDATE users SET email_verified_at = created_at');
        }
        self::exec($pdo, "CREATE TABLE IF NOT EXISTS email_verifications (
            id $id, user_id $u NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, expires_at $dt NOT NULL, used_at $dt NULL, created_at $dt NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)$tail");
        self::exec($pdo, "CREATE TABLE IF NOT EXISTS email_templates (
            kind VARCHAR(20) NOT NULL, lang VARCHAR(2) NOT NULL, subject VARCHAR(200) NOT NULL, title VARCHAR(200) NOT NULL, body $text NOT NULL,
            cta VARCHAR(80) NOT NULL, foot VARCHAR(400) NOT NULL, updated_by $u NULL, updated_at $dt NOT NULL, PRIMARY KEY (kind, lang))$tail");
    }

    /** v7: planos e preços, promoções, códigos promocionais e calendário festivo. */
    private static function v7(PDO $pdo): void
    {
        $sqlite = DB::driver($pdo) === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $u = $sqlite ? 'INTEGER' : 'BIGINT UNSIGNED';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $d = $sqlite ? 'TEXT' : 'DATE';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        foreach ([
            "CREATE TABLE IF NOT EXISTS plans (
                id $id, slug VARCHAR(40) NOT NULL UNIQUE, name_pt VARCHAR(80) NOT NULL, name_en VARCHAR(80) NOT NULL DEFAULT '', name_es VARCHAR(80) NOT NULL DEFAULT '',
                desc_pt VARCHAR(240) NOT NULL DEFAULT '', desc_en VARCHAR(240) NOT NULL DEFAULT '', desc_es VARCHAR(240) NOT NULL DEFAULT '', features $text NULL,
                interval_months INT NOT NULL DEFAULT 1, price_cents INT NOT NULL, active TINYINT NOT NULL DEFAULT 1, featured TINYINT NOT NULL DEFAULT 0,
                sort INT NOT NULL DEFAULT 0, created_at $dt NOT NULL, updated_at $dt NOT NULL)$tail",
            "CREATE TABLE IF NOT EXISTS promotions (
                id $id, name VARCHAR(80) NOT NULL, label VARCHAR(30) NULL, kind VARCHAR(8) NOT NULL, value INT NOT NULL, plan_ids VARCHAR(200) NULL,
                starts_on $d NULL, ends_on $d NULL, first_purchase_only TINYINT NOT NULL DEFAULT 0, active TINYINT NOT NULL DEFAULT 1, event_key VARCHAR(60) NULL,
                created_at $dt NOT NULL, updated_at $dt NOT NULL)$tail",
            "CREATE TABLE IF NOT EXISTS promo_codes (
                id $id, code VARCHAR(24) NOT NULL UNIQUE, note VARCHAR(120) NULL, kind VARCHAR(8) NOT NULL, value INT NOT NULL, plan_ids VARCHAR(200) NULL,
                starts_on $d NULL, ends_on $d NULL, max_uses INT NULL, uses INT NOT NULL DEFAULT 0, first_purchase_only TINYINT NOT NULL DEFAULT 0,
                stackable TINYINT NOT NULL DEFAULT 0, active TINYINT NOT NULL DEFAULT 1, created_at $dt NOT NULL, updated_at $dt NOT NULL)$tail",
            "CREATE TABLE IF NOT EXISTS promo_redemptions (
                id $id, code_id $u NOT NULL, user_id $u NOT NULL, plan_id $u NOT NULL, discount_cents INT NOT NULL, created_at $dt NOT NULL,
                FOREIGN KEY (code_id) REFERENCES promo_codes(id) ON DELETE CASCADE)$tail",
            "CREATE TABLE IF NOT EXISTS calendar_events (
                id $id, date $d NOT NULL, name VARCHAR(100) NOT NULL, kind VARCHAR(12) NOT NULL DEFAULT 'custom', yearly TINYINT NOT NULL DEFAULT 0,
                active TINYINT NOT NULL DEFAULT 1, created_at $dt NOT NULL)$tail",
        ] as $sql) {
            self::exec($pdo, $sql);
        }
        self::exec($pdo, ($sqlite ? 'CREATE UNIQUE INDEX IF NOT EXISTS' : 'CREATE UNIQUE INDEX') . ' ux_redeem_user_code ON promo_redemptions (code_id, user_id)');
        // plano inicial a partir do preço já configurado
        if (!DB::one($pdo, 'SELECT id FROM plans')) {
            $now = DB::now();
            $price = (int) (Settings::all($pdo)['price_cents'] ?? 7990);
            DB::run($pdo, 'INSERT INTO plans (slug, name_pt, name_en, name_es, desc_pt, desc_en, desc_es, features, interval_months, price_cents, active, featured, sort, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, 1, 10, ?, ?)', [
                'mensal', 'Plano mensal', 'Monthly plan', 'Plan mensual',
                'Acesso completo, sem fidelidade.', 'Full access, no lock-in.', 'Acceso completo, sin permanencia.',
                json_encode([
                    'pt' => ['Todas as aulas das 9 fases', 'Corpo 3D com biomecânica e músculos', 'Progresso, conquistas e desafios', 'Cancele quando quiser'],
                    'en' => ['All lessons across the 9 phases', '3D body with biomechanics and muscles', 'Progress, achievements and challenges', 'Cancel anytime'],
                    'es' => ['Todas las clases de las 9 fases', 'Cuerpo 3D con biomecánica y músculos', 'Progreso, logros y desafíos', 'Cancela cuando quieras'],
                ], JSON_UNESCAPED_UNICODE), $price, $now, $now,
            ]);
        }
    }

    /** v8: Estúdio 3D — rig/biomecânica por exercício, com histórico de versões. */
    private static function v8(PDO $pdo): void
    {
        $sqlite = DB::driver($pdo) === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $u = $sqlite ? 'INTEGER' : 'BIGINT UNSIGNED';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        self::exec($pdo, "CREATE TABLE IF NOT EXISTS exercise_rigs (
            id $id, slug VARCHAR(40) NOT NULL, version INT NOT NULL, def $text NOT NULL, note VARCHAR(200) NULL, author_id $u NULL,
            created_at $dt NOT NULL, is_current TINYINT NOT NULL DEFAULT 0, UNIQUE (slug, version))$tail");
        self::exec($pdo, ($sqlite ? 'CREATE INDEX IF NOT EXISTS' : 'CREATE INDEX') . ' ix_rigs_current ON exercise_rigs (slug, is_current)');
    }

    private static function v2(PDO $pdo): void
    {
        $sqlite = DB::driver($pdo) === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $u = $sqlite ? 'INTEGER' : 'BIGINT UNSIGNED';
        $dt = $sqlite ? 'TEXT' : 'DATETIME';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';

        // colunas novas em users
        foreach ([
            'status' => "VARCHAR(10) NOT NULL DEFAULT 'active'",
            'is_demo' => 'TINYINT NOT NULL DEFAULT 0',
            'last_login_at' => "$dt NULL",
            'source' => 'VARCHAR(40) NULL',
        ] as $col => $def) {
            if (!self::hasColumn($pdo, 'users', $col)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN $col $def");
            }
        }

        $t = [];
        $t[] = "CREATE TABLE IF NOT EXISTS settings (
            k VARCHAR(60) NOT NULL PRIMARY KEY, v $text NOT NULL, updated_at $dt NOT NULL)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS teacher_profiles (
            user_id $u NOT NULL PRIMARY KEY, code VARCHAR(24) NOT NULL UNIQUE, cref VARCHAR(30) NULL, bio VARCHAR(400) NULL,
            status VARCHAR(12) NOT NULL DEFAULT 'active', tier_percent INT NULL, created_at $dt NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS subscriptions (
            id $id, user_id $u NOT NULL, plan VARCHAR(20) NOT NULL DEFAULT 'monthly', status VARCHAR(12) NOT NULL,
            price_cents INT NOT NULL, started_at $dt NOT NULL, canceled_at $dt NULL, provider VARCHAR(12) NOT NULL DEFAULT 'manual',
            provider_ref VARCHAR(80) NULL, is_demo TINYINT NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS payments (
            id $id, user_id $u NOT NULL, subscription_id $u NULL, amount_cents INT NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
            status VARCHAR(12) NOT NULL, method VARCHAR(8) NOT NULL DEFAULT 'card', paid_at $dt NULL, created_at $dt NOT NULL,
            provider_ref VARCHAR(80) NULL, is_demo TINYINT NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS payouts (
            id $id, teacher_id $u NOT NULL, amount_cents INT NOT NULL, period VARCHAR(7) NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'paid',
            paid_at $dt NOT NULL, note VARCHAR(200) NULL, created_at $dt NOT NULL, is_demo TINYINT NOT NULL DEFAULT 0,
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS commissions (
            id $id, teacher_id $u NOT NULL, user_id $u NOT NULL, payment_id $u NULL, amount_cents INT NOT NULL, percent INT NOT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'pending', available_at $dt NOT NULL, paid_at $dt NULL, payout_id $u NULL,
            created_at $dt NOT NULL, is_demo TINYINT NOT NULL DEFAULT 0,
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS appointments (
            id $id, user_id $u NOT NULL, teacher_id $u NULL, starts_at $dt NOT NULL, duration_min INT NOT NULL DEFAULT 40,
            status VARCHAR(12) NOT NULL DEFAULT 'requested', link VARCHAR(300) NULL, notes VARCHAR(500) NULL,
            created_at $dt NOT NULL, is_demo TINYINT NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS student_notes (
            id $id, user_id $u NOT NULL, author_id $u NULL, note VARCHAR(1000) NOT NULL, created_at $dt NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS exercises (
            id $id, slug VARCHAR(40) NOT NULL UNIQUE, motion VARCHAR(10) NOT NULL, depth DOUBLE NOT NULL DEFAULT 1,
            primary_m VARCHAR(200) NOT NULL DEFAULT '', secondary_m VARCHAR(200) NOT NULL DEFAULT '', stabilizers_m VARCHAR(200) NOT NULL DEFAULT '',
            video_url VARCHAR(300) NULL, i18n $text NOT NULL, active TINYINT NOT NULL DEFAULT 1, created_at $dt NOT NULL, updated_at $dt NOT NULL)$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS lessons (
            id $id, phase TINYINT NOT NULL, n TINYINT NOT NULL, focus VARCHAR(20) NOT NULL, work_sec INT NOT NULL, rest_sec INT NOT NULL,
            rounds TINYINT NOT NULL DEFAULT 1, active TINYINT NOT NULL DEFAULT 1, UNIQUE (phase, n))$tail";
        $t[] = "CREATE TABLE IF NOT EXISTS lesson_exercises (
            lesson_id $u NOT NULL, pos TINYINT NOT NULL, exercise_id $u NOT NULL, PRIMARY KEY (lesson_id, pos),
            FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
            FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT)$tail";
        foreach ($t as $sql) {
            self::exec($pdo, $sql);
        }

        $ix = [
            ['ix_users_role', 'users', 'role, is_demo'],
            ['ix_users_teacher', 'users', 'teacher_id'],
            ['ix_subs_user', 'subscriptions', 'user_id, status'],
            ['ix_pay_user', 'payments', 'user_id'],
            ['ix_pay_paid', 'payments', 'paid_at'],
            ['ix_comm_teacher', 'commissions', 'teacher_id, status'],
            ['ix_appt_start', 'appointments', 'starts_at'],
            ['ix_appt_user', 'appointments', 'user_id'],
            ['ix_notes_user', 'student_notes', 'user_id'],
            ['ix_audit_created', 'audit_log', 'created_at'],
        ];
        foreach ($ix as [$name, $table, $cols]) {
            self::exec($pdo, ($sqlite ? 'CREATE INDEX IF NOT EXISTS' : 'CREATE INDEX') . " $name ON $table ($cols)");
        }
    }
}

final class Settings
{
    public const DEFAULTS = [
        'price_cents' => 7990,
        'commission_tiers' => [
            ['id' => 'bronze', 'min' => 1, 'percent' => 20],
            ['id' => 'silver', 'min' => 15, 'percent' => 25],
            ['id' => 'gold', 'min' => 40, 'percent' => 30],
        ],
        'commission_hold_days' => 30,
        'consult_enabled' => true,
        'availability' => ['weekdays' => [1, 2, 3, 4, 5], 'start' => '09:00', 'end' => '18:00', 'slot_min' => 40],
        'free_lessons' => 1,
        'consult_capacity' => 2,
        'consent_version' => '2026-11',
        'smtp' => [
            'enabled' => false, 'host' => '', 'port' => 587, 'secure' => 'tls', 'user' => '', 'pass_enc' => '',
            'from_email' => '', 'from_name' => 'THE FULL SCULPT', 'reply_to' => '', 'verify_tls' => true,
            'public_url' => 'https://thefullsculpt.com.br',
        ],
        // identificação do controlador (LGPD art. 41/9º) — exibida no rodapé legal
        'email_layout' => [],
        // regras de desconto: teto em %, acúmulo promoção+código e preço mínimo (centavos)
        'pricing_rules' => ['max_discount_pct' => 70, 'allow_stack' => false, 'min_price_cents' => 990],
        'company' => ['legal_name' => '', 'trade_name' => 'THE FULL SCULPT', 'cnpj' => '', 'address' => '', 'support_email' => '', 'dpo_name' => '', 'dpo_email' => ''],
    ];

    /** @return array<string,mixed> */
    public static function all(PDO $pdo): array
    {
        $out = self::DEFAULTS;
        foreach (DB::all($pdo, 'SELECT k, v FROM settings') as $r) {
            if (array_key_exists($r['k'], $out)) {
                $out[$r['k']] = json_decode((string) $r['v'], true);
            }
        }
        return $out;
    }

    public static function set(PDO $pdo, string $k, mixed $v): void
    {
        $json = json_encode($v, JSON_UNESCAPED_UNICODE);
        $now = DB::now();
        if (DB::one($pdo, 'SELECT k FROM settings WHERE k = ?', [$k])) {
            DB::run($pdo, 'UPDATE settings SET v = ?, updated_at = ? WHERE k = ?', [$json, $now, $k]);
        } else {
            DB::run($pdo, 'INSERT INTO settings (k, v, updated_at) VALUES (?, ?, ?)', [$k, $json, $now]);
        }
    }
}

/** Assinaturas, pagamentos e comissões — o Stripe (webhooks) vai chamar estas mesmas funções. */
final class Billing
{
    /** @param array<string,mixed> $cfg */
    public static function percentFor(PDO $pdo, int $teacherId): int
    {
        $p = DB::one($pdo, 'SELECT tier_percent FROM teacher_profiles WHERE user_id = ?', [$teacherId]);
        if ($p && $p['tier_percent'] !== null) {
            return (int) $p['tier_percent'];
        }
        $active = (int) DB::one($pdo,
            "SELECT COUNT(*) AS n FROM users u JOIN user_stats s ON s.user_id = u.id WHERE u.teacher_id = ? AND s.sub_status = 'active'",
            [$teacherId])['n'];
        $tiers = Settings::all($pdo)['commission_tiers'];
        usort($tiers, static fn($a, $b) => $a['min'] <=> $b['min']);
        $percent = (int) ($tiers[0]['percent'] ?? 20);
        foreach ($tiers as $t) {
            if ($active >= (int) $t['min']) {
                $percent = (int) $t['percent'];
            }
        }
        return $percent;
    }

    /** Registra um pagamento aprovado e gera a comissão do professor vinculado. Retorna o id do pagamento. */
    public static function recordPayment(PDO $pdo, int $userId, int $amountCents, string $method = 'card', string $provider = 'manual', ?string $ref = null, bool $demo = false, ?string $paidAt = null): int
    {
        $paidAt ??= DB::now();
        $sub = DB::one($pdo, "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC", [$userId]);
        if (!$sub) {
            DB::run($pdo, "INSERT INTO subscriptions (user_id, plan, status, price_cents, started_at, provider, provider_ref, is_demo) VALUES (?, 'monthly', 'active', ?, ?, ?, ?, ?)",
                [$userId, $amountCents, $paidAt, $provider, $ref, $demo ? 1 : 0]);
            $subId = (int) $pdo->lastInsertId();
        } else {
            $subId = (int) $sub['id'];
        }
        DB::run($pdo, "INSERT INTO payments (user_id, subscription_id, amount_cents, status, method, paid_at, created_at, provider_ref, is_demo) VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?)",
            [$userId, $subId, $amountCents, $method, $paidAt, $paidAt, $ref, $demo ? 1 : 0]);
        $payId = (int) $pdo->lastInsertId();

        $u = DB::one($pdo, 'SELECT teacher_id FROM users WHERE id = ?', [$userId]);
        if ($u && $u['teacher_id']) {
            $pct = self::percentFor($pdo, (int) $u['teacher_id']);
            $hold = (int) Settings::all($pdo)['commission_hold_days'];
            DB::run($pdo, "INSERT INTO commissions (teacher_id, user_id, payment_id, amount_cents, percent, status, available_at, created_at, is_demo) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
                [$u['teacher_id'], $userId, $payId, intdiv($amountCents * $pct, 100), $pct,
                    gmdate('Y-m-d H:i:s', strtotime($paidAt . ' UTC') + $hold * 86400), $paidAt, $demo ? 1 : 0]);
        }
        return $payId;
    }
}
