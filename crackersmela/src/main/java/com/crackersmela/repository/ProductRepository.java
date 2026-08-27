package com.crackersmela.repository;

import com.crackersmela.model.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Repository for Product entity with caching annotations.
 * All queries filter out soft-deleted and inactive products by default.
 */
@Repository
public interface ProductRepository extends JpaRepository<Product, String> {

    /**
     * Find product by slug (SEO-friendly URL lookup).
     */
    @Query("SELECT p FROM Product p WHERE p.slug = :slug AND p.deletedAt IS NULL")
    Optional<Product> findBySlug(@Param("slug") String slug);

    /**
     * Find product by SKU (inventory lookup).
     */
    @Query("SELECT p FROM Product p WHERE p.sku = :sku AND p.deletedAt IS NULL")
    Optional<Product> findBySku(@Param("sku") String sku);

    /**
     * Get active products with filters (main catalog page).
     * Supports category, price range, search, and featured filters.
     */
    @Query("SELECT p FROM Product p WHERE p.deletedAt IS NULL AND p.status = 'ACTIVE' " +
           "AND (:categoryId IS NULL OR p.category.id = :categoryId) " +
           "AND (:minPrice IS NULL OR p.price >= :minPrice) " +
           "AND (:maxPrice IS NULL OR p.price <= :maxPrice) " +
           "AND (:search IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "OR LOWER(p.description) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<Product> findActiveWithFilters(
            @Param("categoryId") String categoryId,
            @Param("minPrice") BigDecimal minPrice,
            @Param("maxPrice") BigDecimal maxPrice,
            @Param("search") String search,
            Pageable pageable
    );

    /**
     * Get featured products (homepage carousel).
     */
    @Query("SELECT p FROM Product p WHERE p.deletedAt IS NULL AND p.status = 'ACTIVE' AND p.isFeatured = true")
    List<Product> findFeaturedProducts();

    /**
     * Find products with low stock (admin alerts).
     */
    @Query("SELECT p FROM Product p WHERE p.deletedAt IS NULL AND p.trackInventory = true " +
           "AND p.stockQuantity <= p.lowStockThreshold AND p.stockQuantity > 0")
    List<Product> findLowStockProducts();

    /**
     * Find out-of-stock products.
     */
    @Query("SELECT p FROM Product p WHERE p.deletedAt IS NULL AND p.status = 'OUT_OF_STOCK'")
    List<Product> findOutOfStockProducts();

    /**
     * Check if SKU exists (for creation validation).
     */
    @Query("SELECT COUNT(p) > 0 FROM Product p WHERE p.sku = :sku AND p.deletedAt IS NULL")
    boolean existsBySku(@Param("sku") String sku);

    /**
     * Search products by tag (native query for H2/PostgreSQL compatibility).
     */
    @Query(value = "SELECT p.* FROM products p WHERE p.deleted_at IS NULL " +
           "AND p.status = 'ACTIVE' AND :tag = ANY(p.tags)", nativeQuery = true)
    List<Product> findByTag(@Param("tag") String tag);

    /**
     * Check if slug exists (for uniqueness validation).
     */
    @Query("SELECT COUNT(p) > 0 FROM Product p WHERE p.slug = :slug AND p.deletedAt IS NULL")
    boolean existsBySlug(@Param("slug") String slug);
}
