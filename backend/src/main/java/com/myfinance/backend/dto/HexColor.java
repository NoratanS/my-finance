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
 * The category colour value rule: a lowercase {@code #rrggbb}, mirroring the database {@code CHECK}
 * (docs/SCHEMA.md "category"). {@code null} is valid — for a category it means "inherit the nearest
 * ancestor's colour". Backup restore reads {@link #REGEX} and {@link #MESSAGE} too.
 * <p>
 * A composed constraint: the {@code @Pattern} below does the validating and reports {@link #MESSAGE}
 * on the annotated field. No {@code @ReportAsSingleViolation} and no {@code @OverridesAttribute}, for
 * the reasons given on {@link MoneyAmount}.
 */
@Pattern(regexp = HexColor.REGEX, message = HexColor.MESSAGE)
@Constraint(validatedBy = {})
@Target({METHOD, FIELD, ANNOTATION_TYPE, CONSTRUCTOR, PARAMETER, TYPE_USE})
@Retention(RUNTIME)
@Documented
public @interface HexColor {

    String REGEX = "^#[0-9a-f]{6}$";

    String MESSAGE = "must be a lowercase hex color like #a4d9c6";

    /** Never shown: the composing {@code @Pattern} reports its own message. */
    String message() default MESSAGE;

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
