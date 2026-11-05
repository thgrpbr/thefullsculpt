<?php
declare(strict_types=1);

/**
 * Admin > E-mails / Layouts. Permissão "emails.manage" (validada em index.php).
 *  GET    /admin/emails                  modelos (padrão + edição) e layout
 *  PUT    /admin/emails/layout           cores, marca e rodapé comuns a todos os e-mails
 *  PUT    /admin/emails/{kind}/{lang}    edita um modelo
 *  DELETE /admin/emails/{kind}/{lang}    volta ao texto padrão
 *  POST   /admin/emails/preview          HTML de pré-visualização (sem salvar)
 *  POST   /admin/emails/{kind}/test      envia o modelo para o e-mail de quem está logado
 */

use TFS\Audit;
use TFS\DB;
use TFS\Http;
use TFS\Mailer;
use TFS\Settings;

$me = requireRole($pdo, $cfg, ['admin', 'legal', 'staff']);
$uid = (int) $me['id'];
$route = "$method $path";
$m = [];

const EMAIL_KINDS = [
    'verify' => 'Confirmação de e-mail (cadastro)',
    'reset' => 'Recuperação de senha',
    'welcome' => 'Boas-vindas',
    'appointment' => 'Consulta confirmada',
    'test' => 'E-mail de teste (SMTP)',
];

/** Valida e normaliza os campos de um modelo. @return array{subject:string,title:string,body:string,cta:string,foot:string} */
$clean = static function (array $b): array {
    $lim = ['subject' => 200, 'title' => 200, 'body' => 4000, 'cta' => 80, 'foot' => 400];
    $out = [];
    foreach ($lim as $k => $max) {
        $v = trim((string) ($b[$k] ?? ''));
        if (mb_strlen($v) > $max) {
            Http::fail(422, 'too_long');
        }
        $out[$k] = $v;
    }
    if ($out['title'] === '' || $out['body'] === '') {
        Http::fail(422, 'invalid_input');
    }
    if ($out['subject'] === '') {
        $out['subject'] = $out['title'];
    }
    return $out;
};
$sample = ['when' => '12/12 às 10:00', 'name' => 'Marina', 'url' => Mailer::publicUrl($pdo) . '/pt/app/'];

if ($route === 'GET /admin/emails') {
    $items = [];
    foreach (EMAIL_KINDS as $kind => $label) {
        $langs = [];
        foreach (['pt', 'en', 'es'] as $l) {
            $c = Mailer::content($pdo, $kind, $l);
            [$dt, $db, $dc, $df] = Mailer::DEFAULTS[$kind][$l];
            $langs[$l] = $c + ['default' => ['subject' => $dt, 'title' => $dt, 'body' => $db, 'cta' => $dc, 'foot' => $df]];
        }
        $items[] = ['kind' => $kind, 'label' => $label, 'langs' => $langs];
    }
    Http::json(['items' => $items, 'layout' => Mailer::layout($pdo), 'layout_defaults' => Mailer::LAYOUT_DEFAULTS, 'smtp_enabled' => Mailer::enabled($pdo),
        'variables' => ['{name}' => 'primeiro nome do aluno', '{when}' => 'data e hora da consulta']]);
}

if ($route === 'PUT /admin/emails/layout') {
    $b = Http::body();
    $bad = static fn() => Http::fail(422, 'invalid_input');
    foreach (['bg', 'card', 'text', 'muted', 'button', 'button_text'] as $k) {
        if (isset($b[$k]) && (!is_string($b[$k]) || !preg_match('/^#[0-9a-fA-F]{6}$/', $b[$k]))) {
            $bad();
        }
    }
    if (isset($b['brand']) && (!is_string($b['brand']) || mb_strlen(trim($b['brand'])) > 60)) {
        $bad();
    }
    if (isset($b['footer']) && (!is_string($b['footer']) || mb_strlen($b['footer']) > 400)) {
        $bad();
    }
    $layout = Mailer::layout($pdo, $b);
    Settings::set($pdo, 'email_layout', $layout);
    Audit::log($pdo, $cfg, $uid, 'admin_email_layout');
    Http::json(['ok' => true, 'layout' => $layout]);
}

if ($route === 'POST /admin/emails/preview') {
    $b = Http::body();
    $kind = (string) ($b['kind'] ?? '');
    $lang = (string) ($b['lang'] ?? 'pt');
    if (!isset(EMAIL_KINDS[$kind]) || !in_array($lang, ['pt', 'en', 'es'], true)) {
        Http::fail(422, 'invalid_input');
    }
    $content = is_array($b['content'] ?? null) ? $clean($b['content']) : Mailer::content($pdo, $kind, $lang);
    [$subject, $html] = Mailer::render($pdo, $content, Mailer::layout($pdo, is_array($b['layout'] ?? null) ? $b['layout'] : null), $sample);
    Http::json(['subject' => $subject, 'html' => $html]);
}

if (preg_match('#^/admin/emails/(verify|reset|welcome|appointment|test)/test$#', $path, $m) && $method === 'POST') {
    if (!Mailer::enabled($pdo)) {
        Http::fail(409, 'smtp_disabled');
    }
    $b = Http::body();
    $lang = in_array($b['lang'] ?? '', ['pt', 'en', 'es'], true) ? (string) $b['lang'] : 'pt';
    [$subject, $html, $text] = Mailer::template($pdo, $m[1], $lang, $sample);
    $r = Mailer::send($pdo, $cfg, (string) $me['email'], '[TESTE] ' . $subject, $html, $text);
    Audit::log($pdo, $cfg, $uid, 'admin_email_test', $m[1]);
    Http::json(['ok' => $r['ok'], 'to' => $me['email'], 'error' => $r['ok'] ? null : $r['error']]);
}

if (preg_match('#^/admin/emails/(verify|reset|welcome|appointment|test)/(pt|en|es)$#', $path, $m)) {
    [, $kind, $lang] = $m;
    if ($method === 'PUT') {
        $c = $clean(Http::body());
        $now = DB::now();
        if (DB::one($pdo, 'SELECT kind FROM email_templates WHERE kind = ? AND lang = ?', [$kind, $lang])) {
            DB::run($pdo, 'UPDATE email_templates SET subject = ?, title = ?, body = ?, cta = ?, foot = ?, updated_by = ?, updated_at = ? WHERE kind = ? AND lang = ?',
                [$c['subject'], $c['title'], $c['body'], $c['cta'], $c['foot'], $uid, $now, $kind, $lang]);
        } else {
            DB::run($pdo, 'INSERT INTO email_templates (kind, lang, subject, title, body, cta, foot, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$kind, $lang, $c['subject'], $c['title'], $c['body'], $c['cta'], $c['foot'], $uid, $now]);
        }
        Audit::log($pdo, $cfg, $uid, 'admin_email_template', "$kind/$lang");
        Http::json(['ok' => true]);
    }
    if ($method === 'DELETE') {
        DB::run($pdo, 'DELETE FROM email_templates WHERE kind = ? AND lang = ?', [$kind, $lang]);
        Audit::log($pdo, $cfg, $uid, 'admin_email_template_reset', "$kind/$lang");
        Http::json(['ok' => true]);
    }
}

Http::fail(404, 'not_found');
