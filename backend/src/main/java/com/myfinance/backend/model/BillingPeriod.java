package com.myfinance.backend.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * How often a subscription bills. The period owns its arithmetic so the charge job and the
 * dashboard can never disagree: {@link #advance} steps a billing date by one period
 * ({@code LocalDate.plusMonths} clamps month ends — Jan 31 + 1 month = Feb 28/29, matching
 * Postgres {@code DATE + INTERVAL}, docs/SCHEMA.md "Charge posting"), and {@link #monthlyAmount}
 * normalizes a per-period amount to a monthly cost (docs/SCHEMA.md "subscription").
 */
public enum BillingPeriod {

    WEEKLY {
        @Override
        public LocalDate advance(LocalDate date) {
            return date.plusWeeks(1);
        }

        @Override
        LocalDate advanceBy(LocalDate date, long periods) {
            return date.plusWeeks(periods);
        }

        @Override
        long wholePeriodsBetween(LocalDate from, LocalDate to) {
            return ChronoUnit.WEEKS.between(from, to);
        }

        @Override
        public BigDecimal monthlyAmount(BigDecimal amount) {
            // 52 weeks per year, spread over 12 months.
            return amount.multiply(FIFTY_TWO).divide(TWELVE, Money.SCALE, RoundingMode.HALF_UP);
        }

        @Override
        public BigDecimal annualAmount(BigDecimal amount) {
            // Same 52-weeks/year convention as monthlyAmount above (not the astronomical
            // 52.18) — multiplying by a whole number never needs rounding.
            return amount.multiply(FIFTY_TWO);
        }
    },

    MONTHLY {
        @Override
        public LocalDate advance(LocalDate date) {
            return date.plusMonths(1);
        }

        @Override
        LocalDate advanceBy(LocalDate date, long periods) {
            return date.plusMonths(periods);
        }

        @Override
        long wholePeriodsBetween(LocalDate from, LocalDate to) {
            return ChronoUnit.MONTHS.between(from, to);
        }

        @Override
        public BigDecimal monthlyAmount(BigDecimal amount) {
            return amount;
        }

        @Override
        public BigDecimal annualAmount(BigDecimal amount) {
            return amount.multiply(TWELVE);
        }
    },

    QUARTERLY {
        @Override
        public LocalDate advance(LocalDate date) {
            return date.plusMonths(3);
        }

        @Override
        LocalDate advanceBy(LocalDate date, long periods) {
            return date.plusMonths(3 * periods);
        }

        @Override
        long wholePeriodsBetween(LocalDate from, LocalDate to) {
            return ChronoUnit.MONTHS.between(from, to) / 3;
        }

        @Override
        public BigDecimal monthlyAmount(BigDecimal amount) {
            return amount.divide(THREE, Money.SCALE, RoundingMode.HALF_UP);
        }

        @Override
        public BigDecimal annualAmount(BigDecimal amount) {
            return amount.multiply(FOUR);
        }
    },

    YEARLY {
        @Override
        public LocalDate advance(LocalDate date) {
            return date.plusYears(1);
        }

        @Override
        LocalDate advanceBy(LocalDate date, long periods) {
            return date.plusYears(periods);
        }

        @Override
        long wholePeriodsBetween(LocalDate from, LocalDate to) {
            return ChronoUnit.YEARS.between(from, to);
        }

        @Override
        public BigDecimal monthlyAmount(BigDecimal amount) {
            return amount.divide(TWELVE, Money.SCALE, RoundingMode.HALF_UP);
        }

        @Override
        public BigDecimal annualAmount(BigDecimal amount) {
            return amount;
        }
    };

    private static final BigDecimal THREE = BigDecimal.valueOf(3);
    private static final BigDecimal FOUR = BigDecimal.valueOf(4);
    private static final BigDecimal TWELVE = BigDecimal.valueOf(12);
    private static final BigDecimal FIFTY_TWO = BigDecimal.valueOf(52);

    /**
     * Single steps after which month-end clamping can never happen again: every cadence has
     * visited its shortest month by then (24 monthly steps span two consecutive Februaries, at
     * least one of which is non-leap), so from that point on the day-of-cycle is stable and a
     * bulk {@link #advanceBy} jump is exactly equivalent to repeated {@link #advance} calls.
     */
    private static final int CLAMP_STABILIZING_STEPS = 24;

    /** The billing date one period after {@code date}. */
    public abstract LocalDate advance(LocalDate date);

    /** {@code advance} applied {@code periods} times in one arithmetic jump (no clamping drift). */
    abstract LocalDate advanceBy(LocalDate date, long periods);

    /** Whole periods from {@code from} to {@code to} (floor), per {@link ChronoUnit#between}. */
    abstract long wholePeriodsBetween(LocalDate from, LocalDate to);

    /**
     * Advances {@code date} by whole periods to the first date on or after {@code target},
     * preserving the billing cadence (a monthly charge on the 3rd stays on the 3rd). Used when
     * restoring a backup: an ACTIVE subscription with a past {@code nextBillingOn} must resume
     * on schedule instead of being treated as overdue by the charge job, which would duplicate
     * charges the backup already contains (docs/API.md "POST /api/backup/restore").
     */
    public LocalDate advanceToAtLeast(LocalDate date, LocalDate target) {
        // O(1) even for an ancient date (a restored file may carry one): a bulk jump straight
        // from the original date could disagree with repeated advance() around month ends
        // (Jan 31 + 2 x 1 month = Mar 28, but Jan 31 + 2 months = Mar 31), so step singly
        // until clamping is settled, then jump the remaining whole periods at once.
        for (int i = 0; i < CLAMP_STABILIZING_STEPS && date.isBefore(target); i++) {
            date = advance(date);
        }
        if (date.isBefore(target)) {
            long wholePeriods = wholePeriodsBetween(date, target);
            if (wholePeriods > 0) {
                date = advanceBy(date, wholePeriods);
            }
            while (date.isBefore(target)) {
                date = advance(date);
            }
        }
        return date;
    }

    /** The per-period {@code amount} normalized to a monthly cost, scale 4, HALF_UP. */
    public abstract BigDecimal monthlyAmount(BigDecimal amount);

    /**
     * The per-period {@code amount} normalized to a yearly cost, computed directly from
     * {@code amount} (whole-number multiplier: x1/x4/x12/x52) rather than derived from
     * {@link #monthlyAmount}, so it never compounds that method's rounding (docs/API.md
     * "GET /api/subscriptions/dashboard", D1). Always exact — multiplying a scale-4 amount by
     * a whole number never needs rounding.
     */
    public abstract BigDecimal annualAmount(BigDecimal amount);
}
