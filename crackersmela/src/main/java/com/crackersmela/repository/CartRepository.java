package com.crackersmela.repository;

import com.crackersmela.model.Cart;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for Cart entity.
 */
@Repository
public interface CartRepository extends JpaRepository<Cart, String> {

    /**
     * Find cart by user ID (one cart per user).
     */
    @Query("SELECT c FROM Cart c LEFT JOIN FETCH c.items LEFT JOIN FETCH c.items.product " +
           "WHERE c.user.id = :userId")
    Optional<Cart> findByUserId(@Param("userId") String userId);

    /**
     * Delete carts older than a given date (cleanup task).
     */
    @Query("DELETE FROM Cart c WHERE c.updatedAt < :cutoffDate AND c.user IS NULL")
    int deleteStaleGuestCarts(@Param("cutoffDate") java.time.LocalDateTime cutoffDate);
}
