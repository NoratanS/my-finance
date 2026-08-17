package com.myfinance.backend.security;

import com.myfinance.backend.exception.NoActiveProfileException;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Stores the active profile id as an HTTP session attribute. Spring injects a
 * request-aware proxy for {@link HttpSession}, so this singleton is safe to use
 * from any request thread.
 */
@Component
public class SessionActiveProfile implements ActiveProfile {

    public static final String SESSION_KEY = "ACTIVE_PROFILE_ID";

    private final HttpSession session;

    public SessionActiveProfile(HttpSession session) {
        this.session = session;
    }

    @Override
    public Optional<Long> id() {
        return Optional.ofNullable((Long) session.getAttribute(SESSION_KEY));
    }

    @Override
    public Long requireId() {
        return id().orElseThrow(NoActiveProfileException::new);
    }

    @Override
    public void set(Long profileId) {
        session.setAttribute(SESSION_KEY, profileId);
    }

    @Override
    public void clear() {
        session.removeAttribute(SESSION_KEY);
    }
}
