package com.myfinance.backend.config;

import com.myfinance.backend.security.CsrfCookieFilter;
import com.myfinance.backend.security.ProblemDetailResponseWriter;
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
                                                   SecurityContextRepository securityContextRepository) throws Exception {
        http
                .securityContext(context -> context.securityContextRepository(securityContextRepository))
                .csrf(csrf -> csrf
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        // Plain (non-XOR) handler: the token is never rendered into HTML,
                        // so BREACH masking buys nothing and the header can carry the raw value.
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers("/error").permitAll()
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
