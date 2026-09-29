package com.myfinance.backend.model;

import java.util.Locale;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** An account. Owns profiles. Table is {@code app_user} because {@code user} is reserved in Postgres. */
@Entity
@Table(name = "app_user")
public class User extends AuditedEntity {

    @Column(nullable = false, unique = true)
    private String email;

    // Nullable since V6: the local account of a passwordless instance has no password at all.
    @Column(name = "password_hash")
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

    /**
     * The local account of a passwordless instance (MYFINANCE_AUTH_MODE=none). It holds no hash, so
     * it can never authenticate through the login endpoint — by construction, not by a check.
     */
    public static User passwordless(String email, String displayName) {
        return new User(normalizeEmail(email), null, displayName);
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

    /** Sets or replaces the password; takes the already-encoded hash, never the raw password. */
    public void changePasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }
}
