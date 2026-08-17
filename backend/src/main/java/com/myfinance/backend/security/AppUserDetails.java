package com.myfinance.backend.security;

import com.myfinance.backend.model.User;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.List;

/**
 * The authenticated principal. Carries the user id so services can scope by user
 * without a second lookup. There is exactly one kind of user (docs/SCHEMA.md), hence no roles.
 */
public class AppUserDetails implements UserDetails {

    private final Long id;
    private final String email;
    private final String passwordHash;

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
}
