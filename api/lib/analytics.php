<?php
declare(strict_types=1);

namespace TFS;

use PDO;

/**
 * Analytics do back-office. Agregação em PHP sobre consultas simples (portável MySQL/SQLite);
 * adequado até algumas dezenas de milhares de alunos — depois migrar para tabelas de resumo.
 */
final class Analytics
{
    private static function cond(string $mode, string $col = 'u.is_demo'): string
    {
        return match ($mode) {
            'real' => " AND $col = 0",
            'only' => " AND $col = 1",
            default => '',
        };
    }

    private static function day(?string $dt): ?string
    {
        return $dt === null ? null : substr($dt, 0, 10);
    }

    private static function daysAgo(int $n): string
    {
        return gmdate('Y-m-d', time() - $n * 86400);
    }

    /** @return list<string> chaves YYYY-MM dos últimos $n meses (mais antigo primeiro) */
    private static function months(int $n): array
    {
        $out = [];
        for ($i = $n - 1; $i >= 0; $i--) {
            $out[] = gmdate('Y-m', strtotime(gmdate('Y-m-01') . " UTC -$i month"));
        }
        return $out;
    }

    private static function pct(float $cur, float $prev): ?float
    {
        if ($prev <= 0) {
            return $cur > 0 ? 100.0 : null;
        }
        return round(($cur - $prev) / $prev * 100, 1);
    }

