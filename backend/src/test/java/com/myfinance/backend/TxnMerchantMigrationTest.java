package com.myfinance.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * V5__txn_merchant.sql (docs/SCHEMA.md "txn"): the column's shape, its length CHECK, and that the
 * analytics role can read it. The last one is asserted rather than assumed — whether a privilege
 * granted on a table follows a column added later is exactly the kind of thing to check once.
 */
@IntegrationTest
class TxnMerchantMigrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;
    private Category groceries;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("chris@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        groceries = fixtures.category(profile, null, "Groceries");
    }

    private void insertWithMerchant(String merchant) {
        jdbcTemplate.update("""
                INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on, merchant)
                VALUES (?, ?, 12.5000, 'PLN', 'EXPENSE', DATE '2026-07-21', ?)
                """, profile.getId(), groceries.getId(), merchant);
    }

    @Test
    void merchantIsANullableTextColumn() {
        Map<String, Object> column = jdbcTemplate.queryForMap("""
                SELECT data_type, is_nullable FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'txn' AND column_name = 'merchant'
                """);

        assertThat(column).containsEntry("data_type", "text").containsEntry("is_nullable", "YES");
    }

    @Test
    void merchantOfExactly100CharactersIsAccepted() {
        insertWithMerchant("L".repeat(100));

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM txn WHERE merchant IS NOT NULL", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void merchantOver100CharactersViolatesTheCheck() {
        assertThatThrownBy(() -> insertWithMerchant("L".repeat(101)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void analyticsRoleCanReadTheNewColumn() {
        Boolean granted = jdbcTemplate.queryForObject(
                "SELECT has_column_privilege('myfinance_ro', 'txn', 'merchant', 'SELECT')", Boolean.class);

        assertThat(granted).isTrue();
    }
}
