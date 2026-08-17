package com.myfinance.backend.repository;

import com.myfinance.backend.model.Budget;
import jakarta.persistence.criteria.JoinType;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;

/**
 * Composable filters for {@code GET /api/budgets}. The profile filter is always applied first;
 * the optional query parameters are added on top with {@code Specification.and}.
 */
public final class BudgetSpecifications {

    private BudgetSpecifications() {
    }

    /** Scopes to one profile and fetch-joins the category so the list can be mapped without N+1 selects. */
    public static Specification<Budget> inProfile(Long profileId) {
        return (root, query, cb) -> {
            // Fetch joins are illegal in the count query Spring Data builds for pagination.
            if (query.getResultType() != Long.class) {
                root.fetch("category", JoinType.INNER);
            }
            return cb.equal(root.get("profile").get("id"), profileId);
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
