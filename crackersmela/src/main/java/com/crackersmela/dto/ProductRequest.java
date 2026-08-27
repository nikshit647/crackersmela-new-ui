package com.crackersmela.dto;

import jakarta.validation.constraints.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.List;

/**
 * DTOs for product management endpoints.
 * HTML tags are stripped to prevent XSS via stored content.
 */
public class ProductRequest {

    // =========================================================================
    // Create Product Request
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Create {
        @NotBlank(message = "Product name is required")
        @Size(min = 1, max = 255)
        private String name;

        @Size(max = 10000)
        private String description;

        @Size(max = 500)
        private String shortDescription;

        @NotNull(message = "Price is required")
        @DecimalMin(value = "0.01", message = "Price must be greater than 0")
        @Digits(integer = 8, fraction = 2)
        private BigDecimal price;

        @DecimalMin(value = "0.00")
        @Digits(integer = 8, fraction = 2)
        private BigDecimal compareAtPrice;

        @NotBlank(message = "SKU is required")
        @Size(min = 1, max = 50)
        private String sku;

        @Min(0)
        private Integer stockQuantity = 0;

        @Min(0)
        private Integer lowStockThreshold = 10;

        private Boolean trackInventory = true;

        private String categoryId;  // UUID of category

        @Min(0)
        private Integer weightGrams;

        @Size(max = 10)
        private List<String> images;

        @Size(max = 20)
        private List<String> tags;

        @Size(max = 1000)
        private String safetyWarning;

        @Min(0) @Max(18)
        private Integer ageRestriction = 0;

        @Size(max = 160)
        private String metaTitle;

        @Size(max = 320)
        private String metaDescription;
    }

    // =========================================================================
    // Update Product Request (all fields optional)
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Update {
        @Size(min = 1, max = 255)
        private String name;

        @Size(max = 10000)
        private String description;

        @Size(max = 500)
        private String shortDescription;

        @DecimalMin(value = "0.01")
        @Digits(integer = 8, fraction = 2)
        private BigDecimal price;

        @DecimalMin(value = "0.00")
        @Digits(integer = 8, fraction = 2)
        private BigDecimal compareAtPrice;

        @Size(min = 1, max = 50)
        private String sku;

        @Min(0)
        private Integer stockQuantity;

        @Min(0)
        private Integer lowStockThreshold;

        private Boolean trackInventory;

        private String categoryId;

        @Min(0)
        private Integer weightGrams;

        @Size(max = 10)
        private List<String> images;

        @Size(max = 20)
        private List<String> tags;

        @Pattern(regexp = "^(draft|active|out_of_stock|discontinued)$", message = "Invalid status")
        private String status;

        private Boolean isFeatured;

        @Size(max = 1000)
        private String safetyWarning;

        @Min(0) @Max(18)
        private Integer ageRestriction;

        @Size(max = 160)
        private String metaTitle;

        @Size(max = 320)
        private String metaDescription;
    }

    // =========================================================================
    // Product Query Parameters
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class QueryParams {
        private String categoryId;

        @DecimalMin(value = "0.00")
        private BigDecimal minPrice;

        @DecimalMin(value = "0.00")
        private BigDecimal maxPrice;

        private String search;

        private Boolean isFeatured;

        @Min(1)
        private Integer page = 1;

        @Min(1) @Max(100)
        private Integer perPage = 20;

        private String sortBy = "createdAt";

        @Pattern(regexp = "^(asc|desc)$")
        private String sortOrder = "desc";
    }
}
