package com.crackersmela.dto;

import jakarta.validation.constraints.*;
import lombok.*;

/**
 * DTOs for authentication endpoints.
 * Strict validation prevents injection and malformed input.
 */
public class AuthRequest {

    // =========================================================================
    // Register Request
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Register {
        @NotBlank(message = "First name is required")
        @Size(min = 1, max = 100, message = "First name must be 1-100 characters")
        @Pattern(regexp = "^[a-zA-Z\\s\\-]+$", message = "Name must contain only letters, spaces, and hyphens")
        private String firstName;

        @NotBlank(message = "Last name is required")
        @Size(min = 1, max = 100)
        @Pattern(regexp = "^[a-zA-Z\\s\\-]+$", message = "Name must contain only letters, spaces, and hyphens")
        private String lastName;

        @NotBlank(message = "Email is required")
        @Email(message = "Must be a valid email address")
        private String email;

        @NotBlank(message = "Password is required")
        @Size(min = 8, max = 128, message = "Password must be 8-128 characters")
        private String password;

        @Size(max = 20)
        private String phone;
    }

    // =========================================================================
    // Login Request
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Login {
        @NotBlank(message = "Email is required")
        @Email(message = "Must be a valid email")
        private String email;

        @NotBlank(message = "Password is required")
        @Size(min = 1, max = 128)
        private String password;
    }

    // =========================================================================
    // Token Refresh Request
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RefreshToken {
        @NotBlank(message = "Refresh token is required")
        private String refreshToken;
    }

    // =========================================================================
    // Password Change Request
    // =========================================================================
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ChangePassword {
        @NotBlank(message = "Current password is required")
        private String currentPassword;

        @NotBlank(message = "New password is required")
        @Size(min = 8, max = 128, message = "New password must be 8-128 characters")
        private String newPassword;
    }
}
