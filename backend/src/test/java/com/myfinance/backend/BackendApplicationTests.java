package com.myfinance.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.myfinance.backend.support.IntegrationTest;

@IntegrationTest
class BackendApplicationTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void contextLoadsAndFlywayCreatesSchema() {
        List<String> tables = jdbcTemplate.queryForList("""
                SELECT table_name FROM information_schema.tables
                 WHERE table_schema = 'public'
                 ORDER BY table_name
                """, String.class);
        // The finance tables and Flyway's own history: nothing else lives in the database.
        assertThat(tables)
                .containsExactly(
                        "budget", "category", "flyway_schema_history", "insight", "profile", "subscription", "txn");
    }
}
