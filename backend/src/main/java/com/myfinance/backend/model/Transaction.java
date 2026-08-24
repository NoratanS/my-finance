package com.myfinance.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;

import java.math.BigDecimal;
import java.sql.Types;
import java.time.LocalDate;

/** A single expense or income. Table is {@code txn} because {@code transaction} is reserved in Postgres. */
@Entity
@Table(name = "txn")
public class Transaction extends AuditedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal amount;

    @JdbcTypeCode(Types.CHAR)
    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "txn_type", nullable = false)
    private TransactionType type;

    @Column(name = "occurred_on", nullable = false)
    private LocalDate occurredOn;

    private String description;

    protected Transaction() {
        // JPA
    }

    public Transaction(Profile profile, Category category, BigDecimal amount, String currency,
                       TransactionType type, LocalDate occurredOn, String description) {
        this.profile = profile;
        update(category, amount, currency, type, occurredOn, description);
    }

    /** Full replacement of the editable fields (PUT semantics — see docs/API.md). */
    public void update(Category category, BigDecimal amount, String currency,
                       TransactionType type, LocalDate occurredOn, String description) {
        this.category = category;
        this.amount = Money.normalize(amount);
        this.currency = currency;
        this.type = type;
        this.occurredOn = occurredOn;
        this.description = description;
    }

    public Profile getProfile() {
        return profile;
    }

    public Category getCategory() {
        return category;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public TransactionType getType() {
        return type;
    }

    public LocalDate getOccurredOn() {
        return occurredOn;
    }

    public String getDescription() {
        return description;
    }
}
