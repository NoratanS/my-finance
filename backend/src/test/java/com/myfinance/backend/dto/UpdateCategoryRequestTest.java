package com.myfinance.backend.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

/**
 * The present-vs-absent trick depends on Jackson calling the setters (or not), so the class is
 * exercised through real deserialization plus a real Bean Validation validator — no Spring context.
 */
class UpdateCategoryRequestTest {

    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private final Validator validator =
            Validation.buildDefaultValidatorFactory().getValidator();

    private UpdateCategoryRequest parse(String json) {
        return jsonMapper.readValue(json, UpdateCategoryRequest.class);
    }

    private static Set<String> violatedProperties(Set<ConstraintViolation<UpdateCategoryRequest>> violations) {
        return violations.stream()
                .map(v -> v.getPropertyPath().toString())
                .collect(java.util.stream.Collectors.toSet());
    }

    @Test
    void emptyBodyViolatesAnyFieldSet() {
        UpdateCategoryRequest request = parse("{}");

        assertThat(request.isNameSet()).isFalse();
        assertThat(request.isParentIdSet()).isFalse();
        assertThat(violatedProperties(validator.validate(request))).containsExactly("anyFieldSet");
    }

    @Test
    void blankNameViolatesNameValid() {
        UpdateCategoryRequest request = parse("{\"name\":\"\"}");

        assertThat(request.isNameSet()).isTrue();
        assertThat(violatedProperties(validator.validate(request))).containsExactly("nameValid");
    }

    @Test
    void explicitNullParentIdCountsAsSetAndIsValid() {
        UpdateCategoryRequest request = parse("{\"parentId\":null}");

        assertThat(request.isParentIdSet()).isTrue();
        assertThat(request.getParentId()).isNull();
        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void absentParentIdIsNotSet() {
        UpdateCategoryRequest request = parse("{\"name\":\"x\"}");

        assertThat(request.isParentIdSet()).isFalse();
        assertThat(request.isNameSet()).isTrue();
        assertThat(validator.validate(request)).isEmpty();
    }

    // ---- color (V2): same null-vs-absent trick ----

    @Test
    void colorAloneSatisfiesAnyFieldSet() {
        UpdateCategoryRequest request = parse("{\"color\":\"#a4d9c6\"}");

        assertThat(request.isColorSet()).isTrue();
        assertThat(request.getColor()).isEqualTo("#a4d9c6");
        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void explicitNullColorCountsAsSetAndIsValid() {
        UpdateCategoryRequest request = parse("{\"color\":null}");

        assertThat(request.isColorSet()).isTrue();
        assertThat(request.getColor()).isNull();
        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void absentColorIsNotSet() {
        UpdateCategoryRequest request = parse("{\"name\":\"x\"}");

        assertThat(request.isColorSet()).isFalse();
    }

    @Test
    void malformedColorViolatesColor() {
        // uppercase hex, missing '#', and wrong length are all rejected
        for (String bad : new String[] {"\"#A4D9C6\"", "\"a4d9c6\"", "\"#a4d\"", "\"red\""}) {
            UpdateCategoryRequest request = parse("{\"color\":" + bad + "}");
            assertThat(violatedProperties(validator.validate(request))).containsExactly("color");
        }
    }
}
