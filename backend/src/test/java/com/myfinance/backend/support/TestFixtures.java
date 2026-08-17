package com.myfinance.backend.support;

import com.myfinance.backend.model.Budget;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.ProfileRepository;
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

import java.math.BigDecimal;
import java.time.LocalDate;

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

    public TestFixtures(UserRepository userRepository, ProfileRepository profileRepository,
                        CategoryRepository categoryRepository, TransactionRepository transactionRepository,
                        BudgetRepository budgetRepository) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.categoryRepository = categoryRepository;
        this.transactionRepository = transactionRepository;
        this.budgetRepository = budgetRepository;
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
        return transactionRepository.save(
                new Transaction(profile, category, new BigDecimal(amount), currency, type, occurredOn, null));
    }

    public Budget budget(Profile profile, Category category, String amountLimit, String currency,
                         LocalDate start, LocalDate end) {
        return budgetRepository.save(new Budget(profile, category, new BigDecimal(amountLimit), currency, start, end));
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
