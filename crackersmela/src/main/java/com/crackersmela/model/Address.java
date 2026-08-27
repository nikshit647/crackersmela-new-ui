package com.crackersmela.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Shipping/billing address for a user.
 * Indian address format: Name, Phone, Address, City, State, PIN Code.
 */
@Entity
@Table(name = "addresses")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Address {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Size(max = 50)
    private String label;       // "Home", "Office", etc.

    @NotBlank(message = "Recipient name is required")
    @Size(max = 200)
    @Column(nullable = false, length = 200)
    private String recipientName;

    @NotBlank(message = "Phone number is required")
    @Size(min = 10, max = 20)
    @Column(nullable = false, length = 20)
    private String phone;

    @NotBlank(message = "Address line 1 is required")
    @Size(max = 255)
    @Column(nullable = false, length = 255)
    private String addressLine1;

    @Size(max = 255)
    private String addressLine2;

    @NotBlank(message = "City is required")
    @Size(max = 100)
    @Column(nullable = false, length = 100)
    private String city;

    @NotBlank(message = "State is required")
    @Size(max = 100)
    @Column(nullable = false, length = 100)
    private String state;

    @NotBlank(message = "PIN code is required")
    @Pattern(regexp = "^[0-9]{6}$", message = "PIN code must be exactly 6 digits")
    @Column(nullable = false, length = 10)
    private String pincode;

    @Size(min = 2, max = 2)
    @Column(nullable = false, length = 2)
    @Builder.Default
    private String country = "IN";  // ISO 3166-1 alpha-2

    @Builder.Default
    private Boolean isDefault = false;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
