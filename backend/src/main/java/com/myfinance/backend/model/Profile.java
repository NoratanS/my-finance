package com.myfinance.backend.model;

import java.sql.Types;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;

/** A fully separate set of financial data (e.g. "Personal", "Company"), with a name unique in the instance. */
@Entity
@Table(name = "profile")
public class Profile extends AuditedEntity {

    @Column(nullable = false)
    private String name;

    @JdbcTypeCode(Types.CHAR)
    @Column(name = "default_currency", nullable = false, length = 3)
    private String defaultCurrency;

    protected Profile() {
        // JPA
    }

    public Profile(String name, String defaultCurrency) {
        this.name = name;
        this.defaultCurrency = defaultCurrency;
    }

    public String getName() {
        return name;
    }

    public String getDefaultCurrency() {
        return defaultCurrency;
    }

    public void rename(String name) {
        this.name = name;
    }
}
