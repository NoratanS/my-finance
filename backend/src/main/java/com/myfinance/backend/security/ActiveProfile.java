package com.myfinance.backend.security;

import com.myfinance.backend.exception.NoActiveProfileException;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * The profile the current session is scoped to, stored as an HTTP session attribute. It lives
 * server-side (docs/API.md "Active profile: server-side, never client-supplied"); the only writer
 * is the profile-switch endpoint, after verifying ownership.
 * <p>
 * Spring injects a request-aware proxy for {@link HttpSession}, so this singleton is safe to use
 * from any request thread.
 */
@Component
public class ActiveProfile {

    public static final String SESSION_KEY = "ACTIVE_PROFILE_ID";

    private final HttpSession session;

    public ActiveProfile(HttpSession session) {
        this.session = session;
    }

    public Optional<Long> id() {
        return Optional.ofNullable((Long) session.getAttribute(SESSION_KEY));
    }

    /** The active profile id, or a 409 {@code no-active-profile} if none is selected. */
    public Long requireId() {
        return id().orElseThrow(NoActiveProfileException::new);
    }

    public void set(Long profileId) {
        session.setAttribute(SESSION_KEY, profileId);
    }

    public void clear() {
        session.removeAttribute(SESSION_KEY);
    }
}
