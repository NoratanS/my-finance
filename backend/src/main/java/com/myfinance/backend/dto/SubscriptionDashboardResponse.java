package com.myfinance.backend.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Everything the subscription dashboard shows, in one round trip
 * (docs/API.md "GET /api/subscriptions/dashboard"). Only ACTIVE subscriptions count toward
 * totals and renewals; PAUSED ones appear only in {@code pausedCount}.
 */
public record SubscriptionDashboardResponse(
        LocalDate asOf,
        long activeCount,
        long pausedCount,
        List<CurrencyAmount> monthlyCost,
        List<CurrencyAmount> yearlyCost,
        List<CurrencyAmount> chargedThisMonth,
        List<CategoryMonthlyCost> byCategory,
        List<UpcomingRenewal> upcoming,
        List<UpcomingRenewal> overdue) {}
