package com.myfinance.backend.model;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Money is stored as {@code NUMERIC(19,4)} and serialized at that scale ("34.9900"),
 * so every amount is normalized to scale 4 before it reaches an entity.
 * Inputs with more than 4 decimals are rejected by validation before they get here,
 * so the rounding mode never actually loses information.
 */
public final class Money {

    public static final int SCALE = 4;

    private Money() {
    }

    public static BigDecimal normalize(BigDecimal amount) {
        return amount.setScale(SCALE, RoundingMode.UNNECESSARY);
    }
}
