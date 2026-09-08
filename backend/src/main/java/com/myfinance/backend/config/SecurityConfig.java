package com.myfinance.backend.config;

import com.myfinance.backend.security.CsrfCookieFilter;
import com.myfinance.backend.security.ProblemDetailResponseWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;

/**
 * Session-cookie authentication for a JSON API (docs/API.md "Cross-cutting decisions"):
 * <ul>
 *   <li>Login is a JSON endpoint in {@code AuthController} that authenticates through the
 *       {@link AuthenticationManager} and stores the result in the HTTP session via
 *       {@link SecurityContextRepository} — not Spring's HTML form login.</li>
 *   <li>CSRF is on. The token is issued in a readable {@code XSRF-TOKEN} cookie and must be
 *       echoed in an {@code X-XSRF-TOKEN} header on every mutating request; a missing or
 *       stale token is 403.</li>
 *   <li>Failures inside the filter chain (401/403) are written as Problem Details so the
 *       error shape is uniform end to end.</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, ProblemDetailResponseWriter problems,
                                                   SecurityContextRepository securityContextRepository,
                                                   @Value("${server.servlet.session.cookie.secure}") boolean secureCookies)
            throws Exception {
        // Both cookies (JSESSIONID and XSRF-TOKEN) follow SESSION_COOKIE_SECURE.
        CookieCsrfTokenRepository csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfTokenRepository.setCookieCustomizer(cookie -> cookie.secure(secureCookies));
        http
                .securityContext(context -> context.securityContextRepository(securityContextRepository))
                // JSON API: never redirect back to a saved request; also avoids creating a session
                // for every unauthenticated request just to remember it.
                .requestCache(cache -> cache.disable())
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository)
                        // Plain (non-XOR) handler: the token is never rendered into HTML,
                        // so BREACH masking buys nothing and the header can carry the raw value.
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers("/error").permitAll()
                        // docker-compose's healthcheck polls this anonymously (ARCHITECTURE.md §5);
                        // health, info and prometheus are the only actuator endpoints exposed
                        // (application.properties).
                        .requestMatchers("/actuator/health").permitAll()
                        // Scraped by Prometheus (deploy/observability/prometheus.yml) with no
                        // credentials. Safe to permit here: management.server.port (application.
                        // properties) puts actuator on a port docker-compose never publishes to the
                        // host, so this chain — which the management port's child context falls
                        // back to, having none of its own — is reachable only from inside the
                        // compose network. That port, not this rule, is the real boundary.
                        .requestMatchers("/actuator/prometheus").permitAll()
                        // springdoc's schema + Swagger UI (OpenApiConfig). /swagger-ui.html is the
                        // entry point (redirects to /swagger-ui/index.html) and needs its own rule —
                        // it isn't nested under /swagger-ui/**. Not published outside the compose
                        // network in the shipped stack — nginx proxies only /api (nginx.conf) and
                        // docker-compose.yml never publishes the backend's port; only the e2e overlay does.
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .anyRequest().authenticated())
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .deleteCookies("JSESSIONID")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, e) -> problems.write(response,
                                HttpStatus.UNAUTHORIZED, "unauthenticated", "Not authenticated",
                                "Log in with POST /api/auth/login first."))
                        .accessDeniedHandler((request, response, e) -> problems.write(response,
                                HttpStatus.FORBIDDEN, "forbidden", "Forbidden",
                                "The CSRF token is missing or invalid.")))
                // No HTTP Basic / form login: credentials only ever arrive as JSON at /api/auth/login.
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable());
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    /** Persists the security context in the HTTP session; the login endpoint saves into it explicitly. */
    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }
}
