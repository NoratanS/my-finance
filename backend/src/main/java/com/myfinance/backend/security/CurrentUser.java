package com.myfinance.backend.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/** Reads the authenticated user's id from the security context. */
@Component
public class CurrentUser {

    public Long id() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AppUserDetails details)) {
            throw new IllegalStateException("No authenticated user in the security context");
        }
        return details.getId();
    }
}
