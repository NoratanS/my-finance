package com.myfinance.backend;

import com.myfinance.backend.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class BackendApplicationTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void contextLoadsAndFlywayCreatesSchema() {
        Integer tables = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM information_schema.tables
                 WHERE table_schema = 'public'
                   AND table_name IN ('app_user', 'profile', 'category', 'txn', 'budget')
                """, Integer.class);
        assertThat(tables).isEqualTo(5);
    }
}
