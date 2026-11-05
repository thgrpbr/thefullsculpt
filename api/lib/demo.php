<?php
declare(strict_types=1);

namespace TFS;

use PDO;

/**
 * Gerador de dados FICTÍCIOS para validar o back-office antes de ter alunos reais.
 * Tudo é marcado is_demo = 1 (e-mails @exemplo.invalid, sem senha utilizável) e pode ser apagado com Demo::purge().
 */
final class Demo
{
    /** @param list<list<mixed>> $rows */
    private static function batch(PDO $pdo, string $table, array $cols, array $rows): void
    {
        foreach (array_chunk($rows, 150) as $chunk) {
            $ph = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';
            $sql = "INSERT INTO $table (" . implode(',', $cols) . ') VALUES ' . implode(',', array_fill(0, count($chunk), $ph));
            $flat = [];
            foreach ($chunk as $r) {
                foreach ($r as $v) {
                    $flat[] = $v;
                }
            }
            DB::run($pdo, $sql, $flat);
        }
    }

    private static function rnd(): float
    {
        return mt_rand() / mt_getrandmax();
    }

    private static function ts(int $t): string
    {
        return gmdate('Y-m-d H:i:s', $t);
    }

    public static function purge(PDO $pdo): int
    {
        $n = (int) DB::one($pdo, 'SELECT COUNT(*) AS n FROM users WHERE is_demo = 1')['n'];
        DB::run($pdo, 'DELETE FROM users WHERE is_demo = 1');
        return $n;
    }

