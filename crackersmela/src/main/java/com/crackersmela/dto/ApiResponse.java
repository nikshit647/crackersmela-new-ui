package com.crackersmela.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Standard API response types.
 * All endpoints return consistent response envelopes.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse {

    // =========================================================================
    // Generic Response
    // =========================================================================
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Success<T> {
        private boolean success = true;
        private String message;
        private T data;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Error {
        private boolean success = false;
        private String message;
        private Object errors;
    }

    // =========================================================================
    // Paginated Response
    // =========================================================================
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Paginated<T> {
        private List<T> items;
        private int total;
        private int page;
        private int perPage;
        private int totalPages;
    }

    // =========================================================================
    // Auth Response DTOs
    // =========================================================================
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TokenPair {
        private String accessToken;
        private String refreshToken;
        private String tokenType = "Bearer";
        private long expiresIn;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserSummary {
        private String id;
        private String email;
        private String firstName;
        private String lastName;
        private String fullName;
        private String role;
        private boolean isVerified;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AuthResponse {
        private UserSummary user;
        private TokenPair tokens;
    }

    // =========================================================================
    // Product Response DTOs
    // =========================================================================
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProductResponse {
        private String id;
        private String name;
        private String slug;
        private String description;
        private String shortDescription;
        private BigDecimal price;
        private BigDecimal compareAtPrice;
        private String sku;
        private Integer stockQuantity;
        private boolean trackInventory;
        private Integer weightGrams;
        private List<String> images;
        private List<String> tags;
        private String status;
        private boolean isFeatured;
        private String categoryId;
        private String categoryName;
        private String safetyWarning;
        private Integer ageRestriction;
        private boolean isInStock;
        private Integer discountPercentage;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    // =========================================================================
    // Category Response DTO
    // =========================================================================
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryResponse {
        private String id;
        private String name;
        private String slug;
        private String description;
        private String imageUrl;
        private boolean isActive;
        private Integer sortOrder;
        private String parentId;
        private List<CategoryResponse> children;
    }

    // =========================================================================
    // Cart Response DTOs
    // =========================================================================
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CartItemResponse {
        private String id;
        private String productId;
        private String productName;
        private String productImage;
        private BigDecimal price;
        private Integer quantity;
        private BigDecimal lineTotal;
        private String note;
        private boolean inStock;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CartResponse {
        private String id;
        private List<CartItemResponse> items;
        private int totalItems;
        private BigDecimal subtotal;
    }

    // =========================================================================
    // Order Response DTOs
    // =========================================================================
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrderItemResponse {
        private String id;
        private String productId;
        private String productName;
        private String productSku;
        private BigDecimal price;
        private Integer quantity;
        private BigDecimal lineTotal;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrderResponse {
        private String id;
        private String orderNumber;
        private String status;
        private BigDecimal subtotal;
        private BigDecimal taxAmount;
        private BigDecimal shippingCost;
        private BigDecimal discountAmount;
        private BigDecimal totalAmount;
        private String shippingName;
        private String shippingPhone;
        private String shippingAddressLine1;
        private String shippingAddressLine2;
        private String shippingCity;
        private String shippingState;
        private String shippingPincode;
        private String notes;
        private String couponCode;
        private List<OrderItemResponse> items;
        private int itemCount;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    // =========================================================================
    // Payment Response DTO
    // =========================================================================
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PaymentResponse {
        private String id;
        private String orderId;
        private BigDecimal amount;
        private String currency;
        private String method;
        private String status;
        private String stripePaymentIntentId;
        private String stripeReceiptUrl;
        private String failureReason;
        private LocalDateTime createdAt;
    }
}
