package com.myfinance.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.myfinance.backend.support.IntegrationTest;

/**
 * V7__session_store.sql (docs/SCHEMA.md "Session store"): V4's default privileges would give the
 * read-only analytics role SELECT on every table a later migration creates, and a session id is a
 * bearer credential. Enumerated by name pattern, so a session table added without a revoke fails
 * too; {@code has_any_column_privilege} also catches a column-level grant, which
 * {@code has_table_privilege} would miss.
 */
@IntegrationTest
class SessionStoreMigrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void analyticsRoleCannotReadAnySessionTable() {
        List<String> sessionTables = jdbcTemplate.queryForList("""
                SELECT table_name FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                   AND table_name LIKE 'spring\\_session%'
                """, String.class);
        assertThat(sessionTables).as("session tables in schema public").isNotEmpty();

        for (String table : sessionTables) {
            Boolean readable = jdbcTemplate.queryForObject(
                    "SELECT has_any_column_privilege('myfinance_ro', ?, 'SELECT')", Boolean.class, table);
            assertThat(readable).as("myfinance_ro can SELECT from %s", table).isFalse();
        }
    }
}
