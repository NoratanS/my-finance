package com.myfinance.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.SubscriptionStatus;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Body of {@code PUT /api/subscriptions/{id}}: full replacement, i.e. {@link SubscriptionRequest}
 * plus a required {@code status} — this is how a subscription is paused, resumed or cancelled
 * (docs/API.md "PUT /api/subscriptions/{id}").
 */
public record UpdateSubscriptionRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull Long categoryId,
        @NotNull @MoneyAmount BigDecimal amount,
        @NotBlank @CurrencyCode String currency,
        @NotNull BillingPeriod billingPeriod,
        @NotNull LocalDate nextBillingOn,
        @NotNull SubscriptionStatus status,
        @Size(max = 500) @Schema(nullable = true) String notes) {}
