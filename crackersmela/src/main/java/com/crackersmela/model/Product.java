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
 * Fireworks product listing with pricing, inventory, and safety compliance.
 *
 * Design decisions:
 *   - BigDecimal for prices (no floating-point errors)
 *   - PostgreSQL String Array for images/tags (no join table needed)
 *   - weight_grams for shipping calculation
 *   - safety_warning for regulatory compliance
 */
@Entity
@Table(name = "products", indexes = {
        @Index(name = "idx_product_slug", columnList = "slug", unique = true),
        @Index(name = "idx_product_sku", columnList = "sku", unique = true),
        @Index(name = "idx_product_status", columnList = "status"),
        @Index(name = "idx_product_category", columnList = "category_id"),
        @Index(name = "idx_product_featured", columnList = "is_featured")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // ---------------------------------------------------------------------------
    // Basic Info
    // ---------------------------------------------------------------------------
    @NotBlank(message = "Product name is required")
    @Size(max = 255)
    @Column(nullable = false, length = 255)
    private String name;

    @NotBlank(message = "Slug is required")
    @Size(max = 280)
    @Column(nullable = false, unique = true, length = 280)
    private String slug;

    @Size(max = 10000)
    @Column(columnDefinition = "TEXT")
    private String description;

    @Size(max = 500)
    @Column(length = 500)
    private String shortDescription;

    // ---------------------------------------------------------------------------
    // Pricing
    // ---------------------------------------------------------------------------
    @NotNull(message = "Price is required")
    @DecimalMin(value = "0.01", message = "Price must be greater than 0")
    @Digits(integer = 8, fraction = 2)
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @DecimalMin(value = "0.00")
    @Digits(integer = 8, fraction = 2)
    @Column(precision = 10, scale = 2)
    private BigDecimal compareAtPrice;  // Strikethrough price for discounts

    @DecimalMin(value = "0.00")
    @Digits(integer = 8, fraction = 2)
    @Column(precision = 10, scale = 2)
    private BigDecimal costPrice;       // Admin-only, for margin calculation

    // ---------------------------------------------------------------------------
    // Inventory
    // ---------------------------------------------------------------------------
    @NotBlank(message = "SKU is required")
    @Size(max = 50)
    @Column(nullable = false, unique = true, length = 50)
    private String sku;

    @Min(value = 0, message = "Stock cannot be negative")
    @Column(nullable = false)
    @Builder.Default
    private Integer stockQuantity = 0;

    @Min(value = 0)
    @Column(nullable = false)
    @Builder.Default
    private Integer lowStockThreshold = 10;

    @Builder.Default
    private Boolean trackInventory = true;

    // ---------------------------------------------------------------------------
    // Product Details
    // ---------------------------------------------------------------------------
    @Min(value = 0, message = "Weight must be positive")
    private Integer weightGrams;  // For shipping calculation

    @Column(columnDefinition = "text[]")
    private List<String> images;  // PostgreSQL array of URLs

    @Column(columnDefinition = "varchar(50)[]")
    private List<String> tags;    // Searchable tags

    // ---------------------------------------------------------------------------
    // Status & Visibility
    // ---------------------------------------------------------------------------
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ProductStatus status = ProductStatus.DRAFT;

    public enum ProductStatus {
        DRAFT, ACTIVE, OUT_OF_STOCK, DISCONTINUED
    }

    @Builder.Default
    private Boolean isFeatured = false;

    // ---------------------------------------------------------------------------
    // Fireworks-Specific Fields
    // ---------------------------------------------------------------------------
    @Size(max = 1000)
    @Column(columnDefinition = "TEXT")
    private String safetyWarning;  // Mandatory safety warning

    @Min(0)
    @Max(18)
    @Column(nullable = false)
    @Builder.Default
    private Integer ageRestriction = 0;

    // ---------------------------------------------------------------------------
    // SEO
    // ---------------------------------------------------------------------------
    @Size(max = 160)
    private String metaTitle;

    @Size(max = 320)
    private String metaDescription;

    // ---------------------------------------------------------------------------
    // Relationships
    // ---------------------------------------------------------------------------
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @OneToMany(mappedBy = "product", fetch = FetchType.LAZY)
    @Builder.Default
    private List<OrderItem> orderItems = new ArrayList<>();

    // ---------------------------------------------------------------------------
    // Audit
    // ---------------------------------------------------------------------------
    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    private LocalDateTime deletedAt;

    // ---------------------------------------------------------------------------
    // Computed Properties
    // ---------------------------------------------------------------------------
    public boolean isInStock() {
        if (!trackInventory) return true;
        return stockQuantity > 0;
    }

    public Integer getDiscountPercentage() {
        if (compareAtPrice != null && compareAtPrice.compareTo(price) > 0) {
            BigDecimal discount = compareAtPrice.subtract(price)
                    .divide(compareAtPrice, 4, java.math.RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
            return discount.intValue();
        }
        return null;
    }
}
