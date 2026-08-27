package com.crackersmela.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

/**
 * JWT Token Provider — handles token creation, validation, and extraction.
 *
 * Security features:
 *   - HMAC-SHA256 signing with 256-bit secret key
 *   - Short-lived access tokens (30 min) to limit exposure
 *   - Long-lived refresh tokens (7 days) for session management
 *   - Token type claim prevents access/refresh token confusion
 *
 * Token payload structure:
 *   {
 *     "sub": "user-id",
 *     "role": "CUSTOMER",
 *     "type": "access",
 *     "exp": 1234567890,
 *     "iat": 1234567000
 *   }
 */
@Slf4j
@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long accessTokenExpiration;
    private final long refreshTokenExpiration;
    private final String tokenPrefix;
    private final String headerName;

    public JwtTokenProvider(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.access-token-expiration}") long accessTokenExpiration,
            @Value("${app.jwt.refresh-token-expiration}") long refreshTokenExpiration,
            @Value("${app.jwt.token-prefix}") String tokenPrefix,
            @Value("${app.jwt.header}") String headerName
    ) {
        // Decode the Base64 secret and create HMAC key
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(
                java.util.Base64.getEncoder().encodeToString(secret.getBytes())
        ));
        this.accessTokenExpiration = accessTokenExpiration;
        this.refreshTokenExpiration = refreshTokenExpiration;
        this.tokenPrefix = tokenPrefix;
        this.headerName = headerName;
    }

    // =========================================================================
    // Token Creation
    // =========================================================================

    /**
     * Create an access token for the authenticated user.
     * Contains user ID, role, and type="access".
     */
    public String createAccessToken(Authentication authentication) {
        UserDetails userDetails = (UserDetails) authentication.getPrincipal();
        return createToken(userDetails.getUsername(), "access", accessTokenExpiration);
    }

    /**
     * Create an access token from user ID and role directly.
     * Used after manual authentication (e.g., registration).
     */
    public String createAccessToken(String userId, String role) {
        return createToken(userId, "access", accessTokenExpiration, role);
    }

    /**
     * Create a refresh token for the user.
     * Longer-lived, used to obtain new access tokens.
     */
    public String createRefreshToken(String userId) {
        return createToken(userId, "refresh", refreshTokenExpiration);
    }

    // =========================================================================
    // Token Validation
    // =========================================================================

    /**
     * Validate a JWT token.
     * Returns true if the token is valid, not expired, and signature is correct.
     */
    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token);
            return true;
        } catch (SecurityException e) {
            log.error("Invalid JWT signature: {}", e.getMessage());
        } catch (MalformedJwtException e) {
            log.error("Malformed JWT token: {}", e.getMessage());
        } catch (ExpiredJwtException e) {
            log.error("Expired JWT token: {}", e.getMessage());
        } catch (UnsupportedJwtException e) {
            log.error("Unsupported JWT token: {}", e.getMessage());
        } catch (IllegalArgumentException e) {
            log.error("JWT claims string is empty: {}", e.getMessage());
        }
        return false;
    }

    // =========================================================================
    // Claims Extraction
    // =========================================================================

    /**
     * Extract user ID (subject) from token.
     */
    public String getUserIdFromToken(String token) {
        Claims claims = getClaimsFromToken(token);
        return claims.getSubject();
    }

    /**
     * Extract role from token.
     */
    public String getRoleFromToken(String token) {
        Claims claims = getClaimsFromToken(token);
        return claims.get("role", String.class);
    }

    /**
     * Extract token type (access or refresh).
     */
    public String getTypeFromToken(String token) {
        Claims claims = getClaimsFromToken(token);
        return claims.get("type", String.class);
    }

    // =========================================================================
    // Request Extraction
    // =========================================================================

    /**
     * Extract the JWT from the Authorization header.
     * Format: "Bearer <token>"
     */
    public String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader(headerName);
        if (bearerToken != null && bearerToken.startsWith(tokenPrefix)) {
            return bearerToken.substring(tokenPrefix.length());
        }
        return null;
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    private String createToken(String subject, String type, long expiration) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .subject(subject)
                .claim("type", type)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(key)
                .compact();
    }

    private String createToken(String subject, String type, long expiration, String role) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .subject(subject)
                .claim("type", type)
                .claim("role", role)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(key)
                .compact();
    }

    private Claims getClaimsFromToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
