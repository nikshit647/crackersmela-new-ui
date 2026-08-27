package com.crackersmela.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A snapshot of a product at the time of purchase.
 *
 * IMPORTANT: This preserves the price paid — even if the product price
 * changes later. This is essential for accounting and refund calculations.
 * The product_name and product_sku are also snapshotted.
 */
@Entity
@Table(name = "order_items")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Min(value = 1, message = "Quantity must be at least 1")
    @Column(nullable = false)
    private Integer quantity;

    @NotNull
    @Digits(integer = 8, fraction = 2)
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;  // Price snapshot at time of order

    @NotBlank
    @Size(max = 255)
    @Column(nullable = false, length = 255)
    private String productName;  // Name snapshot

    @NotBlank
    @Size(max = 50)
    @Column(nullable = false, length = 50)
    private String productSku;   // SKU snapshot

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // ---------------------------------------------------------------------------
    // Computed
    // ---------------------------------------------------------------------------
    public BigDecimal getLineTotal() {
        return price.multiply(BigDecimal.valueOf(quantity));
    }
}
