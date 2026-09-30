package com.myfinance.backend.dto;

import static java.lang.annotation.ElementType.ANNOTATION_TYPE;
import static java.lang.annotation.ElementType.CONSTRUCTOR;
import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.METHOD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.ElementType.TYPE_USE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraints.Pattern;

/**
 * The currency code value rule: three uppercase letters of an ISO 4217 code, mirroring the database
 * {@code CHECK} (docs/API.md "Money"). {@code null} is valid; presence is stated on the field
 * ({@code @NotBlank @CurrencyCode}). Backup restore reads {@link #REGEX} and {@link #MESSAGE} too.
 * <p>
 * A composed constraint: the {@code @Pattern} below does the validating and reports {@link #MESSAGE}
 * on the annotated field. No {@code @ReportAsSingleViolation} and no {@code @OverridesAttribute}, for
 * the reasons given on {@link MoneyAmount}.
 */
@Pattern(regexp = CurrencyCode.REGEX, message = CurrencyCode.MESSAGE)
@Constraint(validatedBy = {})
@Target({METHOD, FIELD, ANNOTATION_TYPE, CONSTRUCTOR, PARAMETER, TYPE_USE})
@Retention(RUNTIME)
@Documented
public @interface CurrencyCode {

    String REGEX = "^[A-Z]{3}$";

    String MESSAGE = "must be a 3-letter ISO 4217 code";

    /** Never shown: the composing {@code @Pattern} reports its own message. */
    String message() default MESSAGE;

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
