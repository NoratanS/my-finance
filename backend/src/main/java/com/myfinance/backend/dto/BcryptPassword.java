package com.myfinance.backend.dto;

import java.nio.charset.StandardCharsets;

import jakarta.validation.constraints.AssertTrue;

import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * A request body carrying a new password that will be BCrypt-hashed. Bean Validation and Jackson
 * both read annotations on interface methods, so every implementing record gets the rule below
 * without repeating it.
 */
public interface BcryptPassword {

    String password();

    /**
     * BCrypt only hashes the first 72 bytes of its input, and Spring's encoder rejects longer
     * passwords outright. {@code @Size} counts characters, so a 128-char emoji password would slip
     * through it; this rule counts bytes. Reported as field {@code passwordWithinBcryptLimit}.
     * True for a null password so a blank one yields a single {@code @NotBlank} error.
     */
    @JsonIgnore
    @AssertTrue(message = "must be at most 72 bytes in UTF-8")
    default boolean isPasswordWithinBcryptLimit() {
        String password = password();
        return password == null || password.getBytes(StandardCharsets.UTF_8).length <= 72;
    }
}
