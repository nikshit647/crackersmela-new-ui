package com.crackersmela.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * User entity with role-based access control.
 *
 * Supports two roles:
 *   - ADMIN:  Full access — manage products, view all orders
 *   - CUSTOMER: Browse, cart, checkout, manage profile
 *
 * Security features:
 *   - Passwords stored as bcrypt hashes (never plaintext)
 *   - Account lockout after 5 failed login attempts
 *   - Soft-delete support (records never physically removed)
 */
@Entity
@Table(name = "users", indexes = {
        @Index(name = "idx_user_email", columnList = "email", unique = true)
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // ---------------------------------------------------------------------------
    // Authentication
    // ---------------------------------------------------------------------------
    @NotBlank(message = "Email is required")
    @Email(message = "Must be a valid email address")
    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @NotBlank(message = "Password is required")
    @Size(min = 8, max = 255, message = "Password must be 8-255 characters")
    @Column(nullable = false)
    private String passwordHash;

    // ---------------------------------------------------------------------------
    // Role-Based Access Control
    // ---------------------------------------------------------------------------
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private UserRole role = UserRole.CUSTOMER;

    public enum UserRole {
        ADMIN, CUSTOMER
    }

    // ---------------------------------------------------------------------------
    // Profile
    // ---------------------------------------------------------------------------
    @NotBlank(message = "First name is required")
    @Size(max = 100)
    @Column(nullable = false, length = 100)
    private String firstName;

    @NotBlank(message = "Last name is required")
    @Size(max = 100)
    @Column(nullable = false, length = 100)
    private String lastName;

    @Size(max = 20)
    private String phone;

    private String avatarUrl;

    // ---------------------------------------------------------------------------
    // Account Status
    // ---------------------------------------------------------------------------
    @Builder.Default
    private Boolean isActive = true;

    @Builder.Default
    private Boolean isVerified = false;

    @Builder.Default
    private Integer failedLoginAttempts = 0;

    private LocalDateTime lockedUntil;

    private LocalDateTime lastLoginAt;

    // ---------------------------------------------------------------------------
    // Relationships
    // ---------------------------------------------------------------------------
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<Order> orders = new ArrayList<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<Address> addresses = new ArrayList<>();

    // ---------------------------------------------------------------------------
    // Audit Timestamps
    // ---------------------------------------------------------------------------
    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    // ---------------------------------------------------------------------------
    // Soft Delete
    // ---------------------------------------------------------------------------
    private LocalDateTime deletedAt;

    // ---------------------------------------------------------------------------
    // Computed Properties
    // ---------------------------------------------------------------------------
    public String getFullName() {
        return firstName + " " + lastName;
    }

    public boolean isLocked() {
        return lockedUntil != null && lockedUntil.isAfter(LocalDateTime.now());
    }
}
