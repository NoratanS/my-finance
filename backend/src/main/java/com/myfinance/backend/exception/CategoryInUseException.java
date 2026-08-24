package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/** 409 — the API-level expression of {@code ON DELETE RESTRICT}; the counts let the UI offer a next step. */
public class CategoryInUseException extends ApiException {

    private final long childCategoryCount;
    private final long transactionCount;
    private final long budgetCount;
    private final long subscriptionCount;

    public CategoryInUseException(String categoryName, long childCategoryCount, long transactionCount,
                                  long budgetCount, long subscriptionCount) {
        super(HttpStatus.CONFLICT, "category-in-use", "Category is in use",
                "'" + categoryName + "' has " + childCategoryCount + " subcategories, " + transactionCount
                        + " transactions, " + budgetCount + " budgets and " + subscriptionCount
                        + " subscriptions. Reassign or delete them first.");
        this.childCategoryCount = childCategoryCount;
        this.transactionCount = transactionCount;
        this.budgetCount = budgetCount;
        this.subscriptionCount = subscriptionCount;
    }

    @Override
    protected void addExtensions(ProblemDetail problem) {
        problem.setProperty("childCategoryCount", childCategoryCount);
        problem.setProperty("transactionCount", transactionCount);
        problem.setProperty("budgetCount", budgetCount);
        problem.setProperty("subscriptionCount", subscriptionCount);
    }
}
