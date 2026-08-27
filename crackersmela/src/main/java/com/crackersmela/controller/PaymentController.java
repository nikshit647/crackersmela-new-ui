package com.crackersmela.controller;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.model.Payment;
import com.crackersmela.repository.PaymentRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
@Tag(name = "Payments", description = "Payment processing and Stripe webhooks")
public class PaymentController {

    private final PaymentRepository paymentRepository;

    @Value("${app.stripe.webhook-secret}")
    private String webhookSecret;

    @PostMapping("/webhook")
    @Operation(summary = "Handle Stripe webhook events")
    public ResponseEntity<Map<String, String>> handleWebhook(
            @RequestBody Map<String, Object> payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String signature
    ) {
        log.info("Payment webhook received: {}", payload.get("type"));
        String eventType = (String) payload.getOrDefault("type", "unknown");
        switch (eventType) {
            case "payment_intent.succeeded" -> log.info("Payment succeeded (PLACEHOLDER)");
            case "payment_intent.payment_failed" -> log.info("Payment failed (PLACEHOLDER)");
            default -> log.info("Unhandled webhook event type: {}", eventType);
        }
        return ResponseEntity.ok(Map.of("status", "received"));
    }

    @GetMapping("/{orderId}")
    @Operation(summary = "Get payment status for an order")
    public ResponseEntity<ApiResponse.Success<ApiResponse.PaymentResponse>> getPaymentStatus(
            @PathVariable String orderId
    ) {
        Payment payment = paymentRepository.findByOrderId(orderId).orElse(null);
        if (payment == null) {
            return ResponseEntity.ok(new ApiResponse.Success<>(true, "No payment found for this order", null));
        }
        ApiResponse.PaymentResponse response = new ApiResponse.PaymentResponse(
                payment.getId(), payment.getOrder().getId(), payment.getAmount(),
                payment.getCurrency(), payment.getMethod().name(), payment.getStatus().name(),
                payment.getStripePaymentIntentId(), payment.getStripeReceiptUrl(),
                payment.getFailureReason(), payment.getCreatedAt()
        );
        return ResponseEntity.ok(new ApiResponse.Success<>(true, null, response));
    }
}
