package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

public class CategoryNameTakenException extends ApiException {

    public CategoryNameTakenException(String name) {
        super(HttpStatus.CONFLICT, "category-name-taken", "Category name already used",
                "A sibling category named '" + name + "' already exists.");
    }
}
