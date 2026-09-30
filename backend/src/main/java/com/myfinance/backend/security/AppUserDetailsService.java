package com.myfinance.backend.security;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;

/** Bridges Spring Security's login flow to the {@code app_user} table. */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public AppUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        // The stored form is normalized (docs/SCHEMA.md), so compare the typed email in that form.
        return userRepository
                .findByEmail(User.normalizeEmail(email))
                .map(AppUserDetails::new)
                .orElseThrow(() -> new UsernameNotFoundException("No user with email " + email));
    }
}
