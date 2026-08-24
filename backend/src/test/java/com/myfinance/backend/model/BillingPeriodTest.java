package com.myfinance.backend.model;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** The period owns its arithmetic — pure logic, so plain unit tests without any Spring context. */
class BillingPeriodTest {

    // ---- advance ----

    @Test
    void weeklyAdvancesSevenDays() {
        assertThat(BillingPeriod.WEEKLY.advance(LocalDate.of(2026, 8, 17)))
                .isEqualTo(LocalDate.of(2026, 8, 24));
    }

    @Test
    void monthlyAdvancesOneMonth() {
        assertThat(BillingPeriod.MONTHLY.advance(LocalDate.of(2026, 8, 3)))
                .isEqualTo(LocalDate.of(2026, 9, 3));
    }

    @Test
    void monthlyClampsAtMonthEnd() {
        // Jan 31 + 1 month = Feb 28 (2026 is not a leap year) — matches Postgres DATE + INTERVAL.
        assertThat(BillingPeriod.MONTHLY.advance(LocalDate.of(2026, 1, 31)))
                .isEqualTo(LocalDate.of(2026, 2, 28));
    }

    @Test
    void monthlyClampsAtMonthEndInLeapYear() {
        assertThat(BillingPeriod.MONTHLY.advance(LocalDate.of(2028, 1, 31)))
                .isEqualTo(LocalDate.of(2028, 2, 29));
    }

    @Test
    void chainedMonthlyAdvancesClampPermanently() {
        // Month-end anniversary drift, accepted by design (docs/SCHEMA.md "Charge posting"):
        // once clamped, the original day-of-month is lost — Jan 31 -> Feb 28 -> Mar 28, not Mar 31.
        LocalDate afterOne = BillingPeriod.MONTHLY.advance(LocalDate.of(2026, 1, 31));
        assertThat(afterOne).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(BillingPeriod.MONTHLY.advance(afterOne)).isEqualTo(LocalDate.of(2026, 3, 28));
    }

    @Test
    void quarterlyAdvancesThreeMonthsWithClamp() {
        assertThat(BillingPeriod.QUARTERLY.advance(LocalDate.of(2026, 11, 30)))
                .isEqualTo(LocalDate.of(2027, 2, 28));
    }

    @Test
    void yearlyAdvancesOneYearClampingLeapDay() {
        assertThat(BillingPeriod.YEARLY.advance(LocalDate.of(2028, 2, 29)))
                .isEqualTo(LocalDate.of(2029, 2, 28));
    }

    // ---- monthlyAmount ----

    @ParameterizedTest(name = "{0} {1} -> {2}")
    @CsvSource({
            // WEEKLY x 52 / 12
            "WEEKLY,    12.0000,  52.0000",
            "WEEKLY,    10.0000,  43.3333",   // 520/12 = 43.3333... rounds down
            "WEEKLY,     0.0100,   0.0433",   // scale stays 4
            // MONTHLY identity
            "MONTHLY,   43.0000,  43.0000",
            // QUARTERLY / 3
            "QUARTERLY, 30.0000,  10.0000",
            "QUARTERLY, 100.0000, 33.3333",
            "QUARTERLY, 0.0001,    0.0000",   // 0.0000333 rounds to 0 at scale 4
            // YEARLY / 12
            "YEARLY,    120.0000, 10.0000",
            "YEARLY,    100.0000,  8.3333",
            "YEARLY,    99.9999,   8.3333",   // 8.33333 HALF_UP at the 5th decimal -> .3333
    })
    void monthlyAmountNormalizesAtScale4HalfUp(BillingPeriod period, BigDecimal amount, BigDecimal expected) {
        assertThat(period.monthlyAmount(amount)).isEqualByComparingTo(expected);
        assertThat(period.monthlyAmount(amount).scale()).isEqualTo(4);
    }

    @Test
    void halfUpRoundsTheMidpointUp() {
        // 0.0050 / 12? Use a clean midpoint: 0.0600/12 = 0.005 -> but that's exact... take YEARLY 0.0006:
        // 0.0006/12 = 0.00005, midpoint at scale 4 -> HALF_UP gives 0.0001.
        assertThat(BillingPeriod.YEARLY.monthlyAmount(new BigDecimal("0.0006")))
                .isEqualByComparingTo(new BigDecimal("0.0001"));
    }
}
