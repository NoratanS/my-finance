package com.myfinance.backend.security;

import com.myfinance.backend.repository.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/** Bridges Spring Security's login flow to the {@code app_user} table. */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public AppUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        // Emails are normalized (lower-cased) by the service layer before they get here (docs/SCHEMA.md).
        return userRepository.findByEmail(email)
                .map(AppUserDetails::new)
                .orElseThrow(() -> new UsernameNotFoundException("No user with email " + email));
    }
}
