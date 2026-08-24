package com.myfinance.backend.security;

import java.util.Optional;

/**
 * The profile the current session is scoped to. It lives server-side (docs/API.md
 * "Active profile: server-side, never client-supplied"); the only writer is the
 * profile-switch endpoint, after verifying ownership.
 * <p>
 * An interface so services can be unit-tested with a stub instead of an HTTP session.
 */
public interface ActiveProfile {

    Optional<Long> id();

    /** The active profile id, or a 409 {@code no-active-profile} if none is selected. */
    Long requireId();

    void set(Long profileId);

    void clear();
}