    /** @return array<string,int> */
    public static function seed(PDO $pdo, int $students): array
    {
        @set_time_limit(120);
        mt_srand(20261105);
        self::purge($pdo);
        $now = time();
        $price = (int) Settings::all($pdo)['price_cents'];
        $first = ['Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Karina', 'Larissa', 'Mariana', 'Natália', 'Olívia', 'Patrícia', 'Rafaela', 'Sofia', 'Tatiane', 'Vanessa', 'Bruno', 'Carlos', 'Diego', 'Eduardo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'João', 'Leonardo', 'Marcos', 'Nicolas', 'Pedro', 'Rafael', 'Samuel', 'Thiago', 'Vinícius'];
        $last = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Ribeiro', 'Barbosa', 'Ferreira', 'Rocha', 'Dias', 'Moreira'];
        $teacherNames = ['Ana Beatriz Lopes', 'Carlos Mendes', 'Juliana Rocha', 'Rafael Tavares', 'Fernanda Alves', 'Bruno Nogueira', 'Patrícia Nunes', 'Diego Castro'];
        $pick = static fn(array $a) => $a[mt_rand(0, count($a) - 1)];

        $pdo->beginTransaction();
        try {
            /* ---- professores ---- */
            $teachers = [];
            foreach ($teacherNames as $i => $name) {
                DB::run($pdo, "INSERT INTO users (email, password_hash, name, role, locale, created_at, is_demo) VALUES (?, '!demo', ?, 'teacher', 'pt', ?, 1)",
                    ['demo.prof' . ($i + 1) . '@exemplo.invalid', $name, self::ts($now - (330 - $i * 25) * 86400)]);
                $tid = (int) $pdo->lastInsertId();
                DB::run($pdo, 'INSERT INTO teacher_profiles (user_id, code, cref, bio, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [$tid, Util::slugCode($name) . (200 + $i), '0' . (10000 + $i * 317) . '-G/SP', 'Professor(a) de Educação Física', $i === 7 ? 'pending' : 'active', self::ts($now - (330 - $i * 25) * 86400)]);
                $teachers[] = $tid;
            }
            $tw = [30, 24, 18, 14, 10, 8, 6, 0]; // peso de captação por professor (o último está pendente)

            /* ---- alunos ---- */
            $stats = $anam = $subRows = $payRows = $logRows = $consents = [];
            $commissions = [];
            $apptRows = [];
            $summary = ['students' => 0, 'lessons' => 0, 'payments' => 0, 'subscriptions' => 0, 'commissions' => 0, 'appointments' => 0];
            $weekdayW = [1.3, 1.3, 1.2, 1.2, 1.0, 0.6, 0.5];

            for ($i = 1; $i <= $students; $i++) {
                $age = (int) floor(365 * pow(self::rnd(), 1.5));
                $signup = $now - $age * 86400 - mt_rand(0, 80000);
                $name = $pick($first) . ' ' . $pick($last);
                $teacherId = null;
                if (self::rnd() < 0.45) {
                    $x = self::rnd() * array_sum($tw);
                    foreach ($tw as $ti => $w) {
                        if (($x -= $w) <= 0) {
                            $teacherId = $teachers[$ti];
                            break;
                        }
                    }
                }
                $status = self::rnd() < 0.012 ? 'suspended' : 'active';
                DB::run($pdo, "INSERT INTO users (email, password_hash, name, role, teacher_id, locale, created_at, last_login_at, status, is_demo, source) VALUES (?, '!demo', ?, 'student', ?, ?, ?, ?, ?, 1, ?)",
                    ["demo.aluno$i@exemplo.invalid", $name, $teacherId, $pick(['pt', 'pt', 'pt', 'pt', 'en', 'es']), self::ts($signup), self::ts(min($now, $signup + mt_rand(0, 40) * 86400)), $status, $teacherId ? 'ref' : $pick(['organic', 'instagram', 'google', 'indicacao'])]);
                $uid = (int) $pdo->lastInsertId();
                $summary['students']++;

                $consents[] = [$uid, 'terms', 1, 'demo', str_repeat('0', 64), self::ts($signup)];
                $consents[] = [$uid, 'health', 1, 'demo', str_repeat('0', 64), self::ts($signup)];
                $consents[] = [$uid, 'marketing', self::rnd() < 0.42 ? 1 : 0, 'demo', str_repeat('0', 64), self::ts($signup)];

                $did = self::rnd() < 0.93;
                $phase = $did ? $pick([1, 1, 1, 1, 2, 2, 3, 4, 4, 5, 7]) : 1;
                $engage = 0.35 + self::rnd() * 1.1;
                $first1 = $did && self::rnd() < 0.86;
                $subscribes = $first1 && self::rnd() < 0.62;
                $lastDay = null;
                $xp = 0;
                $subStatus = 'free';
                $cancelAt = null;
                $endActivity = $now;

                if ($did) {
                    $anam[] = [$uid, 'demo', self::ts($signup + 600)];
                }
                $startSub = $signup + mt_rand(0, 3) * 86400 + 3600;
                if ($subscribes && $startSub <= $now) {
                    // pagamentos mensais com churn de ~9% a cada ciclo
                    $t = $startSub;
                    $active = true;
                    while ($t <= $now) {
                        $method = self::rnd() < 0.28 ? 'pix' : 'card';
                        $roll = self::rnd();
                        $st = $roll < 0.02 ? 'refunded' : ($roll < 0.035 ? 'failed' : 'paid');
                        $payRows[] = [$uid, $price, $st, $method, self::ts($t), self::ts($t), $uid, $st];
                        $summary['payments']++;
                        if ($st === 'paid' || $st === 'refunded') {
                            if ($teacherId) {
                                $commissions[] = ['t' => $teacherId, 'u' => $uid, 'paid' => $t, 'st' => $st, 'idx' => count($payRows) - 1];
                            }
                        }
                        $t += 30 * 86400;
                        if (self::rnd() < 0.09 && $t <= $now) {
                            $active = false;
                            $cancelAt = $t;
                            break;
                        }
                    }
                    $subStatus = $active ? 'active' : 'free';
                    $subRows[] = [$uid, $active ? 'active' : 'canceled', $price, self::ts($startSub), $cancelAt ? self::ts($cancelAt) : null, $uid];
                    $summary['subscriptions']++;
                    $endActivity = $cancelAt ?? $now;
                }

                // atividade (aulas concluídas)
                if ($first1) {
                    $n = 1;
                    $curPhase = $phase;
                    $lessonsDone = 0;
                    $dormantFrom = ($subStatus === 'active' && self::rnd() < 0.13) ? $now - mt_rand(8, 28) * 86400 : null;
                    $day0 = (int) floor(($signup + 86400 * mt_rand(0, 2)) / 86400) * 86400;
                    $endTs = $subscribes ? $endActivity : $day0;
                    if ($dormantFrom !== null) {
                        $endTs = min($endTs, $dormantFrom);
                    }
                    for ($wk = 0; $day0 + $wk * 7 * 86400 <= $endTs; $wk++) {
                        $count = (int) round($engage * 2.4 * (0.75 + self::rnd() * 0.6));
                        $count = $wk === 0 ? max(1, min(2, $count)) : $count;
                        $used = [];
                        for ($c = 0; $c < min(5, $count); $c++) {
                            $x = self::rnd() * array_sum($weekdayW);
                            $dw = 0;
                            foreach ($weekdayW as $k => $w) {
                                if (($x -= $w) <= 0) {
                                    $dw = $k;
                                    break;
                                }
                            }
                            if (isset($used[$dw])) {
                                continue;
                            }
                            $used[$dw] = true;
                            $ts = $day0 + $wk * 7 * 86400 + $dw * 86400;
                            if ($ts > $endTs || $ts > $now) {
                                continue;
                            }
                            $logRows[] = [$uid, "f$curPhase-$n", gmdate('Y-m-d', $ts), mt_rand(480, 1180), mt_rand(4, 9), 110, self::ts($ts + 43200)];
                            $xp += 110;
                            $lessonsDone++;
                            $lastDay = gmdate('Y-m-d', max($ts, $lastDay ? strtotime($lastDay . ' UTC') : 0));
                            $n++;
                            if ($n > 6) {
                                $n = 1;
                                $curPhase = min(9, $curPhase + 1);
                            }
                            $summary['lessons']++;
                        }
                    }
                    $phase = $curPhase;
                }
                $recent = $lastDay && (strtotime($lastDay . ' UTC') >= $now - 2 * 86400);
                $streak = $recent ? mt_rand(1, 24) : 0;
                $stats[] = [$uid, $xp, $streak, max($streak, mt_rand(0, 30)), $lastDay, $did ? $phase : 1, $subStatus, self::ts($now)];

                // consultas online
                if ($did && self::rnd() < 0.22) {
                    $nAp = self::rnd() < 0.2 ? 2 : 1;
                    for ($a = 0; $a < $nAp; $a++) {
                        $offsetDays = mt_rand(-45, 21);
                        $startsLocal = strtotime(gmdate('Y-m-d', $now + $offsetDays * 86400) . ' UTC') + (9 + mt_rand(0, 8)) * 3600 + (self::rnd() < 0.5 ? 0 : 2400);
                        $starts = $startsLocal + 3 * 3600;
                        $dow = (int) gmdate('N', $starts);
                        if ($dow > 5) {
                            $starts += (8 - $dow) * 86400;
                        }
                        if ($starts < $now) {
                            $r = self::rnd();
                            $st = $r < 0.72 ? 'done' : ($r < 0.86 ? 'canceled' : 'no_show');
                        } else {
                            $st = self::rnd() < 0.42 ? 'requested' : 'confirmed';
                        }
                        $tt = $teacherId ?? (self::rnd() < 0.7 ? $teachers[mt_rand(0, 6)] : null);
                        $apptRows[] = [$uid, $tt, self::ts($starts), 40, $st, $st === 'confirmed' || $st === 'done' ? 'https://meet.exemplo.invalid/' . substr(md5("$uid-$a"), 0, 10) : null, self::ts(max($signup, $starts - 5 * 86400))];
                    }
                }
            }

            /* ---- inserções em lote ---- */
            self::batch($pdo, 'user_stats', ['user_id', 'xp', 'streak', 'best_streak', 'last_day', 'phase', 'sub_status', 'updated_at'], $stats);
            self::batch($pdo, 'anamneses', ['user_id', 'data_enc', 'updated_at'], $anam);
            self::batch($pdo, 'consents', ['user_id', 'type', 'granted', 'version', 'ip_hash', 'created_at'], $consents);
            self::batch($pdo, 'lesson_logs', ['user_id', 'lesson_id', 'day', 'sec', 'rpe', 'xp', 'created_at'], $logRows);
            self::batch($pdo, 'subscriptions', ['user_id', 'status', 'price_cents', 'started_at', 'canceled_at', 'provider_ref', 'plan', 'provider', 'is_demo'],
                array_map(static fn($r) => [$r[0], $r[1], $r[2], $r[3], $r[4], 'demo' . $r[5], 'monthly', 'demo', 1], $subRows));
            $payInsert = [];
            foreach ($payRows as $r) {
                $payInsert[] = [$r[0], $r[1], $r[2], $r[3], $r[2] === 'failed' ? null : $r[4], $r[5], 'demo' . $r[0], 1];
            }
            self::batch($pdo, 'payments', ['user_id', 'amount_cents', 'status', 'method', 'paid_at', 'created_at', 'provider_ref', 'is_demo'], $payInsert);
            self::batch($pdo, 'appointments', ['user_id', 'teacher_id', 'starts_at', 'duration_min', 'status', 'link', 'created_at', 'is_demo'],
                array_map(static fn($r) => array_merge($r, [1]), $apptRows));
            $summary['appointments'] = count($apptRows);

            /* ---- comissões e repasses ---- */
            $active = [];
            foreach ($stats as $s) {
                $active[$s[0]] = $s[6] === 'active';
            }
            $activeByTeacher = [];
            foreach ($commissions as $c) {
                if (($active[$c['u']] ?? false)) {
                    $activeByTeacher[$c['t']][$c['u']] = true;
                }
            }
            $tiers = Settings::all($pdo)['commission_tiers'];
            usort($tiers, static fn($a, $b) => $a['min'] <=> $b['min']);
            $pctFor = static function (int $count) use ($tiers): int {
                $p = (int) $tiers[0]['percent'];
                foreach ($tiers as $t) {
                    if ($count >= $t['min']) {
                        $p = (int) $t['percent'];
                    }
                }
                return $p;
            };
            $comRows = [];
            $hold = (int) Settings::all($pdo)['commission_hold_days'];
            foreach ($commissions as $c) {
                $pct = $pctFor(count($activeByTeacher[$c['t']] ?? []));
                $avail = $c['paid'] + $hold * 86400;
                $age = ($now - $c['paid']) / 86400;
                $st = $c['st'] === 'refunded' ? 'void' : ($age >= 65 ? 'paid' : ($avail <= $now ? 'approved' : 'pending'));
                $comRows[] = [$c['t'], $c['u'], intdiv($price * $pct, 100), $pct, $st, self::ts($avail), $st === 'paid' ? self::ts($avail + 5 * 86400) : null, self::ts($c['paid']), 1];
            }
            self::batch($pdo, 'commissions', ['teacher_id', 'user_id', 'amount_cents', 'percent', 'status', 'available_at', 'paid_at', 'created_at', 'is_demo'], $comRows);
            $summary['commissions'] = count($comRows);
            // repasses mensais dos comissionamentos pagos
            $groups = [];
            foreach ($comRows as $r) {
                if ($r[4] === 'paid') {
                    $groups[$r[0] . '|' . substr((string) $r[6], 0, 7)][] = $r[2];
                }
            }
            $payouts = [];
            foreach ($groups as $k => $vals) {
                [$tid, $period] = explode('|', $k);
                $payouts[] = [(int) $tid, array_sum($vals), $period, 'paid', $period . '-10 12:00:00', 'Repasse mensal (demo)', $period . '-10 12:00:00', 1];
            }
            self::batch($pdo, 'payouts', ['teacher_id', 'amount_cents', 'period', 'status', 'paid_at', 'note', 'created_at', 'is_demo'], $payouts);
            $summary['payouts'] = count($payouts);
            $summary['teachers'] = count($teachers);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        return $summary;
    }
}
