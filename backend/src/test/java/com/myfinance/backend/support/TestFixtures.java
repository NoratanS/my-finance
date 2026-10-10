package com.myfinance.backend.support;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.test.context.TestComponent;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Budget;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.InsightRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.web.ActiveProfile;

import tools.jackson.databind.json.JsonMapper;

/**
 * Builds domain rows directly through repositories (bypassing HTTP) and produces the MockMvc
 * post-processors that say which profile a request names as active.
 */
@TestComponent
public class TestFixtures {

    private final ProfileRepository profileRepository;
    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final BudgetRepository budgetRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final InsightRepository insightRepository;
    private final JsonMapper jsonMapper;

    public TestFixtures(
            ProfileRepository profileRepository,
            CategoryRepository categoryRepository,
            TransactionRepository transactionRepository,
            BudgetRepository budgetRepository,
            SubscriptionRepository subscriptionRepository,
            InsightRepository insightRepository,
            JsonMapper jsonMapper) {
        this.profileRepository = profileRepository;
        this.categoryRepository = categoryRepository;
        this.transactionRepository = transactionRepository;
        this.budgetRepository = budgetRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.insightRepository = insightRepository;
        this.jsonMapper = jsonMapper;
    }

    /** Profile names are unique in the instance: two profiles in one test need two names. */
    public Profile profile(String name, String currency) {
        return profileRepository.save(new Profile(name, currency));
    }

    public Category category(Profile profile, Category parent, String name) {
        return categoryRepository.save(new Category(profile, parent, name));
    }

    public Transaction transaction(
            Profile profile,
            Category category,
            String amount,
            String currency,
            TransactionType type,
            LocalDate occurredOn) {
        return transactionRepository.save(
                new Transaction(profile, category, new BigDecimal(amount), currency, type, occurredOn, null, null));
    }

    /**
     * Bulk-seeds {@code count} identical transactions in one batch. Aggregate tests have to cross the
     * 200-row page cap to be worth anything, and 200+ single saves per test is needlessly slow.
     */
    public List<Transaction> transactions(
            Profile profile,
            Category category,
            int count,
            String amount,
            String currency,
            TransactionType type,
            LocalDate occurredOn) {
        List<Transaction> rows = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            rows.add(
                    new Transaction(profile, category, new BigDecimal(amount), currency, type, occurredOn, null, null));
        }
        return transactionRepository.saveAll(rows);
    }

    /** A transaction carrying a description and a merchant — the raw material of the backfill suggester. */
    public Transaction transaction(
            Profile profile,
            Category category,
            String amount,
            String currency,
            TransactionType type,
            LocalDate occurredOn,
            String description,
            String merchant) {
        return transactionRepository.save(new Transaction(
                profile, category, new BigDecimal(amount), currency, type, occurredOn, description, merchant));
    }

    public Budget budget(
            Profile profile, Category category, String amountLimit, String currency, LocalDate start, LocalDate end) {
        return budgetRepository.save(new Budget(profile, category, new BigDecimal(amountLimit), currency, start, end));
    }

    /** An EXPENSE transaction linked to a subscription, shaped exactly as the charge job posts it. */
    public Transaction chargeTransaction(
            Profile profile,
            Category category,
            String amount,
            String currency,
            LocalDate occurredOn,
            Subscription subscription) {
        return transactionRepository.save(new Transaction(
                profile,
                category,
                new BigDecimal(amount),
                currency,
                TransactionType.EXPENSE,
                occurredOn,
                subscription.getName(),
                null,
                subscription));
    }

    /** New subscriptions are ACTIVE; pass a different {@code status} to save it paused/cancelled. */
    public Subscription subscription(
            Profile profile,
            Category category,
            String name,
            String amount,
            String currency,
            BillingPeriod period,
            LocalDate nextBillingOn,
            SubscriptionStatus status) {
        Subscription subscription = new Subscription(
                profile, category, name, new BigDecimal(amount), currency, period, nextBillingOn, null);
        if (status != SubscriptionStatus.ACTIVE) {
            subscription.update(category, name, new BigDecimal(amount), currency, period, nextBillingOn, status, null);
        }
        return subscriptionRepository.save(subscription);
    }

    /** {@code planJson} is the raw plan document, exactly as a client would post it. No viz override. */
    public Insight insight(Profile profile, String name, String planJson, boolean pinned) {
        return insightRepository.save(new Insight(profile, name, jsonMapper.readTree(planJson), null, pinned));
    }

    /**
     * Names {@code profile} as the active profile, as the frontend does on every request once a
     * profile is chosen: its id in the {@code X-Profile-Id} header.
     */
    public RequestPostProcessor in(Profile profile) {
        return request -> {
            request.addHeader(ActiveProfile.HEADER, String.valueOf(profile.getId()));
            return request;
        };
    }

    /**
     * No profile is chosen: the header is sent empty, as the frontend does. For endpoints above
     * the profile boundary, and for proving that a profile-scoped one answers 409. Every request
     * that changes something needs at least this (docs/API.md "Active profile").
     */
    public RequestPostProcessor noProfile() {
        return request -> {
            request.addHeader(ActiveProfile.HEADER, "");
            return request;
        };
    }
}
