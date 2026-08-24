package com.myfinance.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.util.Locale;

/** An account. Owns profiles. Table is {@code app_user} because {@code user} is reserved in Postgres. */
@Entity
@Table(name = "app_user")
public class User extends AuditedEntity {

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    protected User() {
        // JPA
    }

    /**
     * The one canonical form of an email address (docs/SCHEMA.md relies on the service layer for
     * case-insensitive uniqueness): trimmed and lower-cased with a fixed locale, so "I" never
     * becomes a dotless i on a Turkish JVM.
     */
    public static String normalizeEmail(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    public User(String email, String passwordHash, String displayName) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }
}
