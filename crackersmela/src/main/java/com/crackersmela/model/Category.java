package com.crackersmela.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Product category with tree structure for fireworks taxonomy.
 *
 * Example hierarchy:
 *   Firecrackers
 *   ├── Atom Bombs
 *   │   ├── Onion Bombs
 *   │   └── Deluxe Atom Bombs
 *   ├── Garlands (1000 Wala, 5000 Wala)
 *   └── Sparklers (6 inch, 12 inch)
 */
@Entity
@Table(name = "categories", indexes = {
        @Index(name = "idx_category_slug", columnList = "slug", unique = true)
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @NotBlank(message = "Category name is required")
    @Size(max = 100)
    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @NotBlank(message = "Slug is required")
    @Size(max = 120)
    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    @Size(max = 1000)
    private String description;

    private String imageUrl;

    @Builder.Default
    private Boolean isActive = true;

    @Builder.Default
    private Integer sortOrder = 0;

    // ---------------------------------------------------------------------------
    // Self-referential parent for tree structure
    // ---------------------------------------------------------------------------
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Category parent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<Category> children = new ArrayList<>();

    // ---------------------------------------------------------------------------
    // Relationships
    // ---------------------------------------------------------------------------
    @OneToMany(mappedBy = "category", fetch = FetchType.LAZY)
    @Builder.Default
    private List<Product> products = new ArrayList<>();

    // ---------------------------------------------------------------------------
    // Audit
    // ---------------------------------------------------------------------------
    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    private LocalDateTime deletedAt;
}
