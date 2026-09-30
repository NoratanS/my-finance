package com.myfinance.backend.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Body of {@code PATCH /api/categories/{id}}. All fields are optional, and for {@code parentId}
 * and {@code color} an explicit {@code null} ("move to root" / "clear back to inherit") must be
 * distinguishable from an absent field ("leave it alone"). A record cannot express that, so this
 * is a small mutable class: Jackson calls a setter for a field that is present in the JSON —
 * including when its value is {@code null} — and never calls it for a field that is missing, so
 * each setter records that it was invoked.
 * <p>
 * The "present-but-invalid" rules are Bean Validation constraints like on every other request
 * body. A value-rule constraint accepts {@code null}, so {@code @HexColor} on the field accepts an
 * absent colour and an explicit {@code null} alike and checks a present one. The rules that depend
 * on which fields are present are {@code @AssertTrue} methods, reported as the pseudo-fields
 * {@code anyFieldSet} and {@code nameValid}.
 */
public class UpdateCategoryRequest {

    @Size(max = 100)
    private String name;

    private boolean nameSet;
    private Long parentId;
    private boolean parentIdSet;

    @HexColor
    private String color;

    private boolean colorSet;

    public String getName() {
        return name;
    }

    @JsonSetter("name")
    public void setName(String name) {
        this.name = name;
        this.nameSet = true;
    }

    /** True if {@code name} was present in the request body (even as {@code null}). */
    @Schema(hidden = true)
    public boolean isNameSet() {
        return nameSet;
    }

    @Schema(nullable = true)
    public Long getParentId() {
        return parentId;
    }

    @JsonSetter("parentId")
    public void setParentId(Long parentId) {
        this.parentId = parentId;
        this.parentIdSet = true;
    }

    /** True if {@code parentId} was present in the request body (even as {@code null}). */
    @Schema(hidden = true)
    public boolean isParentIdSet() {
        return parentIdSet;
    }

    @Schema(nullable = true)
    public String getColor() {
        return color;
    }

    @JsonSetter("color")
    public void setColor(String color) {
        this.color = color;
        this.colorSet = true;
    }

    /** True if {@code color} was present in the request body (even as {@code null}). */
    @Schema(hidden = true)
    public boolean isColorSet() {
        return colorSet;
    }

    @JsonIgnore
    @AssertTrue(message = "at least one of name, parentId or color must be supplied")
    public boolean isAnyFieldSet() {
        return nameSet || parentIdSet || colorSet;
    }

    /** A {@code name} that is present must be non-blank; an absent one is fine. */
    @JsonIgnore
    @AssertTrue(message = "must not be blank")
    public boolean isNameValid() {
        return !nameSet || (name != null && !name.isBlank());
    }
}
