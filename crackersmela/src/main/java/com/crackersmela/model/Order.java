package com.crackersmela.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Customer order with full audit trail and status lifecycle.
 *
 * Order lifecycle:
 *   PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
 *                                             ↘ CANCELLED
 *
 * Shipping address is SNAPSHOTTED into the order at creation time.
 * This preserves the address even if the user updates their profile later.
 */
@Entity
@Table(name = "orders", indexes = {
        @Index(name = "idx_order_number", columnList = "order_number", unique = true),
        @Index(name = "idx_order_user", columnList = "user_id"),
        @Index(name = "idx_order_status", columnList = "status")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // ---------------------------------------------------------------------------
    // Order Identification
    // ---------------------------------------------------------------------------
    @NotBlank
    @Size(max = 50)
    @Column(nullable = false, unique = true, length = 50)
    private String orderNumber;  // e.g., "CM-2026-000123"

    // ---------------------------------------------------------------------------
    // Customer
    // ---------------------------------------------------------------------------
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // ---------------------------------------------------------------------------
    // Financials
    // ---------------------------------------------------------------------------
    @NotNull
    @Digits(integer = 8, fraction = 2)
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal subtotal;

    @Digits(integer = 8, fraction = 2)
    @Column(nullable = false, precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal taxAmount = BigDecimal.ZERO;

    @Digits(integer = 8, fraction = 2)
    @Column(nullable = false, precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal shippingCost = BigDecimal.ZERO;

    @Digits(integer = 8, fraction = 2)
    @Column(nullable = false, precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal discountAmount = BigDecimal.ZERO;

    @NotNull
    @Digits(integer = 8, fraction = 2)
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;

    // ---------------------------------------------------------------------------
    // Status
    // ---------------------------------------------------------------------------
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private OrderStatus status = OrderStatus.PENDING;

    public enum OrderStatus {
        PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, REFUNDED
    }

    @Column(nullable = false)
    @Builder.Default
    private LocalDateTime statusChangedAt = LocalDateTime.now();

    // ---------------------------------------------------------------------------
    // Shipping (Snapshot at time of order)
    // ---------------------------------------------------------------------------
    @NotBlank
    @Size(max = 200)
    @Column(nullable = false, length = 200)
    private String shippingName;

    @NotBlank
    @Size(max = 20)
    @Column(nullable = false, length = 20)
    private String shippingPhone;

    @NotBlank
    @Size(max = 255)
    @Column(nullable = false, length = 255)
    private String shippingAddressLine1;

    @Size(max = 255)
    private String shippingAddressLine2;

    @NotBlank
    @Size(max = 100)
    @Column(nullable = false, length = 100)
    private String shippingCity;

    @NotBlank
    @Size(max = 100)
    @Column(nullable = false, length = 100)
    private String shippingState;

    @NotBlank
    @Pattern(regexp = "^[0-9]{6}$", message = "PIN code must be 6 digits")
    @Column(nullable = false, length = 10)
    private String shippingPincode;

    // ---------------------------------------------------------------------------
    // Additional
    // ---------------------------------------------------------------------------
    @Size(max = 1000)
    private String notes;

    @Size(max = 50)
    private String couponCode;

    // ---------------------------------------------------------------------------
    // Relationships
    // ---------------------------------------------------------------------------
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<OrderItem> items = new ArrayList<>();

    @OneToOne(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private Payment payment;

    // ---------------------------------------------------------------------------
    // Audit
    // ---------------------------------------------------------------------------
    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    // ---------------------------------------------------------------------------
    // Computed
    // ---------------------------------------------------------------------------
    public int getItemCount() {
        return items.stream().mapToInt(OrderItem::getQuantity).sum();
    }
}
