package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

public class BudgetExistsException extends ApiException {

    public BudgetExistsException() {
        super(HttpStatus.CONFLICT, "budget-exists", "Budget already exists",
                "A budget for this category and period already exists.");
    }
}
