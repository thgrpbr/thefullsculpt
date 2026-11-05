<?php
declare(strict_types=1);

namespace TFS;

use PDO;

/** Calendário comercial: feriados nacionais, datas móveis e datas de promoção, por ano. */
final class FestiveCalendar
{
    /** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
    public static function easter(int $y): \DateTimeImmutable
    {
        $a = $y % 19;
        $b = intdiv($y, 100);
        $c = $y % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;
        return new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $y, $month, $day));
    }

    /** n-ésimo dia da semana (0=domingo) do mês. */
    private static function nth(int $y, int $m, int $dow, int $n): \DateTimeImmutable
    {
        $d = new \DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m));
        $shift = ($dow - (int) $d->format('w') + 7) % 7;
        return $d->modify('+' . ($shift + 7 * ($n - 1)) . ' days');
    }

    /**
     * Eventos internos do ano. kind: holiday (feriado), optional (ponto facultativo), commercial (data de vendas), health (saúde/fitness).
     * @return list<array{key:string,date:string,name:string,kind:string,custom:bool,id:?int}>
     */
    public static function builtin(int $y): array
    {
        $e = self::easter($y);
        $bf = self::nth($y, 11, 4, 4)->modify('+1 day');   // sexta após a 4ª quinta de novembro
        $ev = [
            ['confraternizacao', "$y-01-01", 'Confraternização Universal', 'holiday'],
            ['carnaval_seg', $e->modify('-48 days')->format('Y-m-d'), 'Segunda de Carnaval', 'optional'],
            ['carnaval', $e->modify('-47 days')->format('Y-m-d'), 'Carnaval', 'optional'],
            ['dia_mulher', "$y-03-08", 'Dia Internacional da Mulher', 'commercial'],
            ['dia_consumidor', "$y-03-15", 'Dia do Consumidor', 'commercial'],
            ['sexta_santa', $e->modify('-2 days')->format('Y-m-d'), 'Sexta-Feira Santa', 'holiday'],
            ['pascoa', $e->format('Y-m-d'), 'Páscoa', 'commercial'],
            ['dia_saude', "$y-04-07", 'Dia Mundial da Saúde', 'health'],
            ['tiradentes', "$y-04-21", 'Tiradentes', 'holiday'],
            ['dia_trabalho', "$y-05-01", 'Dia do Trabalho', 'holiday'],
            ['dia_maes', self::nth($y, 5, 0, 2)->format('Y-m-d'), 'Dia das Mães', 'commercial'],
            ['dia_namorados', "$y-06-12", 'Dia dos Namorados', 'commercial'],
            ['corpus_christi', $e->modify('+60 days')->format('Y-m-d'), 'Corpus Christi', 'optional'],
            ['dia_pais', self::nth($y, 8, 0, 2)->format('Y-m-d'), 'Dia dos Pais', 'commercial'],
            ['dia_educacao_fisica', "$y-09-01", 'Dia do Profissional de Educação Física', 'health'],
            ['independencia', "$y-09-07", 'Independência do Brasil', 'holiday'],
            ['dia_cliente', "$y-09-15", 'Dia do Cliente', 'commercial'],
            ['dia_professor', "$y-10-15", 'Dia do Professor', 'commercial'],
            ['aparecida', "$y-10-12", 'Nossa Senhora Aparecida', 'holiday'],
            ['finados', "$y-11-02", 'Finados', 'holiday'],
            ['republica', "$y-11-15", 'Proclamação da República', 'holiday'],
            ['consciencia_negra', "$y-11-20", 'Dia da Consciência Negra', 'holiday'],
            ['black_friday', $bf->format('Y-m-d'), 'Black Friday', 'commercial'],
            ['cyber_monday', $bf->modify('+3 days')->format('Y-m-d'), 'Cyber Monday', 'commercial'],
            ['natal', "$y-12-25", 'Natal', 'holiday'],
            ['reveillon', "$y-12-31", 'Réveillon / Ano Novo', 'commercial'],
        ];
        usort($ev, static fn($a, $b) => strcmp($a[1], $b[1]));
        return array_map(static fn($x) => ['key' => $x[0], 'date' => $x[1], 'name' => $x[2], 'kind' => $x[3], 'custom' => false, 'id' => null], $ev);
    }

    /** Eventos internos + personalizados (cadastrados no admin) do ano. @return list<array<string,mixed>> */
    public static function year(PDO $pdo, int $y): array
    {
        $out = self::builtin($y);
        foreach (DB::all($pdo, 'SELECT id, date, name, kind, yearly FROM calendar_events WHERE active = 1 ORDER BY date') as $c) {
            $d = (string) $c['date'];
            if ((int) substr($d, 0, 4) === $y) {
                $date = $d;
            } elseif ((int) $c['yearly'] === 1 && (int) substr($d, 0, 4) < $y) {
                $date = $y . substr($d, 4);
            } else {
                continue;
            }
            $out[] = ['key' => 'custom_' . $c['id'], 'date' => $date, 'name' => (string) $c['name'], 'kind' => (string) $c['kind'], 'custom' => true, 'id' => (int) $c['id']];
        }
        usort($out, static fn($a, $b) => strcmp((string) $a['date'], (string) $b['date']) ?: strcmp((string) $a['name'], (string) $b['name']));
        return $out;
    }
}

