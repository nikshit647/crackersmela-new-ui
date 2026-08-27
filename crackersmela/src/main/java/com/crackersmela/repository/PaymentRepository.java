package com.crackersmela.repository;

import com.crackersmela.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for Payment entity.
 */
@Repository
public interface PaymentRepository extends JpaRepository<Payment, String> {

    /**
     * Find payment by Stripe PaymentIntent ID.
     * Used during webhook processing to match events to payments.
     */
    @Query("SELECT p FROM Payment p WHERE p.stripePaymentIntentId = :paymentIntentId")
    Optional<Payment> findByStripePaymentIntentId(@Param("paymentIntentId") String paymentIntentId);

    /**
     * Find payment by order ID.
     */
    @Query("SELECT p FROM Payment p WHERE p.order.id = :orderId")
    Optional<Payment> findByOrderId(@Param("orderId") String orderId);

    /**
     * Check if a webhook event has already been processed (idempotency).
     */
    @Query("SELECT COUNT(p) > 0 FROM Payment p WHERE p.lastWebhookEventId = :eventId")
    boolean existsByWebhookEventId(@Param("eventId") String eventId);
}
