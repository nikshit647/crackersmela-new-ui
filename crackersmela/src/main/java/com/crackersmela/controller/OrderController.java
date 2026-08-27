package com.crackersmela.controller;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.dto.OrderRequest;
import com.crackersmela.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
@Tag(name = "Orders", description = "Order placement, history, and management")
public class OrderController {

    private final OrderService orderService;

    @PostMapping("/checkout")
    @Operation(summary = "Place order from cart (checkout)")
    public ResponseEntity<ApiResponse.Success<ApiResponse.OrderResponse>> checkout(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody OrderRequest.Checkout request
    ) {
        ApiResponse.OrderResponse order = orderService.createOrder(userDetails.getUsername(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ApiResponse.Success<>(true, "Order placed successfully", order));
    }

    @GetMapping
    @Operation(summary = "Get my order history")
    public ResponseEntity<ApiResponse.Success<ApiResponse.Paginated<ApiResponse.OrderResponse>>> getMyOrders(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int perPage,
            @RequestParam(required = false) String status
    ) {
        ApiResponse.Paginated<ApiResponse.OrderResponse> orders =
                orderService.getUserOrders(userDetails.getUsername(), page, perPage, status);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, null, orders));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get order details")
    public ResponseEntity<ApiResponse.Success<ApiResponse.OrderResponse>> getOrder(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String id
    ) {
        ApiResponse.OrderResponse order = orderService.getOrderById(id, userDetails.getUsername());
        return ResponseEntity.ok(new ApiResponse.Success<>(true, null, order));
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Update order status (admin only)")
    public ResponseEntity<ApiResponse.Success<ApiResponse.OrderResponse>> updateOrderStatus(
            @PathVariable String id,
            @Valid @RequestBody OrderRequest.StatusUpdate request
    ) {
        ApiResponse.OrderResponse order = orderService.updateOrderStatus(id, request);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Order status updated", order));
    }
}
