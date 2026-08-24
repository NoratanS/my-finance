package com.myfinance.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * Node in a profile's category tree (adjacency list: {@code parent == null} means root).
 * Depth limit and cycle prevention are service-layer rules — see docs/SCHEMA.md.
 */
@Entity
@Table(name = "category")
public class Category extends AuditedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Category parent;

    @Column(nullable = false)
    private String name;

    /**
     * Display color ({@code #rrggbb}, lowercase) or {@code null} for "inherit from the nearest
     * ancestor with one" — inheritance is resolved client-side; the server stores and echoes
     * the raw value only (docs/SCHEMA.md "category").
     */
    private String color;

    protected Category() {
        // JPA
    }

    public Category(Profile profile, Category parent, String name) {
        this(profile, parent, name, null);
    }

    public Category(Profile profile, Category parent, String name, String color) {
        this.profile = profile;
        this.parent = parent;
        this.name = name;
        this.color = color;
    }

    public Profile getProfile() {
        return profile;
    }

    public Category getParent() {
        return parent;
    }

    /**
     * Convenience for building responses without initializing the lazy parent: Hibernate answers the
     * identifier getter from the proxy itself, so this never triggers a SELECT. Do not replace it with
     * {@code parent.getId()} through a fetched entity outside a transaction — open-in-view is off, so
     * that would throw {@code LazyInitializationException}.
     */
    public Long getParentId() {
        return parent == null ? null : parent.getId();
    }

    public String getName() {
        return name;
    }

    public String getColor() {
        return color;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void moveTo(Category newParent) {
        this.parent = newParent;
    }

    /** {@code null} clears the color back to "inherit". */
    public void recolor(String color) {
        this.color = color;
    }
}
