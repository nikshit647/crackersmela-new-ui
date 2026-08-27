package com.crackersmela.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Payment transaction linked to an order.
 *
 * Lifecycle:
 *   1. Created when customer initiates checkout (status=PENDING)
 *   2. Updated by webhook from Stripe (status=SUCCEEDED or FAILED)
 *   3. Can be refunded (status=REFUNDED, with refund_id)
 *
 * Security: We NEVER trust client-side payment status.
 * Only Stripe webhook confirmations update payment status.
 */
@Entity
@Table(name = "payments", indexes = {
        @Index(name = "idx_payment_order", columnList = "order_id"),
        @Index(name = "idx_payment_stripe_id", columnList = "stripe_payment_intent_id", unique = true),
        @Index(name = "idx_payment_status", columnList = "status")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // ---------------------------------------------------------------------------
    // Order Link
    // ---------------------------------------------------------------------------
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false, unique = true)
    private Order order;

    // ---------------------------------------------------------------------------
    // Payment Details
    // ---------------------------------------------------------------------------
    @NotNull
    @Digits(integer = 8, fraction = 2)
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Size(min = 3, max = 3)
    @Column(nullable = false, length = 3)
    @Builder.Default
    private String currency = "INR";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentMethod method;

    public enum PaymentMethod {
        STRIPE, RAZORPAY, UPI, COD, BANK_TRANSFER
    }

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private PaymentStatus status = PaymentStatus.PENDING;

    public enum PaymentStatus {
        PENDING, PROCESSING, SUCCEEDED, FAILED, REFUNDED
    }

    // ---------------------------------------------------------------------------
    // Stripe Integration
    // ---------------------------------------------------------------------------
    @Size(max = 255)
    private String stripePaymentIntentId;  // pi_xxx

    @Size(max = 255)
    private String stripeChargeId;         // ch_xxx

    private String stripeReceiptUrl;

    // ---------------------------------------------------------------------------
    // Refund Tracking
    // ---------------------------------------------------------------------------
    @Size(max = 255)
    private String stripeRefundId;         // re_xxx

    @Digits(integer = 8, fraction = 2)
    @Column(precision = 10, scale = 2)
    private BigDecimal refundAmount;

    private String refundReason;

    // ---------------------------------------------------------------------------
    // Webhook Idempotency
    // ---------------------------------------------------------------------------
    @Size(max = 255)
    private String lastWebhookEventId;  // Prevents duplicate processing

    // ---------------------------------------------------------------------------
    // Error Tracking
    // ---------------------------------------------------------------------------
    private String failureReason;

    // ---------------------------------------------------------------------------
    // Audit
    // ---------------------------------------------------------------------------
    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
