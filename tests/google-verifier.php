<?php
namespace GoogleVerifierTest;
// Test only: real signature verification, isolated certificate cache, no HTTP.
class Reply extends \RuntimeException {
    public $status;
    public function __construct($code) { $this->status = $code; }
}
function cmRespond($code, $body) { throw new Reply($code); }
function cmDataDir() { return $GLOBALS['argv'][1]; }
$calls = 0; $endpoint = ''; $options = []; $provider = false;
function stream_context_create($given) {
    global $options; $options = $given;
    return \stream_context_create($given);
}
function file_get_contents($name, $include = false, $context = null, $offset = 0, $length = null) {
    if (str_starts_with($name, 'https://')) {
        global $calls, $endpoint, $provider;
        $calls++; $endpoint = $name;
        return $provider === false ? false : json_encode($provider);
    }
    return $length === null ? \file_get_contents($name) : \file_get_contents($name, $include, $context, $offset, $length);
}
eval('namespace GoogleVerifierTest;' . substr(\file_get_contents($argv[2]), 5));
$checks = [];
function check($name, $ok) {
    global $checks;
    if (!$ok) throw new \RuntimeException('FAIL: ' . $name);
    $checks[] = ['name' => $name, 'status' => 'PASS'];
}
function b64($value) { return rtrim(strtr(base64_encode($value), '+/', '-_'), '='); }
function token($claims = [], $header = [], $key = 'trusted') {
    $claims = array_replace_recursive([
        'aud' => CM_GOOGLE_PROJECT, 'iss' => 'https://securetoken.google.com/' . CM_GOOGLE_PROJECT,
        'sub' => 'signed-fixture-uid', 'exp' => time() + 3600, 'iat' => time(),
        'email' => 'Signed@Example.test', 'email_verified' => true, 'name' => "Local\x01 Fixture",
        'firebase' => ['sign_in_provider' => 'google.com'],
    ], $claims);
    $header = array_replace(['alg' => 'RS256', 'typ' => 'JWT', 'kid' => 'fixture-kid'], $header);
    $unsigned = b64(json_encode($header)) . '.' . b64(json_encode($claims));
    $private = \openssl_pkey_get_private(\file_get_contents(cmDataDir() . '/' . $key . '-private.pem'));
    if (!\openssl_sign($unsigned, $signature, $private, OPENSSL_ALGO_SHA256)) throw new \RuntimeException('Fixture signing failed');
    return $unsigned . '.' . b64($signature);
}
function reject($name, $value, $status = 401) {
    try { cmGoogleIdentity($value); check($name, false); }
    catch (Reply $reply) { check($name, $reply->status === $status); }
}
function cache($age = 0, $certs = null) {
    $certs = $certs ?? ['fixture-kid' => \file_get_contents(cmDataDir() . '/trusted-public.pem')];
    \file_put_contents(cmGoogleCertPath(), json_encode($certs));
    touch(cmGoogleCertPath(), time() - $age); clearstatcache();
}
cache();
reject('Malformed token rejected', 'bad');
reject('Oversized token rejected', str_repeat('x', 16385));
reject('Unsigned algorithm rejected', token([], ['alg' => 'none']));
reject('HMAC algorithm confusion rejected', token([], ['alg' => 'HS256']));
reject('Wrong token type rejected', token([], ['typ' => 'OTHER']));
reject('Missing signing key ID rejected', token([], ['kid' => '']));
reject('Wrong Firebase audience rejected', token(['aud' => 'other-project']));
reject('Wrong issuer rejected', token(['iss' => 'https://attacker.invalid']));
reject('Expired signed token rejected', token(['exp' => time() - 1]));
reject('String expiry rejected', token(['exp' => (string)(time() + 3600)]));
reject('Future issued-at rejected', token(['iat' => time() + 120]));
reject('Missing subject rejected', token(['sub' => '']));
reject('Unverified signed email rejected', token(['email_verified' => false]));
reject('Non-Google provider rejected', token(['firebase' => ['sign_in_provider' => 'password']]));
check('Invalid claims do not request certificates', $calls === 0);
$identity = cmGoogleIdentity(token());
check('Valid RS256 signature establishes signed identity', $identity['uid'] === 'signed-fixture-uid' && $identity['email'] === 'signed@example.test');
check('Display name strips control characters', $identity['name'] === 'Local Fixture');
check('Fresh cached certificate prevents network request', $calls === 0);
reject('Untrusted private-key signature rejected', token([], [], 'untrusted'));
$parts = explode('.', token());
$claims = json_decode(cmGoogleB64($parts[1]), true); $claims['email'] = 'tampered@example.test';
$parts[1] = b64(json_encode($claims));
reject('Tampered identity claims rejected', implode('.', $parts));
reject('Invalid signed email rejected', token(['email' => 'invalid']));
reject('Unknown certificate key rejected after refresh', token([], ['kid' => 'missing-kid']));
check('Certificate request uses fixed Google HTTPS endpoint and disables redirects', $endpoint === 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com' && $options['http']['max_redirects'] === 0 && $options['http']['timeout'] === 8);
check('Certificate request sends no token or identity', !isset($options['http']['content']) && !str_contains($endpoint, 'signed-fixture'));
$provider = ['rotated-kid' => \file_get_contents(cmDataDir() . '/trusted-public.pem')];
$identity = cmGoogleIdentity(token([], ['kid' => 'rotated-kid']));
check('Rotated key refreshes certificate and verifies signature', $identity['uid'] === 'signed-fixture-uid');
cache(CM_GOOGLE_CERT_TTL + 1); $provider = false;
check('Bounded stale certificate works during provider outage', cmGoogleIdentity(token())['uid'] === 'signed-fixture-uid');
cache(CM_GOOGLE_CERT_STALE + 1);
reject('Expired certificate cache and outage fail closed', token(), 503);
cache(0, ['fixture-kid' => 'not a public key']);
reject('Malformed certificate cache fails closed', token(), 503);
check('Empty certificate maps rejected', cmGoogleCertsValid([]) === false);
check('Oversized certificate maps rejected', cmGoogleCertsValid(array_fill(0, 17, str_repeat('x', 100))) === false);
echo json_encode(['scope' => 'Actual production verifier with real synthetic RSA signatures and offline certificate transport; no Google or production requests', 'checks' => $checks]);
