package com.myfinance.backend.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

import java.util.regex.Pattern;

/**
 * Body of {@code PATCH /api/categories/{id}}. All fields are optional, and for {@code parentId}
 * and {@code color} an explicit {@code null} ("move to root" / "clear back to inherit") must be
 * distinguishable from an absent field ("leave it alone"). A record cannot express that, so this
 * is a small mutable class: Jackson calls a setter for a field that is present in the JSON —
 * including when its value is {@code null} — and never calls it for a field that is missing, so
 * each setter records that it was invoked.
 * <p>
 * The "present-but-invalid" rules are Bean Validation constraints like on every other request
 * body; the {@code @AssertTrue} methods report as fields {@code anyFieldSet} / {@code nameValid}
 * / {@code colorValid}.
 */
public class UpdateCategoryRequest {

    private static final Pattern COLOR = Pattern.compile("^#[0-9a-f]{6}$");

    @Size(max = 100)
    private String name;
    private boolean nameSet;
    private Long parentId;
    private boolean parentIdSet;
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

    /** A {@code color} that is present must be a lowercase hex color; explicit {@code null} clears to inherit. */
    @JsonIgnore
    @AssertTrue(message = "must be a lowercase hex color like #a4d9c6")
    public boolean isColorValid() {
        return !colorSet || color == null || COLOR.matcher(color).matches();
    }
}
