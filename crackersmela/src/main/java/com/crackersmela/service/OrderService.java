package com.crackersmela.service;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.dto.OrderRequest;
import com.crackersmela.exception.BadRequestException;
import com.crackersmela.exception.ResourceNotFoundException;
import com.crackersmela.model.*;
import com.crackersmela.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.*;

/**
 * Order lifecycle management.
 *
 * Order flow:
 *   PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
 *                                             ↘ CANCELLED
 *
 * Key invariants:
 *   - Stock is reserved at order creation (prevents overselling)
 *   - Totals are calculated server-side (never trust client values)
 *   - Price snapshots in OrderItem protect against price changes
 *   - Status transitions are validated (can't go backwards)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final CartRepository cartRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final PaymentRepository paymentRepository;

    // =========================================================================
    // Create Order (Checkout)
    // =========================================================================
    @Transactional
    public ApiResponse.OrderResponse createOrder(String userId, OrderRequest.Checkout request) {
        // Step 1: Fetch cart
        Cart cart = cartRepository.findByUserId(userId)
                .orElseThrow(() -> new BadRequestException("Cart is empty"));

        if (cart.getItems() == null || cart.getItems().isEmpty()) {
            throw new BadRequestException("Cart is empty");
        }

        // Step 2: Validate stock for all items
        for (CartItem cartItem : cart.getItems()) {
            Product product = cartItem.getProduct();
            if (Boolean.TRUE.equals(product.getTrackInventory()) &&
                product.getStockQuantity() < cartItem.getQuantity()) {
                throw new BadRequestException(
                        "Insufficient stock for '" + product.getName() + "'. " +
                        "Available: " + product.getStockQuantity()
                );
            }
        }

        // Step 3: Calculate totals
        BigDecimal subtotal = BigDecimal.ZERO;
        List<OrderItem> orderItems = new ArrayList<>();

        for (CartItem cartItem : cart.getItems()) {
            Product product = cartItem.getProduct();
            BigDecimal lineTotal = cartItem.getPrice().multiply(BigDecimal.valueOf(cartItem.getQuantity()));
            subtotal = subtotal.add(lineTotal);

            orderItems.add(OrderItem.builder()
                    .product(product)
                    .quantity(cartItem.getQuantity())
                    .price(cartItem.getPrice())  // Price snapshot
                    .productName(product.getName())
                    .productSku(product.getSku())
                    .build());
        }

        // Step 4: Calculate tax and shipping
        BigDecimal taxAmount = calculateTax(subtotal);
        BigDecimal shippingCost = calculateShipping(subtotal);
        BigDecimal discountAmount = BigDecimal.ZERO; // TODO: coupon logic
        BigDecimal totalAmount = subtotal.add(taxAmount).add(shippingCost).subtract(discountAmount);

        // Step 5: Generate order number
        String orderNumber = generateOrderNumber();

        // Step 6: Build order
        Order order = Order.builder()
                .orderNumber(orderNumber)
                .subtotal(subtotal)
                .taxAmount(taxAmount)
                .shippingCost(shippingCost)
                .discountAmount(discountAmount)
                .totalAmount(totalAmount)
                .status(Order.OrderStatus.PENDING)
                .shippingName(request.getShippingAddress().getRecipientName())
                .shippingPhone(request.getShippingAddress().getPhone())
                .shippingAddressLine1(request.getShippingAddress().getAddressLine1())
                .shippingAddressLine2(request.getShippingAddress().getAddressLine2())
                .shippingCity(request.getShippingAddress().getCity())
                .shippingState(request.getShippingAddress().getState())
                .shippingPincode(request.getShippingAddress().getPincode())
                .notes(request.getNotes())
                .couponCode(request.getCouponCode())
                .items(orderItems)
                .build();

        order = orderRepository.save(order);

        // Link order items to order
        for (OrderItem item : orderItems) {
            item.setOrder(order);
        }

        // Step 7: Deduct inventory
        for (CartItem cartItem : cart.getItems()) {
            Product product = cartItem.getProduct();
            product.setStockQuantity(product.getStockQuantity() - cartItem.getQuantity());
            if (Boolean.TRUE.equals(product.getTrackInventory()) && product.getStockQuantity() == 0) {
                product.setStatus(Product.ProductStatus.OUT_OF_STOCK);
            }
            productRepository.save(product);
        }

        // Step 8: Create pending payment
        Payment payment = Payment.builder()
                .order(order)
                .amount(totalAmount)
                .currency("INR")
                .method(Payment.PaymentMethod.STRIPE)
                .status(Payment.PaymentStatus.PENDING)
                .build();
        paymentRepository.save(payment);

        // Step 9: Clear cart
        cartItemRepository.deleteAllByCartId(cart.getId());

        log.info("Order created: {} (user={}, total={}, items={})",
                orderNumber, userId, totalAmount, orderItems.size());

        return toOrderResponse(order);
    }

    // =========================================================================
    // Get User Orders
    // =========================================================================
    public ApiResponse.Paginated<ApiResponse.OrderResponse> getUserOrders(
            String userId, int page, int perPage, String status
    ) {
        Page<Order> orders = orderRepository.findByUserId(userId, status, PageRequest.of(page - 1, perPage));

        List<ApiResponse.OrderResponse> items = orders.getContent().stream()
                .map(this::toOrderResponse)
                .toList();

        return ApiResponse.Paginated.<ApiResponse.OrderResponse>builder()
                .items(items)
                .total((int) orders.getTotalElements())
                .page(page)
                .perPage(perPage)
                .totalPages(orders.getTotalPages())
                .build();
    }

    // =========================================================================
    // Get Order by ID
    // =========================================================================
    public ApiResponse.OrderResponse getOrderById(String orderId, String userId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order", "id", orderId));

        // Verify ownership (unless admin)
        if (userId != null && !order.getUser().getId().equals(userId)) {
            throw new BadRequestException("Order does not belong to this user");
        }

        return toOrderResponse(order);
    }

    // =========================================================================
    // Admin: Update Order Status
    // =========================================================================
    @Transactional
    public ApiResponse.OrderResponse updateOrderStatus(String orderId, OrderRequest.StatusUpdate request) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order", "id", orderId));

        Order.OrderStatus newStatus = Order.OrderStatus.valueOf(request.getStatus().toUpperCase());

        // Validate transition
        if (!isValidTransition(order.getStatus(), newStatus)) {
            throw new BadRequestException(
                    "Cannot transition from '" + order.getStatus() + "' to '" + newStatus + "'"
            );
        }

        // If cancelling, restore inventory
        if (newStatus == Order.OrderStatus.CANCELLED) {
            for (OrderItem item : order.getItems()) {
                Product product = item.getProduct();
                product.setStockQuantity(product.getStockQuantity() + item.getQuantity());
                if (product.getStatus() == Product.ProductStatus.OUT_OF_STOCK) {
                    product.setStatus(Product.ProductStatus.ACTIVE);
                }
                productRepository.save(product);
            }
        }

        order.setStatus(newStatus);
        order.setStatusChangedAt(LocalDateTime.now());
        orderRepository.save(order);

        log.info("Order {} status: {} → {}", order.getOrderNumber(), order.getStatus(), newStatus);
        return toOrderResponse(order);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String generateOrderNumber() {
        long count = orderRepository.count();
        return String.format("CM-%d-%06d", Year.now().getValue(), count + 1);
    }

    private BigDecimal calculateTax(BigDecimal taxableAmount) {
        // 12% GST for fireworks
        return taxableAmount.multiply(new BigDecimal("0.12")).setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private BigDecimal calculateShipping(BigDecimal subtotal) {
        // Free shipping for orders above ₹500
        if (subtotal.compareTo(new BigDecimal("500")) >= 0) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal("50.00");
    }

    private boolean isValidTransition(Order.OrderStatus from, Order.OrderStatus to) {
        return switch (from) {
            case PENDING -> to == Order.OrderStatus.CONFIRMED || to == Order.OrderStatus.CANCELLED;
            case CONFIRMED -> to == Order.OrderStatus.PROCESSING || to == Order.OrderStatus.CANCELLED || to == Order.OrderStatus.REFUNDED;
            case PROCESSING -> to == Order.OrderStatus.SHIPPED || to == Order.OrderStatus.CANCELLED;
            case SHIPPED -> to == Order.OrderStatus.DELIVERED;
            case DELIVERED, CANCELLED, REFUNDED -> false;
        };
    }

    private ApiResponse.OrderResponse toOrderResponse(Order order) {
        return ApiResponse.OrderResponse.builder()
                .id(order.getId())
                .orderNumber(order.getOrderNumber())
                .status(order.getStatus().name())
                .subtotal(order.getSubtotal())
                .taxAmount(order.getTaxAmount())
                .shippingCost(order.getShippingCost())
                .discountAmount(order.getDiscountAmount())
                .totalAmount(order.getTotalAmount())
                .shippingName(order.getShippingName())
                .shippingPhone(order.getShippingPhone())
                .shippingAddressLine1(order.getShippingAddressLine1())
                .shippingAddressLine2(order.getShippingAddressLine2())
                .shippingCity(order.getShippingCity())
                .shippingState(order.getShippingState())
                .shippingPincode(order.getShippingPincode())
                .notes(order.getNotes())
                .couponCode(order.getCouponCode())
                .items(order.getItems().stream().map(this::toOrderItemResponse).toList())
                .itemCount(order.getItemCount())
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .build();
    }

    private ApiResponse.OrderItemResponse toOrderItemResponse(OrderItem item) {
        return ApiResponse.OrderItemResponse.builder()
                .id(item.getId())
                .productId(item.getProduct().getId())
                .productName(item.getProductName())
                .productSku(item.getProductSku())
                .price(item.getPrice())
                .quantity(item.getQuantity())
                .lineTotal(item.getLineTotal())
                .build();
    }
}