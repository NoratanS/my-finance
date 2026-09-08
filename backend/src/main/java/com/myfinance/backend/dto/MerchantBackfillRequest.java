package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of {@code POST /api/transactions/merchant-backfill} (docs/API.md "Transactions"). */
public record MerchantBackfillRequest(
        @NotBlank @Size(max = 500) String description,
        @NotBlank @Size(max = 100) String merchant) {}
