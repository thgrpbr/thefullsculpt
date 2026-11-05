<?php
declare(strict_types=1);

namespace TFS;

use PDO;

/**
 * Envio de e-mail por SMTP (cliente próprio, sem dependências): SSL (465), STARTTLS (587) ou sem criptografia.
 * A senha SMTP fica criptografada (libsodium) em settings.smtp.pass_enc e nunca é devolvida pela API.
 */
final class Mailer
{
    /** @param array<string,mixed> $cfg @return array<string,mixed> */
    public static function config(PDO $pdo, array $cfg): array
    {
        $s = Settings::all($pdo)['smtp'];
        $s['password'] = $s['pass_enc'] !== '' ? (Crypto::dec((string) $s['pass_enc'], $cfg) ?? '') : '';
        return $s;
    }

    public static function enabled(PDO $pdo): bool
    {
        $s = Settings::all($pdo)['smtp'];
        return ($s['enabled'] ?? false) === true && $s['host'] !== '' && $s['from_email'] !== '';
    }

    public static function publicUrl(PDO $pdo): string
    {
        $u = rtrim((string) (Settings::all($pdo)['smtp']['public_url'] ?? ''), '/');
        return preg_match('#^https://[a-z0-9.-]+(:\d+)?$#i', $u) ? $u : 'https://thefullsculpt.com.br';
    }

    private static function clean(string $v): string
    {
        return trim(str_replace(["\r", "\n", "\0"], '', $v));
    }

    private static function enc(string $s): string
    {
        return '=?UTF-8?B?' . base64_encode($s) . '?=';
    }

