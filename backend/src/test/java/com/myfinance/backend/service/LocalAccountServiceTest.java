package com.myfinance.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/** The 0/1/&gt;1 rule for MYFINANCE_AUTH_MODE=none (ARCHITECTURE.md "Profiles and authentication"). */
@IntegrationTest
class LocalAccountServiceTest {

    @Autowired
    private LocalAccountService localAccountService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestFixtures fixtures;

    @Test
    void createsTheLocalAccountWhenThereAreNoUsers() {
        User resolved = localAccountService.resolveLocalAccount();

        assertThat(resolved.getEmail()).isEqualTo("local@localhost");
        assertThat(resolved.getDisplayName()).isEqualTo("Local");
        assertThat(resolved.getPasswordHash()).isNull();
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void adoptsTheSingleExistingAccountWhateverItIs() {
        User existing = fixtures.user("chris@example.com");

        User resolved = localAccountService.resolveLocalAccount();

        assertThat(resolved.getId()).isEqualTo(existing.getId());
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void isIdempotentAcrossRestarts() {
        Long first = localAccountService.resolveLocalAccount().getId();
        Long second = localAccountService.resolveLocalAccount().getId();

        assertThat(second).isEqualTo(first);
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void refusesWhenMoreThanOneAccountExists() {
        fixtures.user("chris@example.com");
        fixtures.user("someone@example.com");

        assertThatThrownBy(() -> localAccountService.resolveLocalAccount())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("2")
                .hasMessageContaining("MYFINANCE_AUTH_MODE");
    }
}
