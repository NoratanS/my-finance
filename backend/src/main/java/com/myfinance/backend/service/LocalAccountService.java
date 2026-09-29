package com.myfinance.backend.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;

/**
 * The single account a passwordless instance runs as (MYFINANCE_AUTH_MODE=none). No users means a
 * fresh install, so create one; exactly one means adopt it, whatever it is; more than one is
 * genuinely ambiguous — there is no way to pick whose data to serve without asking, and serving the
 * wrong person's finances is worse than refusing to start.
 */
@Service
public class LocalAccountService {

    public static final String LOCAL_EMAIL = "local@localhost";
    private static final String LOCAL_DISPLAY_NAME = "Local";

    private final UserRepository userRepository;

    public LocalAccountService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional
    public User resolveLocalAccount() {
        List<User> users = userRepository.findAll();
        if (users.size() > 1) {
            throw new IllegalStateException("MYFINANCE_AUTH_MODE=none needs exactly one account, but this "
                    + "database holds " + users.size() + ". Start with MYFINANCE_AUTH_MODE=password and remove "
                    + "the accounts you do not want, or point this instance at a different database.");
        }
        return users.isEmpty() ? userRepository.save(User.passwordless(LOCAL_EMAIL, LOCAL_DISPLAY_NAME)) : users.get(0);
    }
}
