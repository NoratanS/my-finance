package com.myfinance.backend.repository;

import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.Collection;

/**
 * Building blocks for the optional filters of {@code GET /api/transactions}. Each method returns
 * one predicate; the service combines them with {@link Specification#and}. The profile predicate
 * is not optional and must always be part of the final specification.
 */
public final class TransactionSpecifications {

    private TransactionSpecifications() {
    }

    public static Specification<Transaction> inProfile(Long profileId) {
        return (root, query, cb) -> cb.equal(root.get("profile").get("id"), profileId);
    }

    public static Specification<Transaction> occurredOnOrAfter(LocalDate from) {
        return (root, query, cb) -> cb.greaterThanOrEqualTo(root.get("occurredOn"), from);
    }

    public static Specification<Transaction> occurredOnOrBefore(LocalDate to) {
        return (root, query, cb) -> cb.lessThanOrEqualTo(root.get("occurredOn"), to);
    }

    public static Specification<Transaction> inCategories(Collection<Long> categoryIds) {
        return (root, query, cb) -> root.get("category").get("id").in(categoryIds);
    }

    public static Specification<Transaction> ofType(TransactionType type) {
        return (root, query, cb) -> cb.equal(root.get("type"), type);
    }

    /**
     * Loads the category in the same SELECT so building responses does not issue one query per row.
     * Spring Data runs the same specification twice — once for the page and once for the count —
     * and a fetch join is illegal in the count query, so it is only added to the entity query.
     */
    public static Specification<Transaction> fetchCategory() {
        return (root, query, cb) -> {
            if (query.getResultType() != Long.class && query.getResultType() != long.class) {
                root.fetch("category");
            }
            return null;
        };
    }
}
