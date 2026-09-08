package com.myfinance.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * What V4__insights.sql must guarantee, asserted at the SQL level — before any entity exists to
 * map it (docs/SCHEMA.md "insight" and "The read-only analytics role").
 */
@IntegrationTest
class InsightSchemaTest {

    private static final String INSERT = "INSERT INTO insight (profile_id, name, plan) VALUES (?, ?, ?::jsonb)";
    private static final String PLAN = "{\"version\": 1, \"metric\": \"spend\"}";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TestFixtures fixtures;

    private Long profileId() {
        User user = fixtures.user("kasia@example.com");
        Profile profile = fixtures.profile(user, "Personal", "PLN");
        return profile.getId();
    }

    @Test
    void planIsStoredAsQueryableJsonb() {
        Long profileId = profileId();

        jdbcTemplate.update(INSERT, profileId, "Groceries per month", PLAN);

        String metric = jdbcTemplate.queryForObject(
                "SELECT plan ->> 'metric' FROM insight WHERE profile_id = ?", String.class, profileId);
        assertThat(metric).isEqualTo("spend");
    }

    @Test
    void pinnedDefaultsToFalseAndVizIsOptional() {
        jdbcTemplate.update(INSERT, profileId(), "Groceries per month", PLAN);

        assertThat(jdbcTemplate.queryForObject("SELECT pinned FROM insight", Boolean.class))
                .isFalse();
        assertThat(jdbcTemplate.queryForObject("SELECT viz FROM insight", String.class))
                .isNull();
    }

    @Test
    void nameIsUniquePerProfile() {
        Long profileId = profileId();
        jdbcTemplate.update(INSERT, profileId, "Groceries per month", PLAN);

        assertThatThrownBy(() -> jdbcTemplate.update(INSERT, profileId, "Groceries per month", PLAN))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void nameOver100CharactersIsRejected() {
        Long profileId = profileId();

        assertThatThrownBy(() -> jdbcTemplate.update(INSERT, profileId, "x".repeat(101), PLAN))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletingAProfileCascadesToItsInsights() {
        Long profileId = profileId();
        jdbcTemplate.update(INSERT, profileId, "Groceries per month", PLAN);

        jdbcTemplate.update("DELETE FROM profile WHERE id = ?", profileId);

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM insight", Integer.class))
                .isZero();
    }

    @Test
    void analyticsRoleCanLoginAndReadButNotWrite() {
        assertThat(jdbcTemplate.queryForObject(
                        "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'myfinance_ro'", Boolean.class))
                .isTrue();
        assertThat(jdbcTemplate.queryForObject(
                        "SELECT has_table_privilege('myfinance_ro', 'txn', 'SELECT')", Boolean.class))
                .isTrue();
        assertThat(jdbcTemplate.queryForObject(
                        "SELECT has_table_privilege('myfinance_ro', 'txn', 'INSERT')", Boolean.class))
                .isFalse();
        assertThat(jdbcTemplate.queryForObject(
                        "SELECT has_table_privilege('myfinance_ro', 'insight', 'SELECT')", Boolean.class))
                .isTrue();
    }

    @Test
    void analyticsRoleAlsoSeesTablesCreatedByLaterMigrations() {
        // ALTER DEFAULT PRIVILEGES only covers objects created by the role that ran it; the
        // migration user is also the user every future migration runs as, so this must hold.
        jdbcTemplate.execute("CREATE TABLE later_migration_table (id BIGINT)");
        Boolean granted = jdbcTemplate.queryForObject(
                "SELECT has_table_privilege('myfinance_ro', 'later_migration_table', 'SELECT')", Boolean.class);
        jdbcTemplate.execute("DROP TABLE later_migration_table");

        assertThat(granted).isTrue();
    }
}
