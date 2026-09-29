package com.myfinance.backend.mapper;

import org.mapstruct.Mapper;

import com.myfinance.backend.dto.CategoryRef;
import com.myfinance.backend.dto.TransactionResponse;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Transaction;

/**
 * {@link Transaction} -> {@link TransactionResponse} (docs/API.md "Transactions"). Every target
 * property (including {@code subscriptionId}, sourced from {@link Transaction#getSubscriptionId()})
 * matches a source property by name, so MapStruct needs no explicit {@code @Mapping}; {@code amount}
 * is copied as-is, so the scale {@link com.myfinance.backend.model.Money#normalize} already applied
 * on write survives untouched. {@code category} still goes through {@link CategoryRef#from} — that
 * factory is shared with Budget and Subscription responses and is deliberately left alone (see the
 * conversion commit for why); the {@link #map(Category)} default method below just points MapStruct
 * at it for this one field.
 */
@Mapper(componentModel = "spring")
public interface TransactionMapper {

    TransactionResponse toResponse(Transaction transaction);

    default CategoryRef map(Category category) {
        return CategoryRef.from(category);
    }
}