    /** @return array<string,mixed> */
    public static function overview(PDO $pdo, int $range, string $demo): array
    {
        $c = self::cond($demo);
        $today = gmdate('Y-m-d');
        $start = self::daysAgo($range);
        $prevStart = self::daysAgo($range * 2);

        $students = [];
        foreach (DB::all($pdo, "SELECT u.id, u.name, u.created_at, u.status, u.teacher_id, s.phase, s.xp, s.streak, s.sub_status, s.last_day
            FROM users u LEFT JOIN user_stats s ON s.user_id = u.id WHERE u.role = 'student' $c") as $r) {
            $students[(int) $r['id']] = $r;
        }
        $logs = DB::all($pdo, "SELECT l.user_id, l.lesson_id, l.day, l.sec, l.rpe FROM lesson_logs l JOIN users u ON u.id = l.user_id WHERE u.role = 'student' $c");
        $subs = DB::all($pdo, "SELECT s.user_id, s.plan, s.status, s.price_cents, s.started_at, s.canceled_at FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE 1=1 $c");
        $iv = Pricing::intervals($pdo);   // MRR = valor do ciclo ÷ meses do plano
        $pays = DB::all($pdo, "SELECT p.user_id, p.amount_cents, p.status, p.paid_at FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status IN ('paid','refunded') $c");
        $withAnam = [];
        foreach (DB::all($pdo, "SELECT a.user_id FROM anamneses a JOIN users u ON u.id = a.user_id WHERE 1=1 $c") as $r) {
            $withAnam[(int) $r['user_id']] = true;
        }

        /* ---- KPIs ---- */
        $inWin = static fn(?string $d, string $a, string $b): bool => $d !== null && $d >= $a && $d <= $b;
        $newCur = $newPrev = 0;
        foreach ($students as $s) {
            $d = self::day($s['created_at']);
            $newCur += $inWin($d, $start, $today) ? 1 : 0;
            $newPrev += $inWin($d, $prevStart, self::daysAgo($range + 1)) ? 1 : 0;
        }
        $revCur = $revPrev = $refundCur = 0;
        foreach ($pays as $p) {
            $d = self::day($p['paid_at']);
            if ($p['status'] === 'paid') {
                $revCur += $inWin($d, $start, $today) ? (int) $p['amount_cents'] : 0;
                $revPrev += $inWin($d, $prevStart, self::daysAgo($range + 1)) ? (int) $p['amount_cents'] : 0;
            } elseif ($inWin($d, $start, $today)) {
                $refundCur += (int) $p['amount_cents'];
            }
        }
        $lessonsCur = $lessonsPrev = 0;
        $activeCur = $activePrev = [];
        $sec = $rpe = 0;
        $daily = [];
        $rpeDist = array_fill(1, 10, 0);
        $lessonTop = [];
        foreach ($logs as $l) {
            $d = (string) $l['day'];
            if ($inWin($d, $start, $today)) {
                $lessonsCur++;
                $activeCur[$l['user_id']] = true;
                $sec += (int) $l['sec'];
                $rpe += (int) $l['rpe'];
                $rpeDist[max(1, min(10, (int) $l['rpe']))]++;
                $lessonTop[$l['lesson_id']]['n'] = ($lessonTop[$l['lesson_id']]['n'] ?? 0) + 1;
                $lessonTop[$l['lesson_id']]['rpe'] = ($lessonTop[$l['lesson_id']]['rpe'] ?? 0) + (int) $l['rpe'];
            } elseif ($inWin($d, $prevStart, self::daysAgo($range + 1))) {
                $lessonsPrev++;
                $activePrev[$l['user_id']] = true;
            }
            $daily[$d]['n'] = ($daily[$d]['n'] ?? 0) + 1;
            $daily[$d]['u'][$l['user_id']] = true;
        }
        $activeSubs = $mrr = 0;
        $activeUsers = [];
        $d30 = self::daysAgo(30);
        $activeAt30 = $canceled30 = 0;
        foreach ($subs as $s) {
            if ($s['status'] === 'active') {
                $activeUsers[$s['user_id']] = true;
                $mrr += intdiv((int) $s['price_cents'], $iv[$s['plan'] ?? 'monthly'] ?? 1);
            }
            $st = self::day($s['started_at']);
            $ca = self::day($s['canceled_at']);
            if ($st !== null && $st <= $d30 && ($ca === null || $ca > $d30)) {
                $activeAt30++;
            }
            if ($ca !== null && $ca > $d30) {
                $canceled30++;
            }
        }
        $activeSubs = count($activeUsers);
        $everSub = [];
        foreach ($subs as $s) {
            $everSub[$s['user_id']] = true;
        }
        $totalStudents = count($students);
        $wau = $mau = 0;
        $uW = $uM = [];
        $dauSum = 0;
        for ($i = 0; $i < 30; $i++) {
            $d = self::daysAgo($i);
            foreach (array_keys($daily[$d]['u'] ?? []) as $uid) {
                $uM[$uid] = true;
                if ($i < 7) {
                    $uW[$uid] = true;
                }
            }
            if ($i < 7) {
                $dauSum += count($daily[$d]['u'] ?? []);
            }
        }
        $wau = count($uW);
        $mau = count($uM);
        $dau = $dauSum / 7;

        /* ---- séries ---- */
        $months = self::months(12);
        $revM = array_fill_keys($months, 0);
        $refM = array_fill_keys($months, 0);
        foreach ($pays as $p) {
            $k = substr((string) $p['paid_at'], 0, 7);
            if (isset($revM[$k])) {
                if ($p['status'] === 'paid') {
                    $revM[$k] += (int) $p['amount_cents'];
                } else {
                    $refM[$k] += (int) $p['amount_cents'];
                }
            }
        }
        $newM = array_fill_keys($months, 0);
        foreach ($students as $s) {
            $k = substr((string) $s['created_at'], 0, 7);
            if (isset($newM[$k])) {
                $newM[$k]++;
            }
        }
        $mrrM = [];
        $churnM = array_fill_keys($months, 0);
        foreach ($months as $k) {
            $end = gmdate('Y-m-t', strtotime("$k-01 UTC"));
            $sum = 0;
            foreach ($subs as $s) {
                $st = self::day($s['started_at']);
                $ca = self::day($s['canceled_at']);
                if ($st !== null && $st <= $end && ($ca === null || $ca > $end)) {
                    $sum += intdiv((int) $s['price_cents'], $iv[$s['plan'] ?? 'monthly'] ?? 1);
                }
            }
            $mrrM[$k] = $sum;
        }
        foreach ($subs as $s) {
            $k = substr((string) ($s['canceled_at'] ?? ''), 0, 7);
            if (isset($churnM[$k])) {
                $churnM[$k]++;
            }
        }
        $series = [];
        foreach ($months as $k) {
            $series[] = ['month' => $k, 'revenue' => $revM[$k], 'refunds' => $refM[$k], 'mrr' => $mrrM[$k], 'newStudents' => $newM[$k], 'canceled' => $churnM[$k]];
        }
        $daily30 = [];
        for ($i = 29; $i >= 0; $i--) {
            $d = self::daysAgo($i);
            $signups = 0;
            foreach ($students as $s) {
                $signups += self::day($s['created_at']) === $d ? 1 : 0;
            }
            $daily30[] = ['day' => $d, 'lessons' => $daily[$d]['n'] ?? 0, 'active' => count($daily[$d]['u'] ?? []), 'signups' => $signups];
        }
        // mapa de calor: 12 semanas (segunda a domingo)
        $dow = (int) gmdate('N');
        $thisMonday = strtotime(self::daysAgo($dow - 1) . ' UTC');
        $heat = [];
        for ($w = 11; $w >= 0; $w--) {
            $row = [];
            for ($d = 0; $d < 7; $d++) {
                $day = gmdate('Y-m-d', $thisMonday - $w * 7 * 86400 + $d * 86400);
                $row[] = $day > $today ? null : ($daily[$day]['n'] ?? 0);
            }
            $heat[] = ['week' => gmdate('d/m', $thisMonday - $w * 7 * 86400), 'days' => $row];
        }
        // funil
        $firstLesson = [];
        foreach ($logs as $l) {
            $firstLesson[$l['user_id']] = true;
        }
        $retained = 0;
        foreach ($students as $id => $s) {
            if (($s['sub_status'] ?? '') === 'active' && ($s['last_day'] ?? '') >= self::daysAgo(14)) {
                $retained++;
            }
        }
        $funnel = [
            ['key' => 'registered', 'n' => $totalStudents],
            ['key' => 'anamnese', 'n' => count(array_intersect_key($students, $withAnam))],
            ['key' => 'first_lesson', 'n' => count(array_intersect_key($students, $firstLesson))],
            ['key' => 'subscribed', 'n' => count(array_intersect_key($students, $everSub))],
            ['key' => 'retained', 'n' => $retained],
        ];
        // coortes (retenção de atividade por mês de cadastro)
        $actMonth = [];
        foreach ($logs as $l) {
            $actMonth[$l['user_id']][substr((string) $l['day'], 0, 7)] = true;
        }
        $cohorts = [];
        foreach (self::months(6) as $ck) {
            $members = array_keys(array_filter($students, static fn($s) => substr((string) $s['created_at'], 0, 7) === $ck));
            $row = ['cohort' => $ck, 'size' => count($members), 'retention' => []];
            for ($k = 0; $k < 6; $k++) {
                $mk = gmdate('Y-m', strtotime("$ck-01 UTC +$k month"));
                if ($mk > gmdate('Y-m') || !$members) {
                    $row['retention'][] = null;
                    continue;
                }
                $hit = 0;
                foreach ($members as $uid) {
                    $hit += isset($actMonth[$uid][$mk]) ? 1 : 0;
                }
                $row['retention'][] = round($hit / count($members) * 100);
            }
            $cohorts[] = $row;
        }
        $phases = array_fill(1, 9, 0);
        foreach ($students as $s) {
            $phases[max(1, min(9, (int) ($s['phase'] ?? 1)))]++;
        }
        arsort($lessonTop);
        $top = [];
        foreach (array_slice($lessonTop, 0, 8, true) as $id => $v) {
            $top[] = ['lesson' => $id, 'n' => $v['n'], 'rpe' => round($v['rpe'] / max(1, $v['n']), 1)];
        }

        /* ---- listas ---- */
        $risk = [];
        foreach ($students as $s) {
            if (($s['sub_status'] ?? '') === 'active' && $s['status'] === 'active') {
                $last = $s['last_day'] ?? self::day($s['created_at']);
                $inactive = (int) floor((time() - strtotime($last . ' UTC')) / 86400);
                if ($inactive >= 7) {
                    $risk[] = ['id' => (int) $s['id'], 'name' => $s['name'], 'days' => $inactive, 'phase' => (int) $s['phase'], 'streak' => (int) $s['streak']];
                }
            }
        }
        usort($risk, static fn($a, $b) => $b['days'] <=> $a['days']);
        $riskCount = count($risk);
        $recent = array_slice(array_values($students), 0, 0);
        $byDate = array_values($students);
        usort($byDate, static fn($a, $b) => strcmp((string) $b['created_at'], (string) $a['created_at']));
        $recent = array_map(static fn($s) => ['id' => (int) $s['id'], 'name' => $s['name'], 'created_at' => $s['created_at'], 'phase' => (int) $s['phase'], 'sub' => $s['sub_status']], array_slice($byDate, 0, 8));

        $teachers = [];
        foreach (DB::all($pdo, "SELECT u.id, u.name, p.code FROM users u LEFT JOIN teacher_profiles p ON p.user_id = u.id WHERE u.role = 'teacher'" . self::cond($demo)) as $t) {
            $tid = (int) $t['id'];
            $mine = array_filter($students, static fn($s) => (int) $s['teacher_id'] === $tid);
            $act = array_filter($mine, static fn($s) => ($s['sub_status'] ?? '') === 'active');
            $com = (int) DB::one($pdo, "SELECT COALESCE(SUM(amount_cents), 0) AS s FROM commissions WHERE teacher_id = ? AND status <> 'void'", [$tid])['s'];
            $teachers[] = ['id' => $tid, 'name' => $t['name'], 'students' => count($mine), 'active' => count($act), 'mrr' => 0, 'commission' => $com, 'percent' => Billing::percentFor($pdo, $tid)];
        }
        $price = (int) Settings::all($pdo)['price_cents'];
        foreach ($teachers as &$t) {
            $t['mrr'] = $t['active'] * $price;
        }
        unset($t);
        usort($teachers, static fn($a, $b) => $b['active'] <=> $a['active']);

        $upcoming = DB::all($pdo, "SELECT a.id, a.starts_at, a.status, a.duration_min, u.name AS student, t.name AS teacher FROM appointments a JOIN users u ON u.id = a.user_id LEFT JOIN users t ON t.id = a.teacher_id
            WHERE a.starts_at >= ? AND a.status IN ('requested','confirmed')" . self::cond($demo, 'a.is_demo') . ' ORDER BY a.starts_at LIMIT 8', [DB::now()]);
        $alerts = [
            'riskStudents' => $riskCount,
            'consultsAwaiting' => (int) DB::one($pdo, "SELECT COUNT(*) AS n FROM appointments a WHERE a.status = 'requested' AND a.starts_at >= ?" . self::cond($demo, 'a.is_demo'), [DB::now()])['n'],
            'commissionsToApprove' => (int) DB::one($pdo, "SELECT COUNT(*) AS n FROM commissions c WHERE c.status = 'pending' AND c.available_at <= ?" . self::cond($demo, 'c.is_demo'), [DB::now()])['n'],
            'commissionsToPay' => (int) DB::one($pdo, "SELECT COALESCE(SUM(amount_cents),0) AS n FROM commissions c WHERE c.status = 'approved'" . self::cond($demo, 'c.is_demo'))['n'],
            'suspended' => count(array_filter($students, static fn($s) => $s['status'] === 'suspended')),
        ];

        return [
            'range' => $range,
            'generatedAt' => gmdate('c'),
            'kpis' => [
                'students' => ['value' => $totalStudents, 'delta' => self::pct($newCur, $newPrev), 'new' => $newCur],
                'activeSubs' => ['value' => $activeSubs, 'conversion' => $totalStudents ? round($activeSubs / $totalStudents * 100, 1) : 0],
                'mrr' => ['value' => $mrr, 'arpu' => $activeSubs ? intdiv($mrr, $activeSubs) : 0],
                'revenue' => ['value' => $revCur, 'delta' => self::pct($revCur, $revPrev), 'refunds' => $refundCur],
                'churn' => ['value' => $activeAt30 ? round($canceled30 / $activeAt30 * 100, 1) : 0, 'canceled' => $canceled30],
                'lessons' => ['value' => $lessonsCur, 'delta' => self::pct($lessonsCur, $lessonsPrev), 'perActive' => count($activeCur) ? round($lessonsCur / count($activeCur), 1) : 0],
                'active' => ['dau' => round($dau, 1), 'wau' => $wau, 'mau' => $mau, 'stickiness' => $mau ? round($dau / $mau * 100, 1) : 0, 'delta' => self::pct((float) count($activeCur), (float) count($activePrev))],
                'effort' => ['rpe' => $lessonsCur ? round($rpe / $lessonsCur, 1) : 0, 'minutes' => $lessonsCur ? round($sec / $lessonsCur / 60, 1) : 0],
            ],
            'series' => $series,
            'daily' => $daily30,
            'heatmap' => $heat,
            'funnel' => $funnel,
            'cohorts' => $cohorts,
            'phases' => array_values($phases),
            'rpeDistribution' => array_values($rpeDist),
            'topLessons' => $top,
            'risk' => array_slice($risk, 0, 8),
            'recent' => $recent,
            'teachers' => array_slice($teachers, 0, 6),
            'upcoming' => $upcoming,
            'alerts' => $alerts,
        ];
    }

    /** @return array<string,mixed> */
    public static function billing(PDO $pdo, string $demo): array
    {
        $now = DB::now();
        $d30 = self::daysAgo(30);
        $d60 = self::daysAgo(60);
        $c = self::cond($demo);
        $pays = DB::all($pdo, "SELECT p.amount_cents, p.status, p.method, COALESCE(p.paid_at, p.created_at) AS paid_at FROM payments p JOIN users u ON u.id = p.user_id WHERE COALESCE(p.paid_at, p.created_at) >= ? $c", [self::daysAgo(90) . ' 00:00:00']);
        $rev30 = $revPrev = $ref30 = $failed30 = 0;
        $byMethod = ['card' => ['n' => 0, 'cents' => 0], 'pix' => ['n' => 0, 'cents' => 0]];
        $dailyRev = [];
        for ($i = 29; $i >= 0; $i--) {
            $dailyRev[self::daysAgo($i)] = 0;
        }
        foreach ($pays as $p) {
            $d = self::day($p['paid_at']);
            if ($p['status'] === 'paid') {
                if ($d >= $d30) {
                    $rev30 += (int) $p['amount_cents'];
                    if (isset($dailyRev[$d])) {
                        $dailyRev[$d] += (int) $p['amount_cents'];
                    }
                } elseif ($d >= $d60) {
                    $revPrev += (int) $p['amount_cents'];
                }
                $mth = $p['method'] === 'pix' ? 'pix' : 'card';
                $byMethod[$mth]['n']++;
                $byMethod[$mth]['cents'] += (int) $p['amount_cents'];
            } elseif ($p['status'] === 'refunded' && $d >= $d30) {
                $ref30 += (int) $p['amount_cents'];
            } elseif ($p['status'] === 'failed' && $d >= $d30) {
                $failed30++;
            }
        }
        $subs = DB::all($pdo, "SELECT s.status, s.plan, s.price_cents, s.started_at, s.canceled_at FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE 1=1 $c");
        $iv = Pricing::intervals($pdo);   // MRR = valor do ciclo ÷ meses do plano
        $active = $mrr = $activeAt30 = $cancel30 = 0;
        $statuses = ['active' => 0, 'canceled' => 0, 'past_due' => 0];
        foreach ($subs as $s) {
            $statuses[$s['status']] = ($statuses[$s['status']] ?? 0) + 1;
            if ($s['status'] === 'active') {
                $active++;
                $mrr += intdiv((int) $s['price_cents'], $iv[$s['plan'] ?? 'monthly'] ?? 1);
            }
            $st = self::day($s['started_at']);
            $ca = self::day($s['canceled_at']);
            if ($st <= $d30 && ($ca === null || $ca > $d30)) {
                $activeAt30++;
            }
            if ($ca !== null && $ca > $d30) {
                $cancel30++;
            }
        }
        $churn = $activeAt30 ? $cancel30 / $activeAt30 : 0;
        $arpu = $active ? intdiv($mrr, $active) : 0;
        $com = [];
        foreach (DB::all($pdo, 'SELECT c.status, COALESCE(SUM(c.amount_cents),0) AS cents, COUNT(*) AS n FROM commissions c WHERE 1=1' . self::cond($demo, 'c.is_demo') . ' GROUP BY c.status') as $r) {
            $com[$r['status']] = ['cents' => (int) $r['cents'], 'n' => (int) $r['n']];
        }
        $dueNow = (int) DB::one($pdo, "SELECT COALESCE(SUM(amount_cents),0) AS s FROM commissions c WHERE c.status = 'pending' AND c.available_at <= ?" . self::cond($demo, 'c.is_demo'), [$now])['s'];
        $series = [];
        foreach ($dailyRev as $d => $v) {
            $series[] = ['day' => $d, 'cents' => $v];
        }
        return [
            'mrr' => $mrr, 'arr' => $mrr * 12, 'activeSubs' => $active, 'arpu' => $arpu,
            'revenue30' => $rev30, 'revenueDelta' => self::pct((float) $rev30, (float) $revPrev),
            'refunds30' => $ref30, 'refundRate' => $rev30 ? round($ref30 / ($rev30 + $ref30) * 100, 1) : 0, 'failed30' => $failed30,
            'churn30' => round($churn * 100, 1), 'ltv' => $churn > 0 ? (int) round($arpu / $churn) : null,
            'byMethod' => $byMethod, 'statuses' => $statuses, 'commissions' => $com, 'commissionsDueNow' => $dueNow,
            'dailyRevenue' => $series,
        ];
    }

    /** @return array<string,mixed> */
    public static function teacher(PDO $pdo, int $tid): array
    {
        $students = DB::all($pdo, 'SELECT u.id, u.name, u.created_at, u.status, s.phase, s.xp, s.streak, s.sub_status, s.last_day FROM users u LEFT JOIN user_stats s ON s.user_id = u.id WHERE u.teacher_id = ? ORDER BY u.created_at DESC', [$tid]);
        $active = array_values(array_filter($students, static fn($s) => ($s['sub_status'] ?? '') === 'active'));
        $price = (int) Settings::all($pdo)['price_cents'];
        $pct = Billing::percentFor($pdo, $tid);
        $tiers = Settings::all($pdo)['commission_tiers'];
        usort($tiers, static fn($a, $b) => $a['min'] <=> $b['min']);
        $next = null;
        foreach ($tiers as $t) {
            if ($t['min'] > count($active)) {
                $next = ['id' => $t['id'], 'min' => $t['min'], 'percent' => $t['percent'], 'missing' => $t['min'] - count($active)];
                break;
            }
        }
        $com = [];
        foreach (DB::all($pdo, 'SELECT status, COALESCE(SUM(amount_cents),0) AS cents, COUNT(*) AS n FROM commissions WHERE teacher_id = ? GROUP BY status', [$tid]) as $r) {
            $com[$r['status']] = ['cents' => (int) $r['cents'], 'n' => (int) $r['n']];
        }
        $months = self::months(6);
        $comM = array_fill_keys($months, 0);
        foreach (DB::all($pdo, "SELECT amount_cents, created_at FROM commissions WHERE teacher_id = ? AND status <> 'void'", [$tid]) as $r) {
            $k = substr((string) $r['created_at'], 0, 7);
            if (isset($comM[$k])) {
                $comM[$k] += (int) $r['amount_cents'];
            }
        }
        $newM = array_fill_keys($months, 0);
        foreach ($students as $s) {
            $k = substr((string) $s['created_at'], 0, 7);
            if (isset($newM[$k])) {
                $newM[$k]++;
            }
        }
        $series = [];
        foreach ($months as $k) {
            $series[] = ['month' => $k, 'commission' => $comM[$k], 'newStudents' => $newM[$k]];
        }
        $risk = [];
        foreach ($active as $s) {
            $last = $s['last_day'] ?? self::day($s['created_at']);
            $in = (int) floor((time() - strtotime($last . ' UTC')) / 86400);
            if ($in >= 7) {
                $risk[] = ['id' => (int) $s['id'], 'name' => $s['name'], 'days' => $in];
            }
        }
        usort($risk, static fn($a, $b) => $b['days'] <=> $a['days']);
        return [
            'students' => count($students), 'active' => count($active), 'mrr' => count($active) * $price,
            'percent' => $pct, 'nextTier' => $next, 'commissions' => $com, 'series' => $series,
            'risk' => array_slice($risk, 0, 8),
            'avgStreak' => $students ? round(array_sum(array_map(static fn($s) => (int) $s['streak'], $students)) / count($students), 1) : 0,
        ];
    }
}
