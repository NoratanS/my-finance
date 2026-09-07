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

/**
 * A named recurring charge (docs/SCHEMA.md "subscription"). The daily charge job turns due
 * {@code ACTIVE} subscriptions into ordinary {@link Transaction} rows, linked back via
 * {@code txn.subscription_id}, so spending history and budgets stay complete.
 */
@Entity
@Table(name = "subscription")
public class Subscription extends AuditedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal amount;

    @JdbcTypeCode(Types.CHAR)
    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_period", nullable = false)
    private BillingPeriod billingPeriod;

    @Column(name = "next_billing_on", nullable = false)
    private LocalDate nextBillingOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SubscriptionStatus status;

    private String notes;

    protected Subscription() {
        // JPA
    }

    /** New subscriptions are always {@code ACTIVE} (docs/API.md "POST /api/subscriptions"). */
    public Subscription(Profile profile, Category category, String name, BigDecimal amount, String currency,
                        BillingPeriod billingPeriod, LocalDate nextBillingOn, String notes) {
        this.profile = profile;
        this.status = SubscriptionStatus.ACTIVE;
        update(category, name, amount, currency, billingPeriod, nextBillingOn, this.status, notes);
    }

    /** Full replacement of the editable fields, including status (PUT semantics — docs/API.md). */
    public void update(Category category, String name, BigDecimal amount, String currency,
                       BillingPeriod billingPeriod, LocalDate nextBillingOn, SubscriptionStatus status, String notes) {
        this.category = category;
        this.name = name;
        this.amount = Money.normalize(amount);
        this.currency = currency;
        this.billingPeriod = billingPeriod;
        this.nextBillingOn = nextBillingOn;
        this.status = status;
        this.notes = notes;
    }

    /** Steps {@code nextBillingOn} forward by one billing period — used by the charge job after posting. */
    public void advanceNextBillingOn() {
        this.nextBillingOn = billingPeriod.advance(nextBillingOn);
    }

    public Profile getProfile() {
        return profile;
    }

    public Category getCategory() {
        return category;
    }

    public String getName() {
        return name;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public BillingPeriod getBillingPeriod() {
        return billingPeriod;
    }

    public LocalDate getNextBillingOn() {
        return nextBillingOn;
    }

    public SubscriptionStatus getStatus() {
        return status;
    }

    public String getNotes() {
        return notes;
    }

    /** This subscription's cost normalized to a monthly figure (scale 4, HALF_UP). */
    public BigDecimal monthlyAmount() {
        return billingPeriod.monthlyAmount(amount);
    }

    /** This subscription's cost normalized to a yearly figure, computed directly (see
     * {@link BillingPeriod#annualAmount}) so it never compounds {@link #monthlyAmount}'s
     * rounding. */
    public BigDecimal annualAmount() {
        return billingPeriod.annualAmount(amount);
    }
}
