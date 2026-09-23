package com.myfinance.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * V6__nullable_password_hash.sql (docs/SCHEMA.md "app_user"): the passwordless local account needs a
 * row with no hash. The login assertion is the half that matters when an instance switches back to
 * password mode — an account that cannot prove a password must be a clean 401, not a 500.
 */
@IntegrationTest
class PasswordHashNullableMigrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void passwordHashIsNullable() {
        Boolean nullable = jdbcTemplate.queryForObject("""
                SELECT is_nullable = 'YES'
                  FROM information_schema.columns
                 WHERE table_name = 'app_user' AND column_name = 'password_hash'
                """, Boolean.class);
        assertThat(nullable).isTrue();
    }

    @Test
    void aPasswordlessAccountPersists() {
        User saved = userRepository.save(User.passwordless("local@localhost", "Local"));
        assertThat(userRepository.findById(saved.getId()).orElseThrow().getPasswordHash())
                .isNull();
    }

    @Test
    void aPasswordlessAccountCannotLogIn() throws Exception {
        userRepository.save(User.passwordless("local@localhost", "Local"));
        mockMvc.perform(post("/api/auth/login")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"local@localhost","password":"anything"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.type").value("/errors/bad-credentials"));
    }
}
