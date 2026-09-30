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
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;

import com.myfinance.backend.model.Money;

/**
 * The money amount value rule: greater than 0, with at most {@link Money#INTEGER_DIGITS} integer and
 * {@link Money#SCALE} decimal digits — what {@code NUMERIC(19,4)} with {@code CHECK (> 0)} can hold
 * (docs/API.md "Money"). Trailing zeros count: {@code 1.00000} is rejected, because {@code @Digits}
 * counts a {@code BigDecimal}'s scale as written. {@code null} is valid; presence is stated on the
 * field ({@code @NotNull @MoneyAmount}), so the rule always reads "if present, it must look like
 * this".
 * <p>
 * A composed constraint: the built-ins below do the validating ({@code validatedBy = {}}), and each
 * reports its own violation on the annotated field — "must be greater than 0" and "numeric value out
 * of bounds (&lt;15 digits&gt;.&lt;4 digits&gt; expected)", possibly both. That is the 400 body the
 * API has always returned, so this annotation deliberately has no {@code @ReportAsSingleViolation}
 * (which would replace both with {@link #message()}, never shown today) and no
 * {@code @OverridesAttribute} (springdoc ignores an overridden built-in when it writes the OpenAPI
 * document). Adding either is a wire change.
 */
@DecimalMin(value = "0", inclusive = false)
@Digits(integer = Money.INTEGER_DIGITS, fraction = Money.SCALE)
@Constraint(validatedBy = {})
@Target({METHOD, FIELD, ANNOTATION_TYPE, CONSTRUCTOR, PARAMETER, TYPE_USE})
@Retention(RUNTIME)
@Documented
public @interface MoneyAmount {

    /** Never shown: the composing constraints report their own messages (see the class comment). */
    String message() default "must be a money amount";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
