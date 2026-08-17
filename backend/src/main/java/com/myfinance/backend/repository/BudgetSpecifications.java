package com.myfinance.backend.repository;

import com.myfinance.backend.model.Budget;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;

/**
 * Composable filters for {@code GET /api/budgets}. The profile filter is always applied first;
 * the optional query parameters are added on top with {@code Specification.and}.
 */
public final class BudgetSpecifications {

    private BudgetSpecifications() {
    }

    public static Specification<Budget> inProfile(Long profileId) {
        return (root, query, cb) -> cb.equal(root.get("profile").get("id"), profileId);
    }

    /**
     * Fetch-joins the category so the list can be mapped without N+1 selects; skipped for count
     * queries, where a fetch join is illegal. Same shape as {@link TransactionSpecifications#fetchCategory()}.
     */
    public static Specification<Budget> fetchCategory() {
        return (root, query, cb) -> {
            if (query.getResultType() != Long.class && query.getResultType() != long.class) {
                root.fetch("category");
            }
            return null;
        };
    }

    /** Budgets whose inclusive period contains {@code date}. */
    public static Specification<Budget> activeOn(LocalDate date) {
        return (root, query, cb) -> cb.and(
                cb.lessThanOrEqualTo(root.get("periodStart"), date),
                cb.greaterThanOrEqualTo(root.get("periodEnd"), date));
    }

    public static Specification<Budget> forCategory(Long categoryId) {
        return (root, query, cb) -> cb.equal(root.get("category").get("id"), categoryId);
    }
}
