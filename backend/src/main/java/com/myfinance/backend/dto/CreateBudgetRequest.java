package com.myfinance.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import com.fasterxml.jackson.annotation.JsonIgnore;

/** Body of {@code POST /api/budgets} (docs/API.md "Budgets"). */
public record CreateBudgetRequest(
        @NotNull Long categoryId,
        @NotNull @MoneyAmount BigDecimal amountLimit,
        @NotBlank @CurrencyCode String currency,
        @NotNull LocalDate periodStart,
        @NotNull LocalDate periodEnd) {

    /**
     * Cross-field rule: the period must not end before it starts. Reported as field
     * {@code periodValid}. Skipped (true) when either date is missing so that only the
     * {@code @NotNull} violation is reported for that case.
     */
    @JsonIgnore
    @AssertTrue(message = "periodEnd must be on or after periodStart")
    public boolean isPeriodValid() {
        return periodStart == null || periodEnd == null || !periodEnd.isBefore(periodStart);
    }
}
