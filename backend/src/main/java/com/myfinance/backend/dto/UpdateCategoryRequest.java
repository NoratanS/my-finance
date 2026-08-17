package com.myfinance.backend.dto;

import com.fasterxml.jackson.annotation.JsonSetter;

/**
 * Body of {@code PATCH /api/categories/{id}}. Both fields are optional, and for {@code parentId}
 * an explicit {@code null} ("move to root") must be distinguishable from an absent field ("leave
 * it alone"). A record cannot express that, so this is a small mutable class: Jackson calls a
 * setter for a field that is present in the JSON — including when its value is {@code null} —
 * and never calls it for a field that is missing, so each setter records that it was invoked.
 */
public class UpdateCategoryRequest {

    private String name;
    private boolean nameSet;
    private Long parentId;
    private boolean parentIdSet;

    public String getName() {
        return name;
    }

    @JsonSetter("name")
    public void setName(String name) {
        this.name = name;
        this.nameSet = true;
    }

    /** True if {@code name} was present in the request body (even as {@code null}). */
    public boolean isNameSet() {
        return nameSet;
    }

    public Long getParentId() {
        return parentId;
    }

    @JsonSetter("parentId")
    public void setParentId(Long parentId) {
        this.parentId = parentId;
        this.parentIdSet = true;
    }

    /** True if {@code parentId} was present in the request body (even as {@code null}). */
    public boolean isParentIdSet() {
        return parentIdSet;
    }
}
