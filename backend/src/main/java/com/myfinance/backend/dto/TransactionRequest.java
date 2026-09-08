package com.myfinance.backend.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.myfinance.backend.model.TransactionType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;

/** Body of {@code POST /api/transactions} and {@code PUT /api/transactions/{id}} (docs/API.md "Transactions"). */
public record TransactionRequest(
        @NotNull Long categoryId,
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 15, fraction = 4)
        @Schema(type = "string", format = "decimal", example = "243.5000") BigDecimal amount,
        @NotBlank @Pattern(regexp = "^[A-Z]{3}$", message = "must be a 3-letter ISO 4217 code") String currency,
        @NotNull TransactionType type,
        @NotNull LocalDate occurredOn,
        @Size(max = 500) @Schema(nullable = true) String description,
        @Size(max = 100) @Schema(nullable = true) String merchant
) {

    /**
     * Future-dated entries are rejected, but the server does not know the client's timezone: when
     * it is still the 16th in UTC it is already the 17th in UTC+14, and a user there must be able
     * to enter "today". The latest calendar date anywhere on Earth is at most UTC date + 1, so that
     * is the bound. Reported as field {@code occurredOnNotInFuture}; true for null so a missing
     * date yields only the {@code @NotNull} error.
     */
    @JsonIgnore
    @AssertTrue(message = "must not be in the future")
    public boolean isOccurredOnNotInFuture() {
        return occurredOn == null || !occurredOn.isAfter(LocalDate.now(ZoneOffset.UTC).plusDays(1));
    }
}
