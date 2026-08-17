package com.myfinance.backend.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.nio.charset.StandardCharsets;

public record RegisterRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 12, max = 128) String password,
        @NotBlank @Size(max = 100) String displayName) {

    /**
     * BCrypt only hashes the first 72 bytes of its input, and Spring's encoder rejects longer
     * passwords outright. {@code @Size} counts characters, so a 128-char emoji password would slip
     * through it; this rule counts bytes. Reported as field {@code passwordWithinBcryptLimit}.
     * True for a null password so a blank one yields a single {@code @NotBlank} error.
     */
    @JsonIgnore
    @AssertTrue(message = "must be at most 72 bytes in UTF-8")
    public boolean isPasswordWithinBcryptLimit() {
        return password == null || password.getBytes(StandardCharsets.UTF_8).length <= 72;
    }
}
