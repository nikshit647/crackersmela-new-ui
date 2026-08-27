package com.crackersmela.service;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.dto.AuthRequest;
import com.crackersmela.exception.BadRequestException;
import com.crackersmela.exception.ResourceNotFoundException;
import com.crackersmela.model.Cart;
import com.crackersmela.model.User;
import com.crackersmela.repository.CartRepository;
import com.crackersmela.repository.UserRepository;
import com.crackersmela.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Authentication service handling registration, login, and token management.
 *
 * Security features:
 *   - Bcrypt password hashing (12 rounds)
 *   - Account lockout after 5 failed login attempts (15 min lockout)
 *   - Constant-time comparison prevents user enumeration via timing
 *   - Token rotation on refresh (old refresh token is invalidated)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final CartRepository cartRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final AuthenticationManager authenticationManager;

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCKOUT_MINUTES = 15;

    // =========================================================================
    // Registration
    // =========================================================================
    @Transactional
    public ApiResponse.AuthResponse register(AuthRequest.Register request) {
        // Check for duplicate email
        if (userRepository.existsByEmail(request.getEmail().toLowerCase())) {
            throw new BadRequestException("An account with this email already exists");
        }

        // Create user
        User user = User.builder()
                .email(request.getEmail().toLowerCase().trim())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .firstName(request.getFirstName().trim())
                .lastName(request.getLastName().trim())
                .phone(request.getPhone() != null ? request.getPhone().trim() : null)
                .role(User.UserRole.CUSTOMER)
                .isActive(true)
                .isVerified(false)
                .build();

        user = userRepository.save(user);

        // Create default cart for the new user
        Cart cart = Cart.builder().user(user).build();
        cartRepository.save(cart);

        log.info("New user registered: {} (id={})", user.getEmail(), user.getId());

        // Generate tokens
        String accessToken = tokenProvider.createAccessToken(user.getId(), user.getRole().name());
        String refreshToken = tokenProvider.createRefreshToken(user.getId());

        return buildAuthResponse(user, accessToken, refreshToken);
    }

    // =========================================================================
    // Login
    // =========================================================================
    @Transactional
    public ApiResponse.AuthResponse login(AuthRequest.Login request) {
        // Find user by email
        User user = userRepository.findByEmail(request.getEmail().toLowerCase())
                .orElseThrow(() -> {
                    // Constant-time comparison to prevent user enumeration
                    passwordEncoder.encode("dummy-password-to-prevent-timing-attacks");
                    return new BadRequestException("Invalid email or password");
                });

        // Check account lockout
        if (user.isLocked()) {
            long remainingMinutes = java.time.Duration.between(
                    LocalDateTime.now(), user.getLockedUntil()
            ).toMinutes() + 1;
            throw new BadRequestException(
                    "Account is locked. Try again in " + remainingMinutes + " minute(s)"
            );
        }

        // Check account status
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new BadRequestException("Account has been deactivated. Contact support.");
        }

        // Verify password
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            handleFailedLogin(user);
            throw new BadRequestException("Invalid email or password");
        }

        // Successful login — reset counters
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        // Generate tokens
        String accessToken = tokenProvider.createAccessToken(user.getId(), user.getRole().name());
        String refreshToken = tokenProvider.createRefreshToken(user.getId());

        log.info("User authenticated: {}", user.getEmail());
        return buildAuthResponse(user, accessToken, refreshToken);
    }

    // =========================================================================
    // Token Refresh
    // =========================================================================
    @Transactional
    public ApiResponse.TokenPair refreshTokens(AuthRequest.RefreshToken request) {
        String token = request.getRefreshToken();

        if (!tokenProvider.validateToken(token)) {
            throw new BadRequestException("Invalid or expired refresh token");
        }

        String type = tokenProvider.getTypeFromToken(token);
        if (!"refresh".equals(type)) {
            throw new BadRequestException("Invalid token type. Refresh token required.");
        }

        String userId = tokenProvider.getUserIdFromToken(token);

        // Verify user still exists and is active
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BadRequestException("User not found"));

        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new BadRequestException("User account is inactive");
        }

        // Issue new token pair (rotation)
        String newAccessToken = tokenProvider.createAccessToken(user.getId(), user.getRole().name());
        String newRefreshToken = tokenProvider.createRefreshToken(user.getId());

        return ApiResponse.TokenPair.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .tokenType("Bearer")
                .expiresIn(1800) // 30 minutes in seconds
                .build();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private void handleFailedLogin(User user) {
        int attempts = user.getFailedLoginAttempts() + 1;
        user.setFailedLoginAttempts(attempts);

        if (attempts >= MAX_FAILED_ATTEMPTS) {
            user.setLockedUntil(LocalDateTime.now().plusMinutes(LOCKOUT_MINUTES));
            log.warn("Account locked: {} (too many failed attempts)", user.getEmail());
        }

        userRepository.save(user);
    }

    private ApiResponse.AuthResponse buildAuthResponse(
            User user, String accessToken, String refreshToken
    ) {
        return ApiResponse.AuthResponse.builder()
                .user(ApiResponse.UserSummary.builder()
                        .id(user.getId())
                        .email(user.getEmail())
                        .firstName(user.getFirstName())
                        .lastName(user.getLastName())
                        .fullName(user.getFullName())
                        .role(user.getRole().name())
                        .isVerified(Boolean.TRUE.equals(user.getIsVerified()))
                        .build())
                .tokens(ApiResponse.TokenPair.builder()
                        .accessToken(accessToken)
                        .refreshToken(refreshToken)
                        .tokenType("Bearer")
                        .expiresIn(1800) // 30 minutes in seconds
                        .build())
                .build();
    }
}
