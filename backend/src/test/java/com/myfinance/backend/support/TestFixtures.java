package com.myfinance.backend.support;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.security.AppUserDetails;
import com.myfinance.backend.security.SessionActiveProfile;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.security.crypto.password.PasswordEncoder;
import jakarta.servlet.http.Cookie;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.request.RequestPostProcessor;


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

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final CategoryRepository categoryRepository;
    private final PasswordEncoder passwordEncoder;

    public TestFixtures(UserRepository userRepository, ProfileRepository profileRepository,
                        CategoryRepository categoryRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.categoryRepository = categoryRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User user(String email) {
        return userRepository.save(new User(email.toLowerCase(), passwordEncoder.encode(DEFAULT_PASSWORD), "Test User"));
    }

    public Profile profile(User user, String name, String currency) {
        return profileRepository.save(new Profile(user, name, currency));
    }

    public Category category(Profile profile, Category parent, String name) {
        return categoryRepository.save(new Category(profile, parent, name));
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

    /** Authenticated as the profile's owner with {@code profile} active, CSRF token present. */
    public RequestPostProcessor in(Profile profile) {
        return request -> {
            request.getSession().setAttribute(SessionActiveProfile.SESSION_KEY, profile.getId());
            return as(profile.getUser()).postProcessRequest(request);
        };
    }
}