/** Planos, promoções, códigos promocionais e a regra de composição do preço final. */
final class Pricing
{
    public const INTERVALS = [1, 3, 6, 12];

    public static function today(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('America/Sao_Paulo')))->format('Y-m-d');
    }

    /** @return array<string,mixed> */
    public static function rules(PDO $pdo): array
    {
        $r = Settings::all($pdo)['pricing_rules'] ?? [];
        return [
            'max_discount_pct' => max(0, min(100, (int) ($r['max_discount_pct'] ?? 70))),
            'allow_stack' => ($r['allow_stack'] ?? false) === true,
            'min_price_cents' => max(0, (int) ($r['min_price_cents'] ?? 990)),
        ];
    }

    /** @param array<string,mixed> $p @return array<string,mixed> visão pública/admin do plano */
    public static function planView(array $p): array
    {
        $f = json_decode((string) ($p['features'] ?? ''), true);
        $f = is_array($f) ? $f : [];
        return [
            'id' => (int) $p['id'], 'slug' => $p['slug'],
            'name' => ['pt' => $p['name_pt'], 'en' => $p['name_en'] ?: $p['name_pt'], 'es' => $p['name_es'] ?: $p['name_pt']],
            'description' => ['pt' => $p['desc_pt'], 'en' => $p['desc_en'] ?: $p['desc_pt'], 'es' => $p['desc_es'] ?: $p['desc_pt']],
            'features' => ['pt' => array_values($f['pt'] ?? []), 'en' => array_values($f['en'] ?? []), 'es' => array_values($f['es'] ?? [])],
            'interval_months' => (int) $p['interval_months'], 'price_cents' => (int) $p['price_cents'],
            'active' => (bool) $p['active'], 'featured' => (bool) $p['featured'], 'sort' => (int) $p['sort'],
        ];
    }

    /** @return array<string,int> slug => meses do ciclo (para MRR) */
    public static function intervals(PDO $pdo): array
    {
        $out = ['monthly' => 1];
        foreach (DB::all($pdo, 'SELECT slug, interval_months FROM plans') as $r) {
            $out[$r['slug']] = max(1, (int) $r['interval_months']);
        }
        return $out;
    }

    private static function discountOf(string $kind, int $value, int $base): int
    {
        $d = $kind === 'percent' ? intdiv($base * $value, 100) : $value;
        return max(0, min($d, $base));
    }

    /** @param mixed $ids lista JSON de ids ou null (todos) */
    private static function appliesTo(mixed $ids, int $planId): bool
    {
        $list = is_string($ids) && $ids !== '' ? json_decode($ids, true) : null;
        return !is_array($list) || $list === [] || in_array($planId, array_map('intval', $list), true);
    }

    private static function hasPaid(PDO $pdo, ?int $userId): bool
    {
        return $userId !== null && DB::one($pdo, "SELECT id FROM payments WHERE user_id = ? AND status = 'paid' AND is_demo = 0", [$userId]) !== null;
    }

    /** Valida um código para um plano/aluno. @return array{ok:bool,error?:string,row?:array<string,mixed>} */
    public static function checkCode(PDO $pdo, string $code, array $plan, ?int $userId): array
    {
        $code = strtoupper(trim($code));
        $row = $code !== '' ? DB::one($pdo, 'SELECT * FROM promo_codes WHERE code = ?', [$code]) : null;
        if (!$row || !(int) $row['active']) {
            return ['ok' => false, 'error' => 'code_invalid'];
        }
        $today = self::today();
        if (($row['starts_on'] && $today < $row['starts_on']) || ($row['ends_on'] && $today > $row['ends_on'])) {
            return ['ok' => false, 'error' => 'code_expired'];
        }
        if ($row['max_uses'] !== null && (int) $row['uses'] >= (int) $row['max_uses']) {
            return ['ok' => false, 'error' => 'code_exhausted'];
        }
        if (!self::appliesTo($row['plan_ids'], (int) $plan['id'])) {
            return ['ok' => false, 'error' => 'code_not_for_plan'];
        }
        if ((int) $row['first_purchase_only'] && self::hasPaid($pdo, $userId)) {
            return ['ok' => false, 'error' => 'code_first_purchase'];
        }
        if ($userId !== null && DB::one($pdo, 'SELECT id FROM promo_redemptions WHERE code_id = ? AND user_id = ?', [$row['id'], $userId])) {
            return ['ok' => false, 'error' => 'code_already_used'];
        }
        return ['ok' => true, 'row' => $row];
    }

    /**
     * Preço final de um plano. Regras: promoção automática vigente (a melhor) e/ou código; por padrão vale o MAIOR desconto
     * (não acumulam), a menos que as regras permitam acumular e o código seja "acumulável". O total respeita o desconto máximo
     * (%) e o preço mínimo configurados.
     *
     * @param array<string,mixed> $plan linha de plans @return array<string,mixed>
     */
    public static function quote(PDO $pdo, array $plan, ?string $code, ?int $userId): array
    {
        $base = (int) $plan['price_cents'];
        $rules = self::rules($pdo);
        $today = self::today();
        $paid = self::hasPaid($pdo, $userId);

        $promo = null;
        foreach (DB::all($pdo, 'SELECT * FROM promotions WHERE active = 1') as $p) {
            if (($p['starts_on'] && $today < $p['starts_on']) || ($p['ends_on'] && $today > $p['ends_on'])) {
                continue;
            }
            if (!self::appliesTo($p['plan_ids'], (int) $plan['id']) || ((int) $p['first_purchase_only'] && $paid)) {
                continue;
            }
            $d = self::discountOf((string) $p['kind'], (int) $p['value'], $base);
            if ($d > 0 && ($promo === null || $d > $promo['discount_cents'])) {
                $promo = ['id' => (int) $p['id'], 'name' => $p['name'], 'label' => $p['label'], 'kind' => $p['kind'], 'value' => (int) $p['value'], 'discount_cents' => $d];
            }
        }

        $codeOut = null;
        $codeError = null;
        $codeRow = null;
        if ($code !== null && trim($code) !== '') {
            $chk = self::checkCode($pdo, $code, $plan, $userId);
            if ($chk['ok']) {
                $codeRow = $chk['row'];
            } else {
                $codeError = $chk['error'];
            }
        }

        $promoDisc = $promo['discount_cents'] ?? 0;
        $codeDisc = 0;
        $stacked = false;
        if ($codeRow) {
            if ($promo && $rules['allow_stack'] && (int) $codeRow['stackable']) {
                $codeDisc = self::discountOf((string) $codeRow['kind'], (int) $codeRow['value'], $base - $promoDisc);
                $stacked = true;
            } else {
                $codeDisc = self::discountOf((string) $codeRow['kind'], (int) $codeRow['value'], $base);
                if ($promo && $codeDisc <= $promoDisc) {
                    $codeError = 'promo_better';      // a promoção já dá desconto maior: o código não é consumido
                    $codeRow = null;
                    $codeDisc = 0;
                } elseif ($promo) {
                    $promoDisc = 0;                     // o código vence a promoção
                    $promo = null;
                }
            }
        }

        $discount = $promoDisc + $codeDisc;
        $limit = max(0, min(intdiv($base * $rules['max_discount_pct'], 100), $base - $rules['min_price_cents']));
        $capped = $discount > $limit;
        $discount = min($discount, $limit);

        if ($codeRow) {
            $codeOut = ['id' => (int) $codeRow['id'], 'code' => $codeRow['code'], 'kind' => $codeRow['kind'], 'value' => (int) $codeRow['value'], 'discount_cents' => $codeDisc];
        }
        return [
            'plan_id' => (int) $plan['id'], 'base_cents' => $base, 'promo' => $promo, 'code' => $codeOut, 'code_error' => $codeError,
            'discount_cents' => $discount, 'total_cents' => $base - $discount, 'discount_pct' => $base > 0 ? (int) round($discount / $base * 100) : 0,
            'stacked' => $stacked, 'capped' => $capped,
        ];
    }

    /** Plano padrão da venda: destacado e ativo, senão o primeiro ativo. @return array<string,mixed>|null */
    public static function defaultPlan(PDO $pdo): ?array
    {
        return DB::one($pdo, 'SELECT * FROM plans WHERE active = 1 ORDER BY featured DESC, sort ASC, id ASC');
    }
}
