package com.myfinance.backend.dto;

/** How many transactions the backfill actually touched. */
public record MerchantBackfillResponse(int updated) {}
