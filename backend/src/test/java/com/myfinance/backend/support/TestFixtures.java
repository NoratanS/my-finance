package com.myfinance.backend.support;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Budget;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.InsightRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.security.ActiveProfile;
import com.myfinance.backend.security.AppUserDetails;
import jakarta.servlet.http.Cookie;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Builds domain rows directly through repositories (bypassing HTTP) and produces MockMvc
 * post-processors that put a request "inside" a session: authenticated as a user, with an
 * active profile, and carrying a valid CSRF token.
 */
@TestComponent
public class TestFixtures {

    public static final String DEFAULT_PASSWORD = "correct-horse-battery";
    public static final String XSRF_COOKIE = "XSRF-TOKEN";
    public static final String XSRF_HEADER = "X-XSRF-TOKEN";
    private static final String CSRF_TOKEN = "test-csrf-token";
    // BCrypt is deliberately slow; hash the shared test password once per JVM, not once per user row.
    private static final String DEFAULT_PASSWORD_HASH = new BCryptPasswordEncoder().encode(DEFAULT_PASSWORD);

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final BudgetRepository budgetRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final InsightRepository insightRepository;
    private final JsonMapper jsonMapper;

    public TestFixtures(UserRepository userRepository, ProfileRepository profileRepository,
                        CategoryRepository categoryRepository, TransactionRepository transactionRepository,
                        BudgetRepository budgetRepository, SubscriptionRepository subscriptionRepository,
                        InsightRepository insightRepository, JsonMapper jsonMapper) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.categoryRepository = categoryRepository;
        this.transactionRepository = transactionRepository;
        this.budgetRepository = budgetRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.insightRepository = insightRepository;
        this.jsonMapper = jsonMapper;
    }

    public User user(String email) {
        return userRepository.save(new User(User.normalizeEmail(email), DEFAULT_PASSWORD_HASH, "Test User"));
    }

    public Profile profile(User user, String name, String currency) {
        return profileRepository.save(new Profile(user, name, currency));
    }

    public Category category(Profile profile, Category parent, String name) {
        return categoryRepository.save(new Category(profile, parent, name));
    }

    public Transaction transaction(Profile profile, Category category, String amount, String currency,
                                   TransactionType type, LocalDate occurredOn) {
        return transactionRepository.save(new Transaction(profile, category, new BigDecimal(amount), currency,
                type, occurredOn, null, null));
    }

    /**
     * Bulk-seeds {@code count} identical transactions in one batch. Aggregate tests have to cross the
     * 200-row page cap to be worth anything, and 200+ single saves per test is needlessly slow.
     */
    public List<Transaction> transactions(Profile profile, Category category, int count, String amount,
                                          String currency, TransactionType type, LocalDate occurredOn) {
        List<Transaction> rows = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            rows.add(new Transaction(profile, category, new BigDecimal(amount), currency, type, occurredOn, null, null));
        }
        return transactionRepository.saveAll(rows);
    }

    /** A transaction carrying a description and a merchant — the raw material of the backfill suggester. */
    public Transaction transaction(Profile profile, Category category, String amount, String currency,
                                   TransactionType type, LocalDate occurredOn, String description, String merchant) {
        return transactionRepository.save(new Transaction(profile, category, new BigDecimal(amount), currency,
                type, occurredOn, description, merchant));
    }

    public Budget budget(Profile profile, Category category, String amountLimit, String currency,
                         LocalDate start, LocalDate end) {
        return budgetRepository.save(new Budget(profile, category, new BigDecimal(amountLimit), currency, start, end));
    }

    /** An EXPENSE transaction linked to a subscription, shaped exactly as the charge job posts it. */
    public Transaction chargeTransaction(Profile profile, Category category, String amount, String currency,
                                         LocalDate occurredOn, Subscription subscription) {
        return transactionRepository.save(new Transaction(profile, category, new BigDecimal(amount), currency,
                TransactionType.EXPENSE, occurredOn, subscription.getName(), null, subscription));
    }

    /** New subscriptions are ACTIVE; pass a different {@code status} to save it paused/cancelled. */
    public Subscription subscription(Profile profile, Category category, String name, String amount, String currency,
                                     BillingPeriod period, LocalDate nextBillingOn, SubscriptionStatus status) {
        Subscription subscription = new Subscription(profile, category, name, new BigDecimal(amount), currency,
                period, nextBillingOn, null);
        if (status != SubscriptionStatus.ACTIVE) {
            subscription.update(category, name, new BigDecimal(amount), currency, period, nextBillingOn, status, null);
        }
        return subscriptionRepository.save(subscription);
    }

    /** {@code planJson} is the raw plan document, exactly as a client would post it. No viz override. */
    public Insight insight(Profile profile, String name, String planJson, boolean pinned) {
        return insightRepository.save(new Insight(profile, name, jsonMapper.readTree(planJson), null, pinned));
    }

    /** Authenticated as {@code user}, no active profile selected, CSRF token present. */
    public RequestPostProcessor as(User user) {
        return request -> withCsrf(
                SecurityMockMvcRequestPostProcessors.user(new AppUserDetails(user)).postProcessRequest(request));
    }

    /**
     * Does what the SPA does: sends the {@code XSRF-TOKEN} cookie back and echoes its value in the
     * {@code X-XSRF-TOKEN} header. (Spring Security's {@code csrf()} post-processor is avoided on
     * purpose — it swaps the application's token repository for a test one, which hides the real
     * cookie behavior from every later test in the same context.)
     */
    public static MockHttpServletRequest withCsrf(MockHttpServletRequest request) {
        request.setCookies(new Cookie(XSRF_COOKIE, CSRF_TOKEN));
        request.addHeader(XSRF_HEADER, CSRF_TOKEN);
        return request;
    }

    /** {@link #withCsrf} as a post-processor, for unauthenticated mutating requests (register, login). */
    public static RequestPostProcessor csrf() {
        return TestFixtures::withCsrf;
    }

    /** Authenticated as the profile's owner with {@code profile} active, CSRF token present. */
    public RequestPostProcessor in(Profile profile) {
        return request -> {
            request.getSession().setAttribute(ActiveProfile.SESSION_KEY, profile.getId());
            return as(profile.getUser()).postProcessRequest(request);
        };
    }
}
