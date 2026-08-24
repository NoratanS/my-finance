package com.myfinance.backend.dto;

import com.myfinance.backend.model.TransactionType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Body of {@code POST /api/transactions} and {@code PUT /api/transactions/{id}} (docs/API.md "Transactions"). */
public record TransactionRequest(
        @NotNull Long categoryId,
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 15, fraction = 4) BigDecimal amount,
        @NotBlank @Pattern(regexp = "^[A-Z]{3}$", message = "must be a 3-letter ISO 4217 code") String currency,
        @NotNull TransactionType type,
        @NotNull @PastOrPresent LocalDate occurredOn,
        @Size(max = 500) String description
) {
}
