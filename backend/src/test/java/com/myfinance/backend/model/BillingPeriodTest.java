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

    // ---- advanceToAtLeast ----

    @Test
    void advanceToAtLeastLeavesADateAlreadyOnOrAfterTheTargetUnchanged() {
        assertThat(BillingPeriod.MONTHLY.advanceToAtLeast(LocalDate.of(2026, 9, 3), LocalDate.of(2026, 8, 25)))
                .isEqualTo(LocalDate.of(2026, 9, 3));
        assertThat(BillingPeriod.MONTHLY.advanceToAtLeast(LocalDate.of(2026, 8, 25), LocalDate.of(2026, 8, 25)))
                .isEqualTo(LocalDate.of(2026, 8, 25));
    }

    @Test
    void advanceToAtLeastStepsWholePeriodsPreservingTheCadence() {
        // A monthly charge on the 3rd stays on the 3rd (docs/API.md "POST /api/backup/restore").
        assertThat(BillingPeriod.MONTHLY.advanceToAtLeast(LocalDate.of(2026, 6, 3), LocalDate.of(2026, 8, 25)))
                .isEqualTo(LocalDate.of(2026, 9, 3));
        assertThat(BillingPeriod.WEEKLY.advanceToAtLeast(LocalDate.of(2026, 8, 10), LocalDate.of(2026, 8, 25)))
                .isEqualTo(LocalDate.of(2026, 8, 31));
        assertThat(BillingPeriod.YEARLY.advanceToAtLeast(LocalDate.of(2024, 1, 15), LocalDate.of(2026, 8, 25)))
                .isEqualTo(LocalDate.of(2027, 1, 15));
    }

    @Test
    void advanceToAtLeastFromYearOneMatchesSteppingOnePeriodAtATime() {
        // Same results as the naive one-step-at-a-time loop (verified by brute force), but
        // computed arithmetically — a restored file may carry an arbitrarily old date.
        LocalDate target = LocalDate.of(2026, 8, 25);
        assertThat(BillingPeriod.WEEKLY.advanceToAtLeast(LocalDate.of(1, 1, 1), target))
                .isEqualTo(LocalDate.of(2026, 8, 31));
        // Year 1 is not a leap year, so Jan 31 clamps to Feb 28 on the first step and the
        // cadence stays on the 28th forever — exactly what repeated plusMonths does.
        assertThat(BillingPeriod.MONTHLY.advanceToAtLeast(LocalDate.of(1, 1, 31), target))
                .isEqualTo(LocalDate.of(2026, 8, 28));
        // Quarterly from Jan 31 never visits February (Jan/Apr/Jul/Oct), so it clamps to
        // the 30th (April) and stays there.
        assertThat(BillingPeriod.QUARTERLY.advanceToAtLeast(LocalDate.of(1, 1, 31), target))
                .isEqualTo(LocalDate.of(2026, 10, 30));
        // Leap day clamps to Feb 28 on the first yearly step and never recovers.
        assertThat(BillingPeriod.YEARLY.advanceToAtLeast(LocalDate.of(4, 2, 29), target))
                .isEqualTo(LocalDate.of(2027, 2, 28));
    }

    @Test
    void advanceToAtLeastPreservesMonthEndClampingOfTheSteppedPath() {
        // 2020 is a leap year: Jan 31 -> Feb 29 -> Mar 29 (day 29 survives the leap February).
        assertThat(BillingPeriod.MONTHLY.advanceToAtLeast(LocalDate.of(2020, 1, 31), LocalDate.of(2020, 3, 15)))
                .isEqualTo(LocalDate.of(2020, 3, 29));
        // Over a longer run the first non-leap February (2021) clamps the day to 28 for good.
        assertThat(BillingPeriod.MONTHLY.advanceToAtLeast(LocalDate.of(2020, 1, 31), LocalDate.of(2026, 8, 25)))
                .isEqualTo(LocalDate.of(2026, 8, 28));
    }

    @Test
    void advanceToAtLeastFromTheMinimumLocalDateReturnsPromptly() {
        // The DoS case: stepping ~5e10 weeks one at a time would pin the CPU for hours.
        // The result is fully determined: the first date on or after the target that is a
        // whole number of weeks from the start (same day-of-week).
        LocalDate start = LocalDate.parse("-999999999-01-01");
        LocalDate target = LocalDate.of(2026, 8, 25);
        LocalDate result = BillingPeriod.WEEKLY.advanceToAtLeast(start, target);
        assertThat(result).isAfterOrEqualTo(target).isBefore(target.plusWeeks(1));
        assertThat((result.toEpochDay() - start.toEpochDay()) % 7).isZero();
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

    // ---- annualAmount ----

    @ParameterizedTest(name = "{0} {1} -> {2}")
    @CsvSource({
            // YEARLY identity -- no division, so no rounding trap (D1: 100.00 must stay 100.0000,
            // not the 99.9996 that monthlyAmount x 12 produces).
            "YEARLY,    100.0000, 100.0000",
            // WEEKLY x 52 -- the same 52-weeks/year convention as monthlyAmount, not the
            // astronomical 52.18.
            "WEEKLY,     10.0000, 520.0000",
            // QUARTERLY x 4
            "QUARTERLY, 100.0000, 400.0000",
            // MONTHLY x 12
            "MONTHLY,    43.0000, 516.0000",
    })
    void annualAmountIsComputedExactlyFromTheRawAmount(BillingPeriod period, BigDecimal amount, BigDecimal expected) {
        assertThat(period.annualAmount(amount)).isEqualByComparingTo(expected);
        assertThat(period.annualAmount(amount).scale()).isEqualTo(4);
    }
}
