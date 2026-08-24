package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/** 422 — moving a category under itself or one of its descendants. */
public class CategoryCycleException extends ApiException {

    public CategoryCycleException(String categoryName) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, "category-cycle", "Category cannot be moved under its own subtree",
                "'" + categoryName + "' cannot become a child of itself or of one of its subcategories.");
    }
}
