package com.myfinance.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Subscription;

/**
 * One entry of the dashboard's {@code upcoming} (and {@code overdue}, where {@code daysUntil}
 * is negative) lists — docs/API.md "GET /api/subscriptions/dashboard".
 */
public record UpcomingRenewal(
        Long id,
        String name,
        CategoryRef category,
        BigDecimal amount,
        String currency,
        BillingPeriod billingPeriod,
        LocalDate nextBillingOn,
        long daysUntil) {

    public static UpcomingRenewal from(Subscription subscription, LocalDate asOf) {
        return new UpcomingRenewal(
                subscription.getId(),
                subscription.getName(),
                CategoryRef.from(subscription.getCategory()),
                subscription.getAmount(),
                subscription.getCurrency(),
                subscription.getBillingPeriod(),
                subscription.getNextBillingOn(),
                ChronoUnit.DAYS.between(asOf, subscription.getNextBillingOn()));
    }
}
