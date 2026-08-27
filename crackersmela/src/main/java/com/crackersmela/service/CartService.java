package com.crackersmela.service;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.dto.OrderRequest;
import com.crackersmela.exception.BadRequestException;
import com.crackersmela.exception.ResourceNotFoundException;
import com.crackersmela.model.Cart;
import com.crackersmela.model.CartItem;
import com.crackersmela.model.Product;
import com.crackersmela.repository.CartItemRepository;
import com.crackersmela.repository.CartRepository;
import com.crackersmela.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;

/**
 * Shopping cart service.
 *
 * Cart operations:
 *   - Add items (validates stock, snapshots price)
 *   - Update quantity (re-validates stock)
 *   - Remove items
 *   - Clear cart
 *
 * Price is SNAPSHOT at time of addition — product price changes don't affect existing cart items.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CartService {

    private final CartRepository cartRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;

    // =========================================================================
    // Get Cart
    // =========================================================================
    @Cacheable(value = "cart", key = "#userId")
    public ApiResponse.CartResponse getCart(String userId) {
        Cart cart = getOrCreateCart(userId);
        return toCartResponse(cart);
    }

    // =========================================================================
    // Add Item to Cart
    // =========================================================================
    @Transactional
    @CacheEvict(value = "cart", key = "#userId")
    public ApiResponse.CartResponse addItem(String userId, OrderRequest.CartItem request) {
        Cart cart = getOrCreateCart(userId);

        // Find product
        Product product = productRepository.findById(request.getProductId())
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Product", "id", request.getProductId()));

        // Validate stock
        if (Boolean.TRUE.equals(product.getTrackInventory()) && product.getStockQuantity() < request.getQuantity()) {
            throw new BadRequestException(
                    "Insufficient stock for '" + product.getName() + "'. Available: " + product.getStockQuantity()
            );
        }

        // Check if product already in cart
        var existingItem = cartItemRepository.findByCartIdAndProductId(cart.getId(), request.getProductId());

        if (existingItem.isPresent()) {
            // Update quantity
            CartItem item = existingItem.get();
            int newQuantity = item.getQuantity() + request.getQuantity();

            if (Boolean.TRUE.equals(product.getTrackInventory()) && product.getStockQuantity() < newQuantity) {
                throw new BadRequestException(
                        "Insufficient stock. Available: " + product.getStockQuantity() +
                        ", Requested: " + newQuantity
                );
            }

            item.setQuantity(newQuantity);
            cartItemRepository.save(item);
        } else {
            // Add new item
            CartItem item = CartItem.builder()
                    .cart(cart)
                    .product(product)
                    .quantity(request.getQuantity())
                    .price(product.getPrice())  // Price snapshot
                    .note(request.getNote())
                    .build();
            cartItemRepository.save(item);
        }

        // Recalculate totals
        cart = getOrCreateCart(userId);
        cart.recalculateTotals();
        cartRepository.save(cart);

        return toCartResponse(cart);
    }

    // =========================================================================
    // Update Item Quantity
    // =========================================================================
    @Transactional
    @CacheEvict(value = "cart", key = "#userId")
    public ApiResponse.CartResponse updateItem(String userId, String itemId, OrderRequest.UpdateCartItem request) {
        Cart cart = getOrCreateCart(userId);

        CartItem item = cartItemRepository.findById(itemId)
                .orElseThrow(() -> new ResourceNotFoundException("Cart item", "id", itemId));

        // Verify item belongs to this user's cart
        if (!item.getCart().getId().equals(cart.getId())) {
            throw new BadRequestException("Cart item does not belong to this cart");
        }

        // Validate stock
        Product product = item.getProduct();
        if (Boolean.TRUE.equals(product.getTrackInventory()) && product.getStockQuantity() < request.getQuantity()) {
            throw new BadRequestException("Insufficient stock. Available: " + product.getStockQuantity());
        }

        item.setQuantity(request.getQuantity());
        cartItemRepository.save(item);

        // Recalculate
        cart = getOrCreateCart(userId);
        cart.recalculateTotals();
        cartRepository.save(cart);

        return toCartResponse(cart);
    }

    // =========================================================================
    // Remove Item
    // =========================================================================
    @Transactional
    @CacheEvict(value = "cart", key = "#userId")
    public ApiResponse.CartResponse removeItem(String userId, String itemId) {
        Cart cart = getOrCreateCart(userId);

        CartItem item = cartItemRepository.findById(itemId)
                .orElseThrow(() -> new ResourceNotFoundException("Cart item", "id", itemId));

        if (!item.getCart().getId().equals(cart.getId())) {
            throw new BadRequestException("Cart item does not belong to this cart");
        }

        cartItemRepository.delete(item);

        // Recalculate
        cart = getOrCreateCart(userId);
        cart.recalculateTotals();
        cartRepository.save(cart);

        return toCartResponse(cart);
    }

    // =========================================================================
    // Clear Cart
    // =========================================================================
    @Transactional
    @CacheEvict(value = "cart", key = "#userId")
    public void clearCart(String userId) {
        Cart cart = getOrCreateCart(userId);
        cartItemRepository.deleteAllByCartId(cart.getId());
        cart.getItems().clear();
        cart.setTotalItems(0);
        cart.setSubtotal(java.math.BigDecimal.ZERO);
        cartRepository.save(cart);

        log.info("Cart cleared for user: {}", userId);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Cart getOrCreateCart(String userId) {
        return cartRepository.findByUserId(userId)
                .orElseGet(() -> {
                    var cart = Cart.builder()
                            .user(new com.crackersmela.model.User() {{ setId(userId); }})
                            .items(new ArrayList<>())
                            .totalItems(0)
                            .subtotal(java.math.BigDecimal.ZERO)
                            .build();
                    return cartRepository.save(cart);
                });
    }

    private ApiResponse.CartResponse toCartResponse(Cart cart) {
        return ApiResponse.CartResponse.builder()
                .id(cart.getId())
                .items(cart.getItems() != null
                        ? cart.getItems().stream().map(this::toCartItemResponse).toList()
                        : new ArrayList<>())
                .totalItems(cart.getTotalItems())
                .subtotal(cart.getSubtotal())
                .build();
    }

    private ApiResponse.CartItemResponse toCartItemResponse(CartItem item) {
        return ApiResponse.CartItemResponse.builder()
                .id(item.getId())
                .productId(item.getProduct().getId())
                .productName(item.getProduct().getName())
                .productImage(
                        item.getProduct().getImages() != null && !item.getProduct().getImages().isEmpty()
                                ? item.getProduct().getImages().get(0) : null
                )
                .price(item.getPrice())
                .quantity(item.getQuantity())
                .lineTotal(item.getLineTotal())
                .note(item.getNote())
                .inStock(item.getProduct().isInStock())
                .build();
    }
}
