package com.myfinance.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;

/**
 * A subscription as returned by every subscription endpoint (docs/API.md "Subscriptions").
 * {@code monthlyAmount} is the server-side normalization so every client sums the same numbers.
 */
public record SubscriptionResponse(
        Long id,
        String name,
        CategoryRef category,
        BigDecimal amount,
        String currency,
        BillingPeriod billingPeriod,
        LocalDate nextBillingOn,
        SubscriptionStatus status,
        String notes,
        BigDecimal monthlyAmount,
        OffsetDateTime createdAt) {

    public static SubscriptionResponse from(Subscription subscription) {
        return new SubscriptionResponse(
                subscription.getId(),
                subscription.getName(),
                CategoryRef.from(subscription.getCategory()),
                subscription.getAmount(),
                subscription.getCurrency(),
                subscription.getBillingPeriod(),
                subscription.getNextBillingOn(),
                subscription.getStatus(),
                subscription.getNotes(),
                subscription.monthlyAmount(),
                subscription.getCreatedAt());
    }
}
