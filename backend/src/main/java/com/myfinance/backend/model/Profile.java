package com.myfinance.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;

import java.sql.Types;

/** A fully separate financial space owned by a user (e.g. "Personal", "Company"). */
@Entity
@Table(name = "profile")
public class Profile extends AuditedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String name;

    @JdbcTypeCode(Types.CHAR)
    @Column(name = "default_currency", nullable = false, length = 3)
    private String defaultCurrency;

    protected Profile() {
        // JPA
    }

    public Profile(User user, String name, String defaultCurrency) {
        this.user = user;
        this.name = name;
        this.defaultCurrency = defaultCurrency;
    }

    public User getUser() {
        return user;
    }

    public String getName() {
        return name;
    }

    public String getDefaultCurrency() {
        return defaultCurrency;
    }
}
