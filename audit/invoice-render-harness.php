<?php
// Isolated verification harness. No API, mail, or order-storage writes.
require getenv('CM_TEST_INVOICE_SOURCE');
try {
    $order = json_decode(file_get_contents($argv[1]), true, 32, JSON_THROW_ON_ERROR);
    $store = [
        'name' => 'CrackersMela', 'tagline' => 'Synthetic local verification',
        'domain' => 'example.test', 'phones' => [], 'email' => '',
        'line1' => 'Fixture outlet', 'line2' => '', 'city' => 'Hyderabad', 'state' => 'Telangana, India'
    ];
    $bytes = cmInvoicePdf($order, $store, __DIR__);
    file_put_contents($argv[2], $bytes);
    echo json_encode(['ok' => true, 'php' => PHP_VERSION, 'bytes' => strlen($bytes), 'sha256' => hash('sha256', $bytes)]);
} catch (Throwable $error) {
    echo json_encode(['ok' => false, 'php' => PHP_VERSION, 'exception' => get_class($error), 'message' => $error->getMessage()]);
    exit(1);
}
