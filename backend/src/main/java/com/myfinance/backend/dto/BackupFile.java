package com.myfinance.backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * The backup file itself — response body of {@code POST /api/backup/export} and parsed upload of
 * {@code POST /api/backup/restore} (docs/API.md "Backup", {@code formatVersion} 1).
 * <p>
 * {@code ref}s are file-internal: the db ids at export time, used on restore only to stitch
 * {@code parentRef}/{@code categoryRef}/{@code subscriptionRef} back together. Enum and date
 * fields are deliberately plain {@code String}s: an unknown {@code billingPeriod} or a malformed
 * {@code occurredOn} must surface as a 422 problem pinpointing the entry, not as a 400 parse
 * failure of the whole file. Amounts stay {@link BigDecimal} so the global Jackson config
 * serializes them as plain decimal strings, exactly like every other endpoint.
 */
public record BackupFile(String app, Integer formatVersion, Instant exportedAt, List<ProfileData> profiles) {

    public static final String APP = "my-finance";
    public static final int FORMAT_VERSION = 1;

    /** One profile's domain data. No account data, no {@code createdAt} — see docs/API.md. */
    public record ProfileData(
            String name,
            String defaultCurrency,
            List<CategoryData> categories,
            List<SubscriptionData> subscriptions,
            List<TransactionData> transactions,
            List<BudgetData> budgets) {}

    /** Ordered so every {@code parentRef} points to an earlier element of the array. */
    public record CategoryData(
            Long ref,
            @Schema(nullable = true) Long parentRef,
            String name,
            @Schema(nullable = true) String color) {}

    public record SubscriptionData(
            Long ref,
            Long categoryRef,
            String name,
            BigDecimal amount,
            String currency,
            String billingPeriod,
            String nextBillingOn,
            String status,
            @Schema(nullable = true) String notes) {}

    public record TransactionData(
            Long categoryRef,
            @Schema(nullable = true) Long subscriptionRef,
            BigDecimal amount,
            String currency,
            String type,
            String occurredOn,
            @Schema(nullable = true) String description,
            @Schema(nullable = true) String merchant) {}

    public record BudgetData(
            Long categoryRef, BigDecimal amountLimit, String currency, String periodStart, String periodEnd) {}
}
