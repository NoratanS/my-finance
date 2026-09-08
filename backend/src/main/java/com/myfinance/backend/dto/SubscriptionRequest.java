package com.myfinance.backend.dto;

import com.myfinance.backend.model.BillingPeriod;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Body of {@code POST /api/subscriptions} (docs/API.md "Subscriptions"). No {@code status} —
 * new subscriptions are always ACTIVE; status is changed with PUT ({@link UpdateSubscriptionRequest}).
 * {@code nextBillingOn} may be in the past: the next job run posts the missed charges.
 */
public record SubscriptionRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull Long categoryId,
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 15, fraction = 4)
        @Schema(type = "string", format = "decimal", example = "243.5000") BigDecimal amount,
        @NotBlank @Pattern(regexp = "^[A-Z]{3}$", message = "must be a 3-letter ISO 4217 code") String currency,
        @NotNull BillingPeriod billingPeriod,
        @NotNull LocalDate nextBillingOn,
        @Size(max = 500) String notes) {
}
