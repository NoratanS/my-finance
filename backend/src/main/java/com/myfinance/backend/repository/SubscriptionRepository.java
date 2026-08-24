package com.myfinance.backend.repository;

import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Request-path queries are scoped by {@code profileId} like every other repository, so foreign
 * ids come back as 404. The one exception is {@link #findAllByStatusAndNextBillingOnLessThanEqual}:
 * the charge job is a system job that runs across <em>all</em> profiles on a schedule, not on a
 * request thread — there is no session and no active profile to scope by, and no client input
 * reaches it, so the profile-scoping security boundary does not apply (docs/SCHEMA.md "Charge posting").
 */
public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    Optional<Subscription> findByIdAndProfileId(Long id, Long profileId);

    boolean existsByProfileIdAndName(Long profileId, String name);

    /** The category-delete pre-check ({@code CategoryService.delete}) — mirrors the txn/budget counts. */
    long countByCategoryId(Long categoryId);

    /**
     * The list endpoint and the dashboard: pass one status or several (default is ACTIVE + PAUSED,
     * docs/API.md "GET /api/subscriptions"). One derived method covers both cases — with a single
     * optional filter, a Specification would be machinery for nothing.
     * The category is fetch-joined because every caller renders {@code {id, name}} refs.
     */
    @EntityGraph(attributePaths = "category")
    List<Subscription> findAllByProfileIdAndStatusInOrderByNextBillingOnAscIdAsc(
            Long profileId, Collection<SubscriptionStatus> statuses);

    /** Due subscriptions for the charge job — deliberately not profile-scoped, see the class Javadoc. */
    @EntityGraph(attributePaths = "category")
    List<Subscription> findAllByStatusAndNextBillingOnLessThanEqual(SubscriptionStatus status, LocalDate date);
}
