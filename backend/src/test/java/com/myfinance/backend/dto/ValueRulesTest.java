package com.myfinance.backend.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import org.hibernate.validator.HibernateValidator;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Pins the field violations — property and message — that the money amount, currency code and
 * category colour value rules produce on every request body that carries them. The 400
 * {@code validation-failed} body is a direct projection of these violations
 * ({@code GlobalExceptionHandler}), and the frontend shows the messages word for word, so a change
 * here is a wire change. Plain Bean Validation, no Spring context.
 * <p>
 * The validator's default locale is English: Hibernate Validator ships Polish messages, and a
 * machine whose default locale is Polish would otherwise produce them.
 */
class ValueRulesTest {

    private static final Validator VALIDATOR = Validation.byProvider(HibernateValidator.class)
            .configure()
            .defaultLocale(Locale.ENGLISH)
            .buildValidatorFactory()
            .getValidator();

    private static final String GREATER_THAN_ZERO = "must be greater than 0";
    private static final String OUT_OF_BOUNDS = "numeric value out of bounds (<15 digits>.<4 digits> expected)";
    private static final String NOT_NULL = "must not be null";
    private static final String NOT_BLANK = "must not be blank";
    private static final String CURRENCY_CODE = "must be a 3-letter ISO 4217 code";
    private static final String HEX_COLOR = "must be a lowercase hex color like #a4d9c6";

    private record Site(Class<?> body, String property) {
        @Override
        public String toString() {
            return body.getSimpleName() + "." + property;
        }
    }

    private static final Set<Site> MONEY_SITES = Set.of(
            new Site(TransactionRequest.class, "amount"),
            new Site(SubscriptionRequest.class, "amount"),
            new Site(UpdateSubscriptionRequest.class, "amount"),
            new Site(CreateBudgetRequest.class, "amountLimit"),
            new Site(UpdateBudgetRequest.class, "amountLimit"));

    private static final Set<Site> CURRENCY_SITES = Set.of(
            new Site(TransactionRequest.class, "currency"),
            new Site(SubscriptionRequest.class, "currency"),
            new Site(UpdateSubscriptionRequest.class, "currency"),
            new Site(CreateBudgetRequest.class, "currency"),
            new Site(UpdateBudgetRequest.class, "currency"),
            new Site(CreateProfileRequest.class, "defaultCurrency"));

    private static final Set<Site> COLOR_SITES =
            Set.of(new Site(CreateCategoryRequest.class, "color"), new Site(UpdateCategoryRequest.class, "color"));

    static Stream<Arguments> moneyAmounts() {
        return cases(
                MONEY_SITES,
                arguments("0", new BigDecimal("0"), Set.of(GREATER_THAN_ZERO)),
                arguments("-1", new BigDecimal("-1"), Set.of(GREATER_THAN_ZERO)),
                arguments("-1.00001", new BigDecimal("-1.00001"), Set.of(GREATER_THAN_ZERO, OUT_OF_BOUNDS)),
                arguments("five decimals", new BigDecimal("1.23456"), Set.of(OUT_OF_BOUNDS)),
                arguments("1.00000", new BigDecimal("1.00000"), Set.of(OUT_OF_BOUNDS)),
                arguments("sixteen integer digits", new BigDecimal("1234567890123456"), Set.of(OUT_OF_BOUNDS)),
                arguments("999999999999999.9999", new BigDecimal("999999999999999.9999"), Set.of()),
                arguments("0.0001", new BigDecimal("0.0001"), Set.of()),
                arguments("null", null, Set.of(NOT_NULL)));
    }

    static Stream<Arguments> currencyCodes() {
        return cases(
                CURRENCY_SITES,
                arguments("PLN", "PLN", Set.of()),
                arguments("pln", "pln", Set.of(CURRENCY_CODE)),
                arguments("PL", "PL", Set.of(CURRENCY_CODE)),
                arguments("PLNX", "PLNX", Set.of(CURRENCY_CODE)),
                arguments("empty", "", Set.of(NOT_BLANK, CURRENCY_CODE)),
                arguments("null", null, Set.of(NOT_BLANK)));
    }

    static Stream<Arguments> categoryColors() {
        return cases(
                COLOR_SITES,
                arguments("#a4d9c6", "#a4d9c6", Set.of()),
                arguments("#A4D9C6", "#A4D9C6", Set.of(HEX_COLOR)),
                arguments("a4d9c6", "a4d9c6", Set.of(HEX_COLOR)),
                arguments("#a4d", "#a4d", Set.of(HEX_COLOR)),
                arguments("null", null, Set.of()));
    }

    /** Every site crossed with every (label, value, expected messages) row. */
    private static Stream<Arguments> cases(Set<Site> sites, Arguments... rows) {
        return sites.stream()
                .flatMap(site -> Stream.of(rows).map(row -> {
                    Object[] values = row.get();
                    return arguments(site, values[0], values[1], values[2]);
                }));
    }

    @ParameterizedTest(name = "{0} = {1}")
    @MethodSource({"moneyAmounts", "currencyCodes", "categoryColors"})
    void valueRuleReportsExactlyTheseViolationsOnTheField(
            Site site, String label, Object value, Set<String> expectedMessages) {
        Set<String> violations = VALIDATOR.validateValue(site.body(), site.property(), value).stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .collect(Collectors.toSet());

        Set<String> expected = expectedMessages.stream()
                .map(message -> site.property() + ": " + message)
                .collect(Collectors.toSet());
        assertThat(violations).isEqualTo(expected);
    }
}
