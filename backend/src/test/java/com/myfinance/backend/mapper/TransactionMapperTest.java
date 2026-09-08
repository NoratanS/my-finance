package com.myfinance.backend.mapper;

import com.myfinance.backend.dto.CategoryRef;
import com.myfinance.backend.dto.TransactionResponse;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit test of the generated {@link TransactionMapperImpl} — no Spring context needed for a
 * stateless mapper. Guards the one thing a hand-written {@code from(...)} could never get wrong by
 * accident but a generated mapper could: silently changing the scale of {@code amount}.
 */
class TransactionMapperTest {

    private final TransactionMapper mapper = new TransactionMapperImpl();
    private final Profile profile = new Profile(new User("a@b.c", "hash", "A"), "Personal", "USD");
    private final Category category = new Category(profile, null, "Groceries");

    @Test
    void toResponsePreservesMoneyScale() {
        Transaction transaction = new Transaction(profile, category, new BigDecimal("243.5"), "USD",
                TransactionType.EXPENSE, LocalDate.of(2026, 1, 15), "Corner shop", "Corner Shop");
        ReflectionTestUtils.setField(transaction, "id", 7L);

        TransactionResponse response = mapper.toResponse(transaction);

        assertThat(response.amount().scale()).isEqualTo(4);
        assertThat(response.amount().toPlainString()).isEqualTo("243.5000");
    }

    @Test
    void toResponseMapsEveryField() {
        Transaction transaction = new Transaction(profile, category, new BigDecimal("10.00"), "USD",
                TransactionType.INCOME, LocalDate.of(2026, 2, 1), "Refund", "Some Store");
        ReflectionTestUtils.setField(transaction, "id", 9L);

        TransactionResponse response = mapper.toResponse(transaction);

        assertThat(response.id()).isEqualTo(9L);
        assertThat(response.category()).isEqualTo(CategoryRef.from(category));
        assertThat(response.currency()).isEqualTo("USD");
        assertThat(response.type()).isEqualTo(TransactionType.INCOME);
        assertThat(response.occurredOn()).isEqualTo(LocalDate.of(2026, 2, 1));
        assertThat(response.description()).isEqualTo("Refund");
        assertThat(response.merchant()).isEqualTo("Some Store");
        assertThat(response.subscriptionId()).isNull();
    }
}
