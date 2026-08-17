package com.myfinance.backend.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Body of {@code POST /api/budgets} (docs/API.md "Budgets"). */
public record CreateBudgetRequest(
        @NotNull Long categoryId,
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 15, fraction = 4) BigDecimal amountLimit,
        @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
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
