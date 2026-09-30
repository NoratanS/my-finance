package com.myfinance.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.myfinance.backend.model.BillingPeriod;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Body of {@code POST /api/subscriptions} (docs/API.md "Subscriptions"). No {@code status} —
 * new subscriptions are always ACTIVE; status is changed with PUT ({@link UpdateSubscriptionRequest}).
 * {@code nextBillingOn} may be in the past: the next job run posts the missed charges.
 */
public record SubscriptionRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull Long categoryId,
        @NotNull @MoneyAmount BigDecimal amount,
        @NotBlank @CurrencyCode String currency,
        @NotNull BillingPeriod billingPeriod,
        @NotNull LocalDate nextBillingOn,
        @Size(max = 500) @Schema(nullable = true) String notes) {}
