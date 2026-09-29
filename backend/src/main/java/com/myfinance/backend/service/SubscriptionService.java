package com.myfinance.backend.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.myfinance.backend.dto.CategoryMonthlyCost;
import com.myfinance.backend.dto.CategoryRef;
import com.myfinance.backend.dto.CurrencyAmount;
import com.myfinance.backend.dto.SubscriptionDashboardResponse;
import com.myfinance.backend.dto.SubscriptionRequest;
import com.myfinance.backend.dto.SubscriptionResponse;
import com.myfinance.backend.dto.UpcomingRenewal;
import com.myfinance.backend.dto.UpdateSubscriptionRequest;
import com.myfinance.backend.exception.InvalidRequestException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.exception.SubscriptionNameTakenException;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Money;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.security.ActiveProfile;

/**
 * Subscriptions of the active profile (docs/API.md "Subscriptions"). Every repository call is
 * scoped by the session's profile id, so another profile's rows are simply not found.
 */
@Service
@Transactional(readOnly = true)
public class SubscriptionService {

    static final int DEFAULT_HORIZON_DAYS = 30;
    static final int MAX_HORIZON_DAYS = 365;

    /** The default list view: cancelled subscriptions are history and must be asked for explicitly. */
    private static final Set<SubscriptionStatus> DEFAULT_STATUSES =
            EnumSet.of(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED);

    private final SubscriptionRepository subscriptionRepository;
    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final ProfileRepository profileRepository;
    private final ActiveProfile activeProfile;
    private final Clock clock;

    public SubscriptionService(
            SubscriptionRepository subscriptionRepository,
            CategoryRepository categoryRepository,
            TransactionRepository transactionRepository,
            ProfileRepository profileRepository,
            ActiveProfile activeProfile,
            Clock clock) {
        this.subscriptionRepository = subscriptionRepository;
        this.categoryRepository = categoryRepository;
        this.transactionRepository = transactionRepository;
        this.profileRepository = profileRepository;
        this.activeProfile = activeProfile;
        this.clock = clock;
    }

    @Transactional
    public SubscriptionResponse create(SubscriptionRequest request) {
        Long profileId = activeProfile.requireId();
        Category category = requireCategory(request.categoryId(), profileId);
        // Check-then-insert; UNIQUE (profile_id, name) is the backstop for races.
        if (subscriptionRepository.existsByProfileIdAndName(profileId, request.name())) {
            throw new SubscriptionNameTakenException(request.name());
        }
        Profile profile = profileRepository.getReferenceById(profileId);
        Subscription subscription = subscriptionRepository.save(new Subscription(
                profile,
                category,
                request.name(),
                request.amount(),
                request.currency(),
                request.billingPeriod(),
                request.nextBillingOn(),
                request.notes()));
        return SubscriptionResponse.from(subscription);
    }

    public List<SubscriptionResponse> list(SubscriptionStatus status) {
        Long profileId = activeProfile.requireId();
        Set<SubscriptionStatus> statuses = status == null ? DEFAULT_STATUSES : Set.of(status);
        return subscriptionRepository
                .findAllByProfileIdAndStatusInOrderByNextBillingOnAscIdAsc(profileId, statuses)
                .stream()
                .map(SubscriptionResponse::from)
                .toList();
    }

    public SubscriptionResponse get(Long id) {
        return SubscriptionResponse.from(requireSubscription(id, activeProfile.requireId()));
    }

    @Transactional
    public SubscriptionResponse update(Long id, UpdateSubscriptionRequest request) {
        Long profileId = activeProfile.requireId();
        Subscription subscription = requireSubscription(id, profileId);
        Category category = requireCategory(request.categoryId(), profileId);
        // Renaming a subscription to its own current name is not a collision.
        if (!request.name().equals(subscription.getName())
                && subscriptionRepository.existsByProfileIdAndName(profileId, request.name())) {
            throw new SubscriptionNameTakenException(request.name());
        }
        subscription.update(
                category,
                request.name(),
                request.amount(),
                request.currency(),
                request.billingPeriod(),
                request.nextBillingOn(),
                request.status(),
                request.notes());
        // Managed entity: the change is flushed on commit, no explicit save() needed.
        return SubscriptionResponse.from(subscription);
    }

    @Transactional
    public void delete(Long id) {
        Subscription subscription = requireSubscription(id, activeProfile.requireId());
        // Linked transactions keep their history: txn.subscription_id is ON DELETE SET NULL.
        subscriptionRepository.delete(subscription);
    }

