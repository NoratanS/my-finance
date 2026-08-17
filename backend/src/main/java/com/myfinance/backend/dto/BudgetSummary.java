package com.myfinance.backend.dto;

import com.myfinance.backend.model.Budget;

import java.math.BigDecimal;
import java.time.LocalDate;

/** The {@code budget} object embedded in {@link BudgetStatusResponse} — no timestamps. */
public record BudgetSummary(
        Long id,
        CategoryRef category,
        BigDecimal amountLimit,
        String currency,
        LocalDate periodStart,
        LocalDate periodEnd) {

    public static BudgetSummary from(Budget budget) {
        return new BudgetSummary(budget.getId(), CategoryRef.from(budget.getCategory()), budget.getAmountLimit(),
                budget.getCurrency(), budget.getPeriodStart(), budget.getPeriodEnd());
    }
}
