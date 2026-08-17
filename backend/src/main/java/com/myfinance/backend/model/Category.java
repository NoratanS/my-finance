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

    protected Category() {
        // JPA
    }

    public Category(Profile profile, Category parent, String name) {
        this.profile = profile;
        this.parent = parent;
        this.name = name;
    }

    public Profile getProfile() {
        return profile;
    }

    public Category getParent() {
        return parent;
    }

    /** Convenience for building responses without initializing the lazy parent. */
    public Long getParentId() {
        return parent == null ? null : parent.getId();
    }

    public String getName() {
        return name;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void moveTo(Category newParent) {
        this.parent = newParent;
    }
}
