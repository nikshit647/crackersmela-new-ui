package com.crackersmela.controller;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.dto.ProductRequest;
import com.crackersmela.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
@Tag(name = "Products", description = "Product catalog browsing and management")
public class ProductController {

    private final ProductService productService;

    @GetMapping
    @Operation(summary = "List products with filters and pagination")
    public ResponseEntity<ApiResponse.Success<ApiResponse.Paginated<ApiResponse.ProductResponse>>> getProducts(
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Boolean isFeatured,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int perPage,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String sortOrder
    ) {
        ProductRequest.QueryParams params = ProductRequest.QueryParams.builder()
                .categoryId(categoryId).minPrice(minPrice).maxPrice(maxPrice)
                .search(search).isFeatured(isFeatured).page(page)
                .perPage(Math.min(perPage, 100)).sortBy(sortBy).sortOrder(sortOrder)
                .build();
        ApiResponse.Paginated<ApiResponse.ProductResponse> products = productService.getProducts(params);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, null, products));
    }

    @GetMapping("/featured")
    @Operation(summary = "Get featured products for homepage")
    public ResponseEntity<ApiResponse.Success<List<ApiResponse.ProductResponse>>> getFeaturedProducts() {
        List<ApiResponse.ProductResponse> products = productService.getFeaturedProducts();
        return ResponseEntity.ok(new ApiResponse.Success<>(true, null, products));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get product details by ID")
    public ResponseEntity<ApiResponse.Success<ApiResponse.ProductResponse>> getProductById(@PathVariable String id) {
        ApiResponse.ProductResponse product = productService.getProductById(id);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, null, product));
    }

    @GetMapping("/slug/{slug}")
    @Operation(summary = "Get product details by slug")
    public ResponseEntity<ApiResponse.Success<ApiResponse.ProductResponse>> getProductBySlug(@PathVariable String slug) {
        ApiResponse.ProductResponse product = productService.getProductBySlug(slug);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, null, product));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Create a new product (admin only)")
    public ResponseEntity<ApiResponse.Success<ApiResponse.ProductResponse>> createProduct(
            @Valid @RequestBody ProductRequest.Create request
    ) {
        ApiResponse.ProductResponse product = productService.createProduct(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ApiResponse.Success<>(true, "Product created successfully", product));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Update a product (admin only)")
    public ResponseEntity<ApiResponse.Success<ApiResponse.ProductResponse>> updateProduct(
            @PathVariable String id,
            @Valid @RequestBody ProductRequest.Update request
    ) {
        ApiResponse.ProductResponse product = productService.updateProduct(id, request);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Product updated successfully", product));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Delete a product (admin only)")
    public ResponseEntity<ApiResponse.Success<Void>> deleteProduct(@PathVariable String id) {
        productService.deleteProduct(id);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Product deleted successfully", null));
    }
}
