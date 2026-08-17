package com.myfinance.backend.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.myfinance.backend.model.Budget;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/** A budget as returned by create and list (docs/API.md "Budgets"). */
public record BudgetResponse(
        Long id,
        CategoryRef category,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal amountLimit,
        String currency,
        LocalDate periodStart,
        LocalDate periodEnd,
        OffsetDateTime createdAt) {

    public static BudgetResponse from(Budget budget) {
        return new BudgetResponse(budget.getId(), CategoryRef.from(budget.getCategory()), budget.getAmountLimit(),
                budget.getCurrency(), budget.getPeriodStart(), budget.getPeriodEnd(), budget.getCreatedAt());
    }
}
