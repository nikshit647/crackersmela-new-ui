package com.crackersmela.dto;

import jakarta.validation.constraints.*;
import lombok.*;

/**
 * DTOs for order and cart endpoints.
 */
public class OrderRequest {

    // =========================================================================
    // Checkout Request
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Checkout {
        @NotNull(message = "Shipping address is required")
        private ShippingAddress shippingAddress;

        @Size(max = 50)
        private String couponCode;

        @Size(max = 1000)
        private String notes;
    }

    // =========================================================================
    // Shipping Address (for checkout)
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ShippingAddress {
        @NotBlank(message = "Recipient name is required")
        @Size(min = 1, max = 200)
        private String recipientName;

        @NotBlank(message = "Phone is required")
        @Size(min = 10, max = 20)
        private String phone;

        @NotBlank(message = "Address line 1 is required")
        @Size(max = 255)
        private String addressLine1;

        @Size(max = 255)
        private String addressLine2;

        @NotBlank(message = "City is required")
        @Size(max = 100)
        private String city;

        @NotBlank(message = "State is required")
        @Size(max = 100)
        private String state;

        @NotBlank(message = "PIN code is required")
        @Pattern(regexp = "^[0-9]{6}$", message = "PIN code must be exactly 6 digits")
        private String pincode;
    }

    // =========================================================================
    // Cart Item Request
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CartItem {
        @NotBlank(message = "Product ID is required")
        private String productId;

        @Min(1) @Max(100)
        @Builder.Default
        private Integer quantity = 1;

        @Size(max = 500)
        private String note;
    }

    // =========================================================================
    // Update Cart Item Quantity
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UpdateCartItem {
        @NotNull(message = "Quantity is required")
        @Min(1) @Max(100)
        private Integer quantity;
    }

    // =========================================================================
    // Admin: Order Status Update
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class StatusUpdate {
        @NotBlank(message = "Status is required")
        @Pattern(regexp = "^(pending|confirmed|processing|shipped|delivered|cancelled|refunded)$",
                 message = "Invalid order status")
        private String status;

        @Size(max = 100)
        private String trackingNumber;

        @Size(max = 500)
        private String note;
    }
}
