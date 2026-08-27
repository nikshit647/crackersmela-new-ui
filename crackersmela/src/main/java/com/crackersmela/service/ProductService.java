package com.crackersmela.service;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.dto.ProductRequest;
import com.crackersmela.exception.BadRequestException;
import com.crackersmela.exception.ResourceNotFoundException;
import com.crackersmela.model.Category;
import com.crackersmela.model.Product;
import com.crackersmela.repository.CategoryRepository;
import com.crackersmela.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Product catalog service with Redis caching.
 *
 * Caching strategy for seasonal traffic:
 *   - Product lists cached for 5 minutes (handles 95%+ of catalog reads)
 *   - Product details cached for 10 minutes
 *   - Cache invalidated on create/update/delete (eventual consistency)
 *
 * During Diwali, product pages get 50x traffic. Without caching,
 * each page hit triggers a DB query. With Redis, most reads are served
 * from memory in <1ms.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    // =========================================================================
    // Public: Get Products (Cached)
    // =========================================================================
    @Cacheable(value = "products", key = "#params.toString()")
    public ApiResponse.Paginated<ApiResponse.ProductResponse> getProducts(ProductRequest.QueryParams params) {
        // Build sort
        Sort sort = Sort.by(
                "asc".equalsIgnoreCase(params.getSortOrder())
                        ? Sort.Direction.ASC
                        : Sort.Direction.DESC,
                mapSortField(params.getSortBy())
        );

        Pageable pageable = PageRequest.of(params.getPage() - 1, params.getPerPage(), sort);

        Page<Product> products = productRepository.findActiveWithFilters(
                params.getCategoryId(),
                params.getMinPrice(),
                params.getMaxPrice(),
                params.getSearch(),
                pageable
        );

        List<ApiResponse.ProductResponse> items = products.getContent().stream()
                .map(this::toProductResponse)
                .collect(Collectors.toList());

        return ApiResponse.Paginated.<ApiResponse.ProductResponse>builder()
                .items(items)
                .total((int) products.getTotalElements())
                .page(params.getPage())
                .perPage(params.getPerPage())
                .totalPages(products.getTotalPages())
                .build();
    }

    // =========================================================================
    // Public: Get Single Product (Cached)
    // =========================================================================
    @Cacheable(value = "product-detail", key = "#id")
    public ApiResponse.ProductResponse getProductById(String id) {
        Product product = productRepository.findById(id)
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Product", "id", id));

        return toProductResponse(product);
    }

    @Cacheable(value = "product-detail", key = "#slug")
    public ApiResponse.ProductResponse getProductBySlug(String slug) {
        Product product = productRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Product", "slug", slug));

        return toProductResponse(product);
    }

    // =========================================================================
    // Public: Get Featured Products (Cached)
    // =========================================================================
    @Cacheable(value = "products", key = "'featured'")
    public List<ApiResponse.ProductResponse> getFeaturedProducts() {
        return productRepository.findFeaturedProducts().stream()
                .map(this::toProductResponse)
                .collect(Collectors.toList());
    }

    // =========================================================================
    // Admin: Create Product
    // =========================================================================
    @Transactional
    @CacheEvict(value = {"products", "product-detail"}, allEntries = true)
    public ApiResponse.ProductResponse createProduct(ProductRequest.Create request) {
        // Validate SKU uniqueness
        if (productRepository.existsBySku(request.getSku())) {
            throw new BadRequestException("SKU already exists: " + request.getSku());
        }

        // Validate category exists
        if (request.getCategoryId() != null) {
            categoryRepository.findById(request.getCategoryId())
                    .orElseThrow(() -> new ResourceNotFoundException("Category", "id", request.getCategoryId()));
        }

        Product product = Product.builder()
                .name(request.getName())
                .slug(generateSlug(request.getName()))
                .description(sanitizeHtml(request.getDescription()))
                .shortDescription(request.getShortDescription())
                .price(request.getPrice())
                .compareAtPrice(request.getCompareAtPrice())
                .costPrice(null) // Admin-only, not exposed in public DTOs
                .sku(request.getSku())
                .stockQuantity(request.getStockQuantity())
                .lowStockThreshold(request.getLowStockThreshold())
                .trackInventory(request.getTrackInventory())
                .category(request.getCategoryId() != null
                        ? categoryRepository.findById(request.getCategoryId()).orElse(null)
                        : null)
                .weightGrams(request.getWeightGrams())
                .images(request.getImages())
                .tags(request.getTags())
                .safetyWarning(sanitizeHtml(request.getSafetyWarning()))
                .ageRestriction(request.getAgeRestriction())
                .metaTitle(request.getMetaTitle())
                .metaDescription(request.getMetaDescription())
                .status(Product.ProductStatus.DRAFT)
                .isFeatured(false)
                .build();

        product = productRepository.save(product);
        log.info("Product created: {} (id={})", product.getName(), product.getId());

        return toProductResponse(product);
    }

    // =========================================================================
    // Admin: Update Product
    // =========================================================================
    @Transactional
    @CacheEvict(value = {"products", "product-detail"}, allEntries = true)
    public ApiResponse.ProductResponse updateProduct(String id, ProductRequest.Update request) {
        Product product = productRepository.findById(id)
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Product", "id", id));

        // Update only provided fields (PATCH semantics)
        if (request.getName() != null) {
            product.setName(request.getName());
            product.setSlug(generateSlug(request.getName()));
        }
        if (request.getDescription() != null) product.setDescription(sanitizeHtml(request.getDescription()));
        if (request.getShortDescription() != null) product.setShortDescription(request.getShortDescription());
        if (request.getPrice() != null) product.setPrice(request.getPrice());
        if (request.getCompareAtPrice() != null) product.setCompareAtPrice(request.getCompareAtPrice());
        if (request.getSku() != null) product.setSku(request.getSku());
        if (request.getStockQuantity() != null) product.setStockQuantity(request.getStockQuantity());
        if (request.getLowStockThreshold() != null) product.setLowStockThreshold(request.getLowStockThreshold());
        if (request.getTrackInventory() != null) product.setTrackInventory(request.getTrackInventory());
        if (request.getCategoryId() != null) {
            Category cat = categoryRepository.findById(request.getCategoryId()).orElse(null);
            product.setCategory(cat);
        }
        if (request.getWeightGrams() != null) product.setWeightGrams(request.getWeightGrams());
        if (request.getImages() != null) product.setImages(request.getImages());
        if (request.getTags() != null) product.setTags(request.getTags());
        if (request.getStatus() != null) product.setStatus(Product.ProductStatus.valueOf(request.getStatus()));
        if (request.getIsFeatured() != null) product.setIsFeatured(request.getIsFeatured());
        if (request.getSafetyWarning() != null) product.setSafetyWarning(sanitizeHtml(request.getSafetyWarning()));
        if (request.getAgeRestriction() != null) product.setAgeRestriction(request.getAgeRestriction());
        if (request.getMetaTitle() != null) product.setMetaTitle(request.getMetaTitle());
        if (request.getMetaDescription() != null) product.setMetaDescription(request.getMetaDescription());

        product = productRepository.save(product);
        log.info("Product updated: {} (id={})", product.getName(), product.getId());

        return toProductResponse(product);
    }

    // =========================================================================
    // Admin: Delete Product (Soft Delete)
    // =========================================================================
    @Transactional
    @CacheEvict(value = {"products", "product-detail"}, allEntries = true)
    public void deleteProduct(String id) {
        Product product = productRepository.findById(id)
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Product", "id", id));

        product.setDeletedAt(java.time.LocalDateTime.now());
        product.setStatus(Product.ProductStatus.DISCONTINUED);
        productRepository.save(product);

        log.info("Product deleted: {} (id={})", product.getName(), product.getId());
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private ApiResponse.ProductResponse toProductResponse(Product p) {
        return ApiResponse.ProductResponse.builder()
                .id(p.getId())
                .name(p.getName())
                .slug(p.getSlug())
                .description(p.getDescription())
                .shortDescription(p.getShortDescription())
                .price(p.getPrice())
                .compareAtPrice(p.getCompareAtPrice())
                .sku(p.getSku())
                .stockQuantity(p.getStockQuantity())
                .trackInventory(Boolean.TRUE.equals(p.getTrackInventory()))
                .weightGrams(p.getWeightGrams())
                .images(p.getImages())
                .tags(p.getTags())
                .status(p.getStatus().name())
                .isFeatured(Boolean.TRUE.equals(p.getIsFeatured()))
                .categoryId(p.getCategory() != null ? p.getCategory().getId() : null)
                .categoryName(p.getCategory() != null ? p.getCategory().getName() : null)
                .safetyWarning(p.getSafetyWarning())
                .ageRestriction(p.getAgeRestriction())
                .isInStock(p.isInStock())
                .discountPercentage(p.getDiscountPercentage())
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .build();
    }

    private String generateSlug(String name) {
        String slug = name.toLowerCase().trim()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("[\\s-]+", "-")
                .replaceAll("^-|-$", "");

        // Ensure uniqueness
        String originalSlug = slug;
        int counter = 1;
        while (productRepository.existsBySlug(slug)) {
            slug = originalSlug + "-" + counter;
            counter++;
        }
        return slug;
    }

    private String sanitizeHtml(String input) {
        if (input == null) return null;
        return input.replaceAll("<[^>]+>", "").trim();
    }

    private String mapSortField(String sortBy) {
        return switch (sortBy != null ? sortBy.toLowerCase() : "createdat") {
            case "name" -> "name";
            case "price" -> "price";
            case "updatedat" -> "updatedAt";
            default -> "createdAt";
        };
    }
}