    public SubscriptionDashboardResponse dashboard(Integer horizonDays) {
        Long profileId = activeProfile.requireId();
        int horizon = horizonDays == null ? DEFAULT_HORIZON_DAYS : horizonDays;
        if (horizon < 1 || horizon > MAX_HORIZON_DAYS) {
            throw new InvalidRequestException("'horizonDays' must be between 1 and " + MAX_HORIZON_DAYS + ".");
        }
        LocalDate asOf = LocalDate.now(clock);

        // One query; already sorted nextBillingOn ASC, id ASC — the order upcoming/overdue need.
        List<Subscription> subscriptions =
                subscriptionRepository.findAllByProfileIdAndStatusInOrderByNextBillingOnAscIdAsc(
                        profileId, DEFAULT_STATUSES);
        List<Subscription> active = subscriptions.stream()
                .filter(s -> s.getStatus() == SubscriptionStatus.ACTIVE)
                .toList();
        long pausedCount = subscriptions.size() - active.size();

        // Per-currency monthly totals over ACTIVE, never mixed across currencies (no FX layer).
        Map<String, BigDecimal> monthlyByCurrency = new TreeMap<>();
        for (Subscription s : active) {
            monthlyByCurrency.merge(s.getCurrency(), s.monthlyAmount(), BigDecimal::add);
        }
        List<CurrencyAmount> monthlyCost = monthlyByCurrency.entrySet().stream()
                .map(e -> new CurrencyAmount(e.getKey(), e.getValue()))
                .toList();

        // Computed from each subscription's raw amount, not from monthlyCost x 12: multiplying
        // already-rounded monthly equivalents back up compounds their rounding (D1) — e.g. a
        // single YEARLY 100.00 sub would report 99.9996 instead of 100.0000.
        Map<String, BigDecimal> yearlyByCurrency = new TreeMap<>();
        for (Subscription s : active) {
            yearlyByCurrency.merge(s.getCurrency(), s.annualAmount(), BigDecimal::add);
        }
        List<CurrencyAmount> yearlyCost = yearlyByCurrency.entrySet().stream()
                .map(e -> new CurrencyAmount(e.getKey(), e.getValue()))
                .toList();

        List<CurrencyAmount> chargedThisMonth = transactionRepository
                .sumSubscriptionExpensesByPeriod(
                        profileId, asOf.withDayOfMonth(1), asOf.withDayOfMonth(asOf.lengthOfMonth()))
                .stream()
                .map(t -> new CurrencyAmount(t.getCurrency(), Money.normalize(t.getTotal())))
                .sorted(Comparator.comparing(CurrencyAmount::currency))
                .toList();

        // Group ACTIVE by category + currency; LinkedHashMap keeps insertion order stable pre-sort.
        Map<CategoryCurrency, BigDecimal> byCategoryCurrency = new LinkedHashMap<>();
        for (Subscription s : active) {
            byCategoryCurrency.merge(
                    new CategoryCurrency(CategoryRef.from(s.getCategory()), s.getCurrency()),
                    s.monthlyAmount(),
                    BigDecimal::add);
        }
        List<CategoryMonthlyCost> byCategory = byCategoryCurrency.entrySet().stream()
                .map(e -> new CategoryMonthlyCost(
                        e.getKey().category(), e.getKey().currency(), e.getValue()))
                .sorted(Comparator.comparing(CategoryMonthlyCost::monthlyAmount)
                        .reversed()
                        .thenComparing(c -> c.category().name())
                        .thenComparing(CategoryMonthlyCost::currency))
                .toList();

        LocalDate horizonEnd = asOf.plusDays(horizon);
        List<UpcomingRenewal> upcoming = active.stream()
                .filter(s -> !s.getNextBillingOn().isBefore(asOf)
                        && !s.getNextBillingOn().isAfter(horizonEnd))
                .map(s -> UpcomingRenewal.from(s, asOf))
                .toList();
        List<UpcomingRenewal> overdue = active.stream()
                .filter(s -> s.getNextBillingOn().isBefore(asOf))
                .map(s -> UpcomingRenewal.from(s, asOf))
                .toList();

        return new SubscriptionDashboardResponse(
                asOf,
                active.size(),
                pausedCount,
                monthlyCost,
                yearlyCost,
                chargedThisMonth,
                byCategory,
                upcoming,
                overdue);
    }

    private Subscription requireSubscription(Long id, Long profileId) {
        return subscriptionRepository
                .findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("subscription", id));
    }

    private Category requireCategory(Long id, Long profileId) {
        return categoryRepository
                .findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("category", id));
    }

    /** Grouping key for the by-category breakdown — records give equals/hashCode for free. */
    private record CategoryCurrency(CategoryRef category, String currency) {}
}
