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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
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
    // Raw type on purpose: the concrete SessionRepository<S> Spring wires up (RedisSessionRepository,
    // parameterized on its own package-private Session subclass) isn't nameable here, and every
    // method used below (createSession/save/findById) is declared on the S-erased Session bound.
    @SuppressWarnings("rawtypes")
    private final SessionRepository sessionRepository;
    private final CookieSerializer cookieSerializer;

    public TestFixtures(UserRepository userRepository, ProfileRepository profileRepository,
                        CategoryRepository categoryRepository, TransactionRepository transactionRepository,
                        BudgetRepository budgetRepository, SubscriptionRepository subscriptionRepository,
                        InsightRepository insightRepository, JsonMapper jsonMapper,
                        SessionRepository<?> sessionRepository, CookieSerializer cookieSerializer) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.categoryRepository = categoryRepository;
        this.transactionRepository = transactionRepository;
        this.budgetRepository = budgetRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.insightRepository = insightRepository;
        this.jsonMapper = jsonMapper;
        this.sessionRepository = sessionRepository;
        this.cookieSerializer = cookieSerializer;
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
     * cookie behavior from every later test in the same context.) Adds to, rather than replaces,
     * any cookies the request already carries (e.g. {@link #in}'s session cookie) —
     * {@code MockHttpServletRequest.setCookies} overwrites the whole array otherwise.
     */
    public static MockHttpServletRequest withCsrf(MockHttpServletRequest request) {
        Cookie[] existing = request.getCookies();
        Cookie xsrf = new Cookie(XSRF_COOKIE, CSRF_TOKEN);
        request.setCookies(existing == null ? new Cookie[] {xsrf} : append(existing, xsrf));
        request.addHeader(XSRF_HEADER, CSRF_TOKEN);
        return request;
    }

    private static Cookie[] append(Cookie[] cookies, Cookie extra) {
        Cookie[] merged = Arrays.copyOf(cookies, cookies.length + 1);
        merged[cookies.length] = extra;
        return merged;
    }

    /** {@link #withCsrf} as a post-processor, for unauthenticated mutating requests (register, login). */
    public static RequestPostProcessor csrf() {
        return TestFixtures::withCsrf;
    }

    /**
     * Authenticated as the profile's owner with {@code profile} active, CSRF token present.
     * <p>
     * The active-profile id has to live in a real, Redis-backed {@link Session} — not an
     * attribute set directly on the raw {@code MockHttpServletRequest} — because
     * {@code SessionRepositoryFilter} wraps the request before the app ever sees it and only
     * resolves sessions by the id carried in the session cookie. A session planted any other
     * way is invisible to it.
     */
    public RequestPostProcessor in(Profile profile) {
        return request -> {
            applySessionCookie(request, createSessionWithActiveProfile(profile.getId()));
            return as(profile.getUser()).postProcessRequest(request);
        };
    }

    /** Creates and saves a real session (via the injected {@link SessionRepository}) with the given active profile. */
    @SuppressWarnings("unchecked")
    public String createSessionWithActiveProfile(Long profileId) {
        Session session = sessionRepository.createSession();
        session.setAttribute(ActiveProfile.SESSION_KEY, profileId);
        sessionRepository.save(session);
        return session.getId();
    }

    /** The session Spring Session assigned {@code sessionId}, or {@code null} if it no longer exists. */
    public Session findSession(String sessionId) {
        return sessionRepository.findById(sessionId);
    }

    /** Sets the active-profile attribute on an already-existing session (e.g. one a test's own login helper created). */
    @SuppressWarnings("unchecked")
    public void setActiveProfile(String sessionId, Long profileId) {
        Session session = findSession(sessionId);
        session.setAttribute(ActiveProfile.SESSION_KEY, profileId);
        sessionRepository.save(session);
    }

    /**
     * Puts whatever cookie the app's actual, configured {@link CookieSerializer} would use to
     * carry {@code sessionId} onto {@code request} — via the serializer itself, not a
     * hand-rolled encoding, so this can't drift from how the real filter chain reads it back
     * (cookie name and value format are the serializer's business, not this test's).
     */
    public void applySessionCookie(MockHttpServletRequest request, String sessionId) {
        MockHttpServletResponse probe = new MockHttpServletResponse();
        cookieSerializer.writeCookieValue(new CookieSerializer.CookieValue(new MockHttpServletRequest(), probe, sessionId));
        for (Cookie cookie : probe.getCookies()) {
            Cookie[] existing = request.getCookies();
            request.setCookies(existing == null ? new Cookie[] {cookie} : append(existing, cookie));
        }
    }

    /** The raw session id carried by whatever cookies {@code response} set — the inverse of {@link #applySessionCookie}. */
    public String sessionIdFromResponse(MockHttpServletResponse response) {
        MockHttpServletRequest probe = new MockHttpServletRequest();
        probe.setCookies(response.getCookies());
        List<String> ids = cookieSerializer.readCookieValues(probe);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** {@link #applySessionCookie} as a post-processor, for carrying an existing session id on a MockMvc request. */
    public RequestPostProcessor withSession(String sessionId) {
        return request -> {
            applySessionCookie(request, sessionId);
            return request;
        };
    }
}
