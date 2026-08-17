package com.myfinance.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;

import java.math.BigDecimal;
import java.sql.Types;
import java.time.LocalDate;

/** A spending limit for one category over one inclusive date range. */
@Entity
@Table(name = "budget")
public class Budget extends AuditedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(name = "amount_limit", nullable = false, precision = 19, scale = 4)
    private BigDecimal amountLimit;

    @JdbcTypeCode(Types.CHAR)
    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    /** Inclusive — a January budget ends on the 31st, not on Feb 1st. */
    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    protected Budget() {
        // JPA
    }

    public Budget(Profile profile, Category category, BigDecimal amountLimit, String currency,
                  LocalDate periodStart, LocalDate periodEnd) {
        this.profile = profile;
        this.category = category;
        this.amountLimit = Money.normalize(amountLimit);
        this.currency = currency;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
    }

    public Profile getProfile() {
        return profile;
    }

    public Category getCategory() {
        return category;
    }

    public BigDecimal getAmountLimit() {
        return amountLimit;
    }

    public String getCurrency() {
        return currency;
    }

    public LocalDate getPeriodStart() {
        return periodStart;
    }

    public LocalDate getPeriodEnd() {
        return periodEnd;
    }
}
