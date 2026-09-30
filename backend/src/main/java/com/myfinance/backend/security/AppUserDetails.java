package com.myfinance.backend.security;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import com.myfinance.backend.model.User;

/**
 * The authenticated principal. Carries the user id so services can scope by user
 * without a second lookup. There is exactly one kind of user (docs/SCHEMA.md), hence no roles.
 * <p>
 * {@link Serializable} because it lives in the {@code HttpSession} (session persistence across
 * restarts, or a session store, would otherwise fail). {@link CredentialsContainer} so that
 * {@code ProviderManager} can erase the password hash after a successful authentication —
 * the session then never holds it.
 */
public class AppUserDetails implements UserDetails, CredentialsContainer, Serializable {

    // Pinned to the value the JVM computes for the current field set (`serialver`), so adding
    // this line changes nothing for sessions already in the store. Without it the id is derived from
    // the class's shape, and the next added field would silently change it — turning every live
    // session into an InvalidClassException on read instead of a clean 401. Bump it deliberately
    // only when a change really is incompatible.
    @Serial
    private static final long serialVersionUID = 974983984786326538L;

    private final Long id;
    private final String email;
    private String passwordHash;

    public AppUserDetails(User user) {
        this.id = user.getId();
        this.email = user.getEmail();
        this.passwordHash = user.getPasswordHash();
    }

    public Long getId() {
        return id;
    }

    @Override
    public List<GrantedAuthority> getAuthorities() {
        return List.of();
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public void eraseCredentials() {
        this.passwordHash = null;
    }
}
