package com.myfinance.backend.repository;

import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.util.List;

/**
 * Grouped aggregates over transactions, computed in SQL rather than by summing a page of rows in
 * the client. Each method takes the very same {@link Specification} the list endpoint builds, so a
 * total can never cover a different set of rows than the list it sits above.
 * <p>
 * A Spring Data JPA repository fragment: {@link TransactionRepository} extends this interface and
 * Spring wires in {@code TransactionAggregatesImpl}. Derived queries and {@code @Query} cannot
 * express "group by, under a caller-supplied specification", so this is hand-written Criteria.
 */
public interface TransactionAggregates {

    /** One row per (currency, type) present in the match. */
    record CurrencyTypeTotal(String currency, TransactionType type, BigDecimal total, long count) {
    }

    /** One row per category that has any matching transaction filed directly on it. */
    record CategoryCount(Long categoryId, long count) {
    }

    /** One row per (category, currency) present in the match. */
    record CategoryCurrencyTotal(Long categoryId, String currency, BigDecimal total) {
    }

    List<CurrencyTypeTotal> sumByCurrencyAndType(Specification<Transaction> spec);

    List<CategoryCount> countByCategory(Specification<Transaction> spec);

    List<CategoryCurrencyTotal> sumByCategoryAndCurrency(Specification<Transaction> spec);
}
