package com.myfinance.backend.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

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
        public BigDecimal monthlyAmount(BigDecimal amount) {
            // 52 weeks per year, spread over 12 months.
            return amount.multiply(FIFTY_TWO).divide(TWELVE, Money.SCALE, RoundingMode.HALF_UP);
        }
    },

    MONTHLY {
        @Override
        public LocalDate advance(LocalDate date) {
            return date.plusMonths(1);
        }

        @Override
        public BigDecimal monthlyAmount(BigDecimal amount) {
            return amount;
        }
    },

    QUARTERLY {
        @Override
        public LocalDate advance(LocalDate date) {
            return date.plusMonths(3);
        }

        @Override
        public BigDecimal monthlyAmount(BigDecimal amount) {
            return amount.divide(THREE, Money.SCALE, RoundingMode.HALF_UP);
        }
    },

    YEARLY {
        @Override
        public LocalDate advance(LocalDate date) {
            return date.plusYears(1);
        }

        @Override
        public BigDecimal monthlyAmount(BigDecimal amount) {
            return amount.divide(TWELVE, Money.SCALE, RoundingMode.HALF_UP);
        }
    };

    private static final BigDecimal THREE = BigDecimal.valueOf(3);
    private static final BigDecimal TWELVE = BigDecimal.valueOf(12);
    private static final BigDecimal FIFTY_TWO = BigDecimal.valueOf(52);

    /** The billing date one period after {@code date}. */
    public abstract LocalDate advance(LocalDate date);

    /** The per-period {@code amount} normalized to a monthly cost, scale 4, HALF_UP. */
    public abstract BigDecimal monthlyAmount(BigDecimal amount);
}
