package com.crackersmela.repository;

import com.crackersmela.model.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for Order entity.
 */
@Repository
public interface OrderRepository extends JpaRepository<Order, String> {

    /**
     * Find order by order number (human-readable ID).
     */
    @Query("SELECT o FROM Order o WHERE o.orderNumber = :orderNumber")
    Optional<Order> findByOrderNumber(@Param("orderNumber") String orderNumber);

    /**
     * Get user's order history (paginated, newest first).
     */
    @Query("SELECT o FROM Order o WHERE o.user.id = :userId " +
           "AND (:status IS NULL OR o.status = :status) " +
           "ORDER BY o.createdAt DESC")
    Page<Order> findByUserId(
            @Param("userId") String userId,
            @Param("status") String status,
            Pageable pageable
    );

    /**
     * Admin: Get all orders with optional status filter.
     */
    @Query("SELECT o FROM Order o WHERE (:status IS NULL OR o.status = :status) " +
           "ORDER BY o.createdAt DESC")
    Page<Order> findAllWithStatus(@Param("status") String status, Pageable pageable);

    /**
     * Admin: Search orders by order number.
     */
    @Query("SELECT o FROM Order o WHERE o.orderNumber LIKE CONCAT('%', :query, '%') ORDER BY o.createdAt DESC")
    Page<Order> searchByOrderNumber(@Param("query") String query, Pageable pageable);

    /**
     * Count orders by status (admin dashboard).
     */
    @Query("SELECT COUNT(o) FROM Order o WHERE o.status = :status")
    long countByStatus(@Param("status") String status);
}
