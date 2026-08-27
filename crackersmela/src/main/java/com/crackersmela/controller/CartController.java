package com.crackersmela.controller;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.dto.OrderRequest;
import com.crackersmela.service.CartService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/cart")
@RequiredArgsConstructor
@Tag(name = "Cart", description = "Shopping cart management")
public class CartController {

    private final CartService cartService;

    @GetMapping
    @Operation(summary = "Get current cart")
    public ResponseEntity<ApiResponse.Success<ApiResponse.CartResponse>> getCart(
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        ApiResponse.CartResponse cart = cartService.getCart(userDetails.getUsername());
        return ResponseEntity.ok(new ApiResponse.Success<>(true, null, cart));
    }

    @PostMapping("/items")
    @Operation(summary = "Add item to cart")
    public ResponseEntity<ApiResponse.Success<ApiResponse.CartResponse>> addItem(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody OrderRequest.CartItem request
    ) {
        ApiResponse.CartResponse cart = cartService.addItem(userDetails.getUsername(), request);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Item added to cart", cart));
    }

    @PutMapping("/items/{itemId}")
    @Operation(summary = "Update cart item quantity")
    public ResponseEntity<ApiResponse.Success<ApiResponse.CartResponse>> updateItem(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String itemId,
            @Valid @RequestBody OrderRequest.UpdateCartItem request
    ) {
        ApiResponse.CartResponse cart = cartService.updateItem(userDetails.getUsername(), itemId, request);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Cart item updated", cart));
    }

    @DeleteMapping("/items/{itemId}")
    @Operation(summary = "Remove item from cart")
    public ResponseEntity<ApiResponse.Success<ApiResponse.CartResponse>> removeItem(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String itemId
    ) {
        ApiResponse.CartResponse cart = cartService.removeItem(userDetails.getUsername(), itemId);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Item removed from cart", cart));
    }

    @DeleteMapping
    @Operation(summary = "Clear entire cart")
    public ResponseEntity<ApiResponse.Success<Void>> clearCart(
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        cartService.clearCart(userDetails.getUsername());
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Cart cleared successfully", null));
    }
}
