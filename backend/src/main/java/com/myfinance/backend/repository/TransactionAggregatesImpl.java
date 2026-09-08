package com.myfinance.backend.repository;

import java.math.BigDecimal;
import java.util.List;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Root;

import org.springframework.data.jpa.domain.Specification;

import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;

/**
 * Criteria implementation of {@link TransactionAggregates}. Named {@code <Fragment>Impl} in the
 * repository package, which is how Spring Data finds a fragment implementation.
 * <p>
 * Every query selects a {@link Tuple} rather than a constructor expression: the mapping is then
 * explicit and cannot silently pick a different record constructor.
 */
class TransactionAggregatesImpl implements TransactionAggregates {

    private final EntityManager entityManager;

    TransactionAggregatesImpl(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public List<CurrencyTypeTotal> sumByCurrencyAndType(Specification<Transaction> spec) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        Root<Transaction> root = query.from(Transaction.class);
        Path<String> currency = root.get("currency");
        Path<TransactionType> type = root.get("type");

        query.multiselect(currency, type, cb.sum(root.get("amount")), cb.count(root))
                .where(spec.toPredicate(root, query, cb))
                .groupBy(currency, type)
                .orderBy(cb.asc(currency), cb.asc(type));

        return entityManager.createQuery(query).getResultList().stream()
                .map(row -> new CurrencyTypeTotal(
                        row.get(0, String.class),
                        row.get(1, TransactionType.class),
                        row.get(2, BigDecimal.class),
                        row.get(3, Long.class)))
                .toList();
    }

    @Override
    public List<CategoryCount> countByCategory(Specification<Transaction> spec) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        Root<Transaction> root = query.from(Transaction.class);
        Path<Long> categoryId = root.get("category").get("id");

        query.multiselect(categoryId, cb.count(root))
                .where(spec.toPredicate(root, query, cb))
                .groupBy(categoryId)
                .orderBy(cb.asc(categoryId));

        return entityManager.createQuery(query).getResultList().stream()
                .map(row -> new CategoryCount(row.get(0, Long.class), row.get(1, Long.class)))
                .toList();
    }

    @Override
    public List<CategoryCurrencyTotal> sumByCategoryAndCurrency(Specification<Transaction> spec) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        Root<Transaction> root = query.from(Transaction.class);
        Path<Long> categoryId = root.get("category").get("id");
        Path<String> currency = root.get("currency");

        query.multiselect(categoryId, currency, cb.sum(root.get("amount")))
                .where(spec.toPredicate(root, query, cb))
                .groupBy(categoryId, currency)
                .orderBy(cb.asc(categoryId), cb.asc(currency));

        return entityManager.createQuery(query).getResultList().stream()
                .map(row -> new CategoryCurrencyTotal(
                        row.get(0, Long.class), row.get(1, String.class), row.get(2, BigDecimal.class)))
                .toList();
    }
}
