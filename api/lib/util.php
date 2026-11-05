<?php
declare(strict_types=1);

namespace TFS;

final class Util
{
    /** @return array{0:int,1:int,2:int} [página, tamanho, offset] */
    public static function page(int $maxSize = 100): array
    {
        $p = max(1, (int) ($_GET['page'] ?? 1));
        $s = min($maxSize, max(5, (int) ($_GET['size'] ?? 20)));
        return [$p, $s, ($p - 1) * $s];
    }

    /** Filtro de dados de demonstração: all | real | only */
    public static function demoSql(string $col = 'is_demo'): string
    {
        return match ($_GET['demo'] ?? 'all') {
            'real' => " AND $col = 0",
            'only' => " AND $col = 1",
            default => '',
        };
    }

    public static function like(string $s): string
    {
        return '%' . str_replace(['%', '_', '\\'], '', trim($s)) . '%';
    }

    public static function slugCode(string $name): string
    {
        $base = strtoupper(preg_replace('/[^A-Za-z]/', '', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: 'PROF') ?? 'PROF');
        return substr($base !== '' ? $base : 'PROF', 0, 8);
    }

    /** @param list<string> $header @param list<list<mixed>> $rows */
    public static function csv(string $filename, array $header, array $rows): never
    {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");
        $clean = static fn($v) => is_string($v) && $v !== '' && in_array($v[0], ['=', '+', '-', '@'], true) ? "'" . $v : $v;
        fputcsv($out, $header, ';', '"', '\\');
        foreach ($rows as $r) {
            fputcsv($out, array_map($clean, $r), ';', '"', '\\');
        }
        fclose($out);
        exit;
    }

    /** @return list<string> */
    public static function muscles(mixed $v): array
    {
        $valid = ['quads', 'hamstrings', 'glutes', 'calves', 'abs', 'erector', 'lats', 'pecs', 'traps', 'deltoids', 'biceps', 'triceps'];
        if (!is_array($v)) {
            return [];
        }
        return array_values(array_unique(array_filter($v, static fn($m) => is_string($m) && in_array($m, $valid, true))));
    }

    public static function utc(string $local, string $tz = 'America/Sao_Paulo'): string
    {
        $d = new \DateTimeImmutable($local, new \DateTimeZone($tz));
        return $d->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    public static function money(int $cents): string
    {
        return number_format($cents / 100, 2, ',', '.');
    }

    /** Rótulo curto do dispositivo ("Chrome · Windows") a partir do User-Agent. */
    public static function uaLabel(?string $ua = null): string
    {
        $ua ??= (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
        $os = str_contains($ua, 'Windows') ? 'Windows' : (str_contains($ua, 'iPhone') || str_contains($ua, 'iPad') ? 'iOS' : (str_contains($ua, 'Android') ? 'Android' : (str_contains($ua, 'Mac OS') ? 'macOS' : (str_contains($ua, 'Linux') ? 'Linux' : 'Outro'))));
        $br = str_contains($ua, 'Edg/') ? 'Edge' : (str_contains($ua, 'OPR/') ? 'Opera' : (str_contains($ua, 'Chrome/') ? 'Chrome' : (str_contains($ua, 'Firefox/') ? 'Firefox' : (str_contains($ua, 'Safari/') ? 'Safari' : 'Navegador'))));
        return "$br · $os";
    }
}
