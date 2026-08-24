package com.myfinance.backend.repository;

import com.myfinance.backend.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TransactionRepository extends JpaRepository<Transaction, Long>, JpaSpecificationExecutor<Transaction> {

    Optional<Transaction> findByIdAndProfileId(Long id, Long profileId);

    long countByCategoryId(Long categoryId);

    /**
     * Expense totals per currency for a category subtree over an inclusive date range
     * (docs/SCHEMA.md query 1, grouped by currency as that section recommends).
     * Feeds the budget status endpoint.
     */
    @Query(value = """
            WITH RECURSIVE subtree AS (
                SELECT id FROM category WHERE id = :categoryId AND profile_id = :profileId
                UNION ALL
                SELECT c.id FROM category c JOIN subtree s ON c.parent_id = s.id
                 WHERE c.profile_id = :profileId
            )
            SELECT t.currency AS currency, SUM(t.amount) AS total
              FROM txn t
             WHERE t.profile_id = :profileId
               AND t.category_id IN (SELECT id FROM subtree)
               AND t.txn_type = 'EXPENSE'
               AND t.occurred_on BETWEEN :fromDate AND :toDate
             GROUP BY t.currency
            """, nativeQuery = true)
    List<CurrencyTotal> sumExpensesBySubtreeAndPeriod(@Param("profileId") Long profileId,
                                                      @Param("categoryId") Long categoryId,
                                                      @Param("fromDate") LocalDate fromDate,
                                                      @Param("toDate") LocalDate toDate);

    /**
     * Per-currency totals of subscription-posted expenses over an inclusive date range —
     * the dashboard's "charged this month" figure (docs/API.md "GET /api/subscriptions/dashboard").
     * Plain JPQL: no tree recursion involved, just "linked to any subscription".
     */
    @Query("""
            SELECT t.currency AS currency, SUM(t.amount) AS total
              FROM Transaction t
             WHERE t.profile.id = :profileId
               AND t.subscription IS NOT NULL
               AND t.type = com.myfinance.backend.model.TransactionType.EXPENSE
               AND t.occurredOn BETWEEN :fromDate AND :toDate
             GROUP BY t.currency
            """)
    List<CurrencyTotal> sumSubscriptionExpensesByPeriod(@Param("profileId") Long profileId,
                                                        @Param("fromDate") LocalDate fromDate,
                                                        @Param("toDate") LocalDate toDate);
}
