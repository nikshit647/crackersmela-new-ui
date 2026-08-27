package com.crackersmela.repository;

import com.crackersmela.model.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository for Category entity.
 */
@Repository
public interface CategoryRepository extends JpaRepository<Category, String> {

    /**
     * Find all active root categories (no parent).
     */
    @Query("SELECT c FROM Category c WHERE c.parent IS NULL AND c.isActive = true AND c.deletedAt IS NULL " +
           "ORDER BY c.sortOrder")
    List<Category> findRootCategories();

    /**
     * Find active categories by parent (for tree expansion).
     */
    @Query("SELECT c FROM Category c WHERE c.parent.id = :parentId AND c.isActive = true AND c.deletedAt IS NULL " +
           "ORDER BY c.sortOrder")
    List<Category> findByParentId(String parentId);

    /**
     * Find category by slug.
     */
    @Query("SELECT c FROM Category c WHERE c.slug = :slug AND c.deletedAt IS NULL")
    Optional<Category> findBySlug(String slug);

    /**
     * Check if slug exists.
     */
    @Query("SELECT COUNT(c) > 0 FROM Category c WHERE c.slug = :slug AND c.deletedAt IS NULL")
    boolean existsBySlug(String slug);
}