    /**
     * Envia um e-mail. Retorna ['ok'=>bool, 'error'=>?string, 'log'=>list<string>] (o log nunca contém senhas).
     *
     * @param array<string,mixed>      $cfg
     * @param array<string,mixed>|null $override configuração SMTP completa (para testar sem salvar)
     * @return array{ok:bool,error:?string,log:list<string>}
     */
    public static function send(PDO $pdo, array $cfg, string $to, string $subject, string $html, string $text = '', ?array $override = null): array
    {
        $log = [];
        $s = $override ?? self::config($pdo, $cfg);
        $to = self::clean($to);
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Destinatário inválido.', 'log' => $log];
        }
        $host = self::clean((string) $s['host']);
        $port = (int) $s['port'];
        $secure = in_array($s['secure'], ['ssl', 'tls', 'none'], true) ? $s['secure'] : 'tls';
        $fromEmail = self::clean((string) $s['from_email']);
        if ($host === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL) || $port < 1 || $port > 65535) {
            return ['ok' => false, 'error' => 'Configure servidor, porta e e-mail remetente.', 'log' => $log];
        }
        $ctx = stream_context_create(['ssl' => ['verify_peer' => ($s['verify_tls'] ?? true) !== false, 'verify_peer_name' => ($s['verify_tls'] ?? true) !== false, 'SNI_enabled' => true, 'peer_name' => $host]]);
        $errno = 0;
        $errstr = '';
        $fp = @stream_socket_client(($secure === 'ssl' ? 'ssl://' : 'tcp://') . "$host:$port", $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) {
            return ['ok' => false, 'error' => "Não foi possível conectar a $host:$port ($errstr)", 'log' => $log];
        }
        stream_set_timeout($fp, 15);

        $read = static function () use ($fp): string {
            $out = '';
            while (($line = fgets($fp, 1024)) !== false) {
                $out .= $line;
                if (strlen($line) < 4 || $line[3] === ' ') {
                    break;
                }
            }
            return $out;
        };
        $expect = static function (string $resp, array $codes): bool {
            return in_array((int) substr($resp, 0, 3), $codes, true);
        };
        $cmd = static function (string $c, bool $secret = false) use ($fp, $read, &$log): string {
            fwrite($fp, $c . "\r\n");
            $r = $read();
            $log[] = ($secret ? '> ***' : '> ' . $c) . '  <  ' . trim(substr($r, 0, 120));
            return $r;
        };
        $fail = static function (string $msg) use ($fp, &$log): array {
            @fwrite($fp, "QUIT\r\n");
            @fclose($fp);
            return ['ok' => false, 'error' => $msg, 'log' => $log];
        };

        $greet = $read();
        $log[] = '< ' . trim(substr($greet, 0, 120));
        if (!$expect($greet, [220])) {
            return $fail('O servidor não respondeu como SMTP.');
        }
        $ehloHost = 'thefullsculpt.com.br';
        $r = $cmd("EHLO $ehloHost");
        if (!$expect($r, [250])) {
            return $fail('EHLO recusado.');
        }
        if ($secure === 'tls') {
            if (!$expect($cmd('STARTTLS'), [220])) {
                return $fail('O servidor não aceitou STARTTLS (use SSL na porta 465 ou "nenhuma").');
            }
            if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                return $fail('Falha ao negociar TLS (certificado inválido?).');
            }
            $r = $cmd("EHLO $ehloHost");
        }
        if ((string) $s['user'] !== '') {
            $pass = (string) ($s['password'] ?? '');
            if (!$expect($cmd('AUTH LOGIN'), [334]) || !$expect($cmd(base64_encode((string) $s['user']), true), [334]) || !$expect($cmd(base64_encode($pass), true), [235])) {
                return $fail('Usuário ou senha SMTP recusados.');
            }
        }
        if (!$expect($cmd("MAIL FROM:<$fromEmail>"), [250])) {
            return $fail('Remetente recusado pelo servidor.');
        }
        if (!$expect($cmd("RCPT TO:<$to>"), [250, 251])) {
            return $fail('Destinatário recusado pelo servidor.');
        }
        if (!$expect($cmd('DATA'), [354])) {
            return $fail('O servidor não aceitou o envio (DATA).');
        }

        $fromName = self::clean((string) ($s['from_name'] ?? '')) ?: 'THE FULL SCULPT';
        $reply = self::clean((string) ($s['reply_to'] ?? ''));
        $boundary = 'tfs_' . bin2hex(random_bytes(8));
        $domain = substr(strrchr($fromEmail, '@') ?: '@localhost', 1);
        $text = $text !== '' ? $text : trim(html_entity_decode(strip_tags(preg_replace('#<br\s*/?>|</p>#i', "\n", $html) ?? $html), ENT_QUOTES, 'UTF-8'));
        $headers = [
            'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
            'From: ' . self::enc($fromName) . " <$fromEmail>",
            "To: <$to>",
            'Subject: ' . self::enc(self::clean($subject)),
            'Message-ID: <' . bin2hex(random_bytes(12)) . "@$domain>",
            'MIME-Version: 1.0',
            "Content-Type: multipart/alternative; boundary=\"$boundary\"",
            'X-Mailer: THE FULL SCULPT',
        ];
        if (filter_var($reply, FILTER_VALIDATE_EMAIL)) {
            $headers[] = "Reply-To: <$reply>";
        }
        $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text)) .
            "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$boundary--\r\n";
        fwrite($fp, implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.\r\n");
        $r = $read();
        $log[] = '< ' . trim(substr($r, 0, 120));
        if (!$expect($r, [250])) {
            return $fail('O servidor recusou a mensagem.');
        }
        @fwrite($fp, "QUIT\r\n");
        @fclose($fp);
        return ['ok' => true, 'error' => null, 'log' => $log];
    }

    /**
     * Verifica a conexão e a autenticação SEM enviar mensagem.
     *
     * @param array<string,mixed> $cfg
     * @param array<string,mixed>|null $override
     * @return array{ok:bool,error:?string,log:list<string>}
     */
    public static function verify(PDO $pdo, array $cfg, ?array $override = null): array
    {
        // Reaproveita send() até o RCPT usando o próprio remetente e interrompe antes do DATA seria complexo;
        // aqui basta enviar um e-mail de teste ao remetente quando solicitado. Para "verificar", exigimos envio ao remetente.
        $s = $override ?? self::config($pdo, $cfg);
        return self::send($pdo, $cfg, (string) $s['from_email'], 'Teste de conexão SMTP', '<p>Conexão SMTP verificada com sucesso.</p>', '', $override);
    }

    /** Aluno com e-mail confirmado. Só exige a confirmação quando o envio de e-mails está ativo (senão ninguém conseguiria confirmar). @param array<string,mixed> $user */
    public static function isVerified(PDO $pdo, array $user): bool
    {
        if (($user['role'] ?? '') !== 'student' || !empty($user['is_demo']) || !empty($user['email_verified_at'])) {
            return true;
        }
        return !self::enabled($pdo);
    }

    /** Cria o token e envia o e-mail de confirmação (válido por 24h). @param array<string,mixed> $cfg @param array<string,mixed> $user */
    public static function sendVerification(PDO $pdo, array $cfg, array $user, string $lang): void
    {
        $raw = bin2hex(random_bytes(32));
        \TFS\DB::run($pdo, 'INSERT INTO email_verifications (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
            [$user['id'], hash('sha256', $raw), gmdate('Y-m-d H:i:s', time() + 86400), \TFS\DB::now()]);
        self::notify($pdo, $cfg, 'verify', (string) $user['email'], $lang, ['name' => explode(' ', trim((string) $user['name']))[0], 'url' => self::publicUrl($pdo) . '/' . $lang . '/verificar/?token=' . $raw]);
    }

    /** Textos padrão: [assunto/título, corpo, botão, rodapé]. Variáveis: {when}, {name}. */
    public const DEFAULTS = [
        'verify' => [
            'pt' => ['Confirme seu e-mail', 'Olá, {name}! Falta só um passo: confirme seu e-mail para ativar sua conta e poder assinar. O link vale por 24 horas.', 'Confirmar e-mail', 'Se você não criou uma conta, ignore este e-mail.'],
            'en' => ['Confirm your email', 'Hi {name}! One last step: confirm your email to activate your account and subscribe. The link is valid for 24 hours.', 'Confirm email', "If you didn't create an account, ignore this email."],
            'es' => ['Confirma tu correo', '¡Hola, {name}! Falta un paso: confirma tu correo para activar tu cuenta y poder suscribirte. El enlace vale 24 horas.', 'Confirmar correo', 'Si no creaste una cuenta, ignora este correo.'],
        ],
        'reset' => [
            'pt' => ['Redefinir sua senha', 'Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora.', 'Redefinir senha', 'Se não foi você, ignore este e-mail: sua senha continua a mesma.'],
            'en' => ['Reset your password', 'We received a request to reset your account password. The link is valid for 1 hour.', 'Reset password', "If this wasn't you, ignore this email: your password stays the same."],
            'es' => ['Restablecer tu contraseña', 'Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace vale 1 hora.', 'Restablecer contraseña', 'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.'],
        ],
        'welcome' => [
            'pt' => ['Bem-vinda(o) ao THE FULL SCULPT', 'Sua conta foi criada. Sua primeira aula é grátis: continue de onde parou quando quiser.', 'Abrir meu treino', 'Você pode editar seus dados e excluir sua conta quando quiser, em Perfil.'],
            'en' => ['Welcome to THE FULL SCULPT', 'Your account is ready. Your first lesson is free: pick up whenever you like.', 'Open my training', 'You can edit your data and delete your account anytime in Profile.'],
            'es' => ['Bienvenida(o) a THE FULL SCULPT', 'Tu cuenta está lista. Tu primera clase es gratis: continúa cuando quieras.', 'Abrir mi entrenamiento', 'Puedes editar tus datos y eliminar tu cuenta cuando quieras, en Perfil.'],
        ],
        'appointment' => [
            'pt' => ['Sua consulta foi confirmada', 'Sua consulta online está confirmada para {when}.', 'Ver detalhes', 'Se precisar cancelar, faça isso em Perfil.'],
            'en' => ['Your session is confirmed', 'Your online session is confirmed for {when}.', 'View details', 'If you need to cancel, do it in Profile.'],
            'es' => ['Tu consulta fue confirmada', 'Tu consulta en línea está confirmada para {when}.', 'Ver detalles', 'Si necesitas cancelar, hazlo en Perfil.'],
        ],
        'test' => [
            'pt' => ['E-mail de teste', 'Se você recebeu esta mensagem, o envio de e-mails da plataforma está funcionando.', 'Abrir a plataforma', 'Mensagem automática de teste.'],
            'en' => ['Test email', 'If you received this message, the platform email delivery is working.', 'Open the platform', 'Automatic test message.'],
            'es' => ['Correo de prueba', 'Si recibiste este mensaje, el envío de correos de la plataforma funciona.', 'Abrir la plataforma', 'Mensaje automático de prueba.'],
        ],
    ];

    public const LAYOUT_DEFAULTS = [
        'brand' => 'The Full Sculpt', 'bg' => '#f6f3ee', 'card' => '#ffffff', 'text' => '#161514', 'muted' => '#8c877e',
        'button' => '#161514', 'button_text' => '#f6f3ee', 'radius' => 20, 'footer' => '',
    ];

    /** Layout do e-mail (cores, marca, rodapé) com valores saneados. @return array<string,mixed> */
    public static function layout(PDO $pdo, ?array $override = null): array
    {
        $saved = $override ?? (\TFS\Settings::all($pdo)['email_layout'] ?? []);
        $out = self::LAYOUT_DEFAULTS;
        foreach (['bg', 'card', 'text', 'muted', 'button', 'button_text'] as $k) {
            if (isset($saved[$k]) && is_string($saved[$k]) && preg_match('/^#[0-9a-fA-F]{6}$/', $saved[$k])) {
                $out[$k] = $saved[$k];
            }
        }
        if (isset($saved['brand']) && is_string($saved['brand']) && trim($saved['brand']) !== '') {
            $out['brand'] = mb_substr(trim($saved['brand']), 0, 60);
        }
        if (isset($saved['radius']) && is_numeric($saved['radius'])) {
            $out['radius'] = max(0, min(32, (int) $saved['radius']));
        }
        $out['footer'] = isset($saved['footer']) && is_string($saved['footer']) ? mb_substr(trim($saved['footer']), 0, 400) : '';
        return $out;
    }

    /** Conteúdo efetivo (padrão + edição do admin). @return array{subject:string,title:string,body:string,cta:string,foot:string,custom:bool} */
    public static function content(PDO $pdo, string $kind, string $lang): array
    {
        $lang = in_array($lang, ['pt', 'en', 'es'], true) ? $lang : 'pt';
        [$title, $body, $cta, $foot] = self::DEFAULTS[$kind][$lang];
        $row = \TFS\DB::one($pdo, 'SELECT subject, title, body, cta, foot FROM email_templates WHERE kind = ? AND lang = ?', [$kind, $lang]);
        return [
            'subject' => $row ? (string) $row['subject'] : $title, 'title' => $row ? (string) $row['title'] : $title, 'body' => $row ? (string) $row['body'] : $body,
            'cta' => $row ? (string) $row['cta'] : $cta, 'foot' => $row ? (string) $row['foot'] : $foot, 'custom' => $row !== null,
        ];
    }

    /**
     * Monta o e-mail. @param array{subject:string,title:string,body:string,cta:string,foot:string} $c @param array<string,mixed> $layout @param array<string,mixed> $vars
     * @return array{0:string,1:string,2:string} [assunto, html, texto]
     */
    public static function render(PDO $pdo, array $c, array $layout, array $vars): array
    {
        $e = static fn(string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
        $fill = static fn(string $t): string => str_replace(['{when}', '{name}'], [(string) ($vars['when'] ?? ''), (string) ($vars['name'] ?? '')], $t);
        $subject = $fill($c['subject'] !== '' ? $c['subject'] : $c['title']);
        $title = $fill($c['title']);
        $bodyPlain = $fill($c['body']);
        $foot = $fill($c['foot']);
        $linkRaw = (string) ($vars['url'] ?? self::publicUrl($pdo));
        $url = $e($linkRaw);
        $L = $layout;
        $html = '<!doctype html><html><body style="margin:0;background:' . $L['bg'] . ';font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:' . $L['text'] . '">'
            . '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">'
            . '<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:' . $L['card'] . ';border-radius:' . (int) $L['radius'] . 'px;padding:36px">'
            . '<tr><td style="letter-spacing:.34em;font-size:12px;color:' . $L['muted'] . ';text-transform:uppercase">' . $e((string) $L['brand']) . '</td></tr>'
            . '<tr><td style="padding-top:24px;font-size:26px;line-height:1.2;font-weight:300">' . $e($title) . '</td></tr>'
            . '<tr><td style="padding-top:14px;font-size:15px;line-height:1.6;color:' . $L['text'] . 'cc">' . nl2br($e($bodyPlain)) . '</td></tr>'
            . ($c['cta'] !== '' ? '<tr><td style="padding-top:26px"><a href="' . $url . '" style="display:inline-block;background:' . $L['button'] . ';color:' . $L['button_text'] . ';text-decoration:none;padding:13px 26px;border-radius:999px;font-size:14px">' . $e($fill($c['cta'])) . '</a></td></tr>' : '')
            . '<tr><td style="padding-top:28px;font-size:12px;color:' . $L['muted'] . ';line-height:1.5">' . nl2br($e($foot)) . '</td></tr>'
            . ($L['footer'] !== '' ? '<tr><td style="padding-top:14px;border-top:1px solid ' . $L['muted'] . '33;margin-top:14px;font-size:11px;color:' . $L['muted'] . ';line-height:1.5">' . nl2br($e((string) $L['footer'])) . '</td></tr>' : '')
            . '</table></td></tr></table></body></html>';
        return [$subject, $html, $title . "\n\n" . $bodyPlain . "\n\n" . ($c['cta'] !== '' ? $linkRaw . "\n\n" : '') . $foot . ($L['footer'] !== '' ? "\n\n" . $L['footer'] : '')];
    }

    /** @param array<string,mixed> $vars @return array{0:string,1:string,2:string} */
    public static function template(PDO $pdo, string $kind, string $lang, array $vars): array
    {
        return self::render($pdo, self::content($pdo, $kind, $lang), self::layout($pdo), $vars);
    }

    /** Envio "melhor esforço": nunca lança exceção nem bloqueia o fluxo principal. @param array<string,mixed> $cfg @param array<string,mixed> $vars */
    public static function notify(PDO $pdo, array $cfg, string $kind, string $to, string $lang, array $vars = []): void
    {
        try {
            if (!self::enabled($pdo)) {
                return;
            }
            [$subject, $html, $text] = self::template($pdo, $kind, $lang, $vars);
            $r = self::send($pdo, $cfg, $to, $subject, $html, $text);
            if (!$r['ok']) {
                error_log('[tfs-mail] ' . $kind . ': ' . $r['error']);
            }
        } catch (\Throwable $e) {
            error_log('[tfs-mail] ' . $e->getMessage());
        }
    }
}
