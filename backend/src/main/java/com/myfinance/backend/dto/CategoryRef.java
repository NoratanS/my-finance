package com.myfinance.backend.dto;

import com.myfinance.backend.model.Category;

/** The small inlined {@code {id, name}} category object used inside transaction and budget responses. */
public record CategoryRef(Long id, String name) {

    public static CategoryRef from(Category category) {
        return new CategoryRef(category.getId(), category.getName());
    }
}
