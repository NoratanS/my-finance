package com.myfinance.backend.config;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.deser.jdk.NumberDeserializers;
import tools.jackson.databind.deser.std.StdDeserializer;

import java.math.BigDecimal;

/**
 * Rejects a {@link BigDecimal} sent as a JSON number instead of a string (docs/API.md "Money").
 * A JSON number is an IEEE-754 double in every JavaScript client, so by the time a value like
 * {@code 0.1 + 0.2} is serialized it may already be {@code 0.30000000000000004} — accepting the
 * number here would make the API complicit in precision the client already lost. Only the token
 * type is checked; the actual parsing for a string token is delegated to Jackson's own
 * {@code BigDecimal} deserializer so malformed numeric text still gets Jackson's usual handling.
 */
class StrictStringBigDecimalDeserializer extends StdDeserializer<BigDecimal> {

    private final ValueDeserializer<?> delegate = NumberDeserializers.find(BigDecimal.class);

    StrictStringBigDecimalDeserializer() {
        super(BigDecimal.class);
    }

    @Override
    public BigDecimal deserialize(JsonParser p, DeserializationContext ctxt) {
        if (p.currentToken() != JsonToken.VALUE_STRING) {
            return ctxt.reportInputMismatch(this,
                    "Amounts must be sent as a JSON string (e.g. \"12.34\"), not a number.");
        }
        return (BigDecimal) delegate.deserialize(p, ctxt);
    }
}
