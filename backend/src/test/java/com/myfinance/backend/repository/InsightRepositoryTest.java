package com.myfinance.backend.repository;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

import tools.jackson.databind.json.JsonMapper;

/** The JSONB round-trip and the four profile-scoped finders docs/API.md "Insights" needs. */
@IntegrationTest
class InsightRepositoryTest {

    private static final String PLAN = """
            {"version": 1, "metric": "spend", "filters": {}, "groupBy": null,
             "interval": "month", "range": {"type": "lastMonths", "n": 12}}
            """;

    @Autowired
    private InsightRepository insightRepository;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private JsonMapper jsonMapper;

    private Profile profile;
    private Profile otherProfile;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");

        User other = fixtures.user("other@example.com");
        otherProfile = fixtures.profile(other, "Other", "EUR");
    }

    @Test
    void storesAndReadsBackThePlanTree() {
        Insight saved = fixtures.insight(profile, "Groceries per month", PLAN, false);

        Insight loaded = insightRepository
                .findByIdAndProfileId(saved.getId(), profile.getId())
                .orElseThrow();

        assertThat(loaded.getPlan().path("metric").asString()).isEqualTo("spend");
        assertThat(loaded.getPlan().path("range").path("n").asInt()).isEqualTo(12);
        assertThat(loaded.getViz()).isNull();
        assertThat(loaded.isPinned()).isFalse();
    }

    @Test
    void storesTheVizOverrideWhenPresent() {
        Insight saved = insightRepository.save(new Insight(
                profile,
                "Chart override",
                jsonMapper.readTree(PLAN),
                jsonMapper.readTree("{\"chart\": \"bar\"}"),
                true));

        Insight loaded = insightRepository
                .findByIdAndProfileId(saved.getId(), profile.getId())
                .orElseThrow();

        assertThat(loaded.getViz().path("chart").asString()).isEqualTo("bar");
        assertThat(loaded.isPinned()).isTrue();
    }

    @Test
    void listsPinnedFirstThenByName() {
        fixtures.insight(profile, "Zebra spend", PLAN, false);
        fixtures.insight(profile, "Apple spend", PLAN, false);
        fixtures.insight(profile, "Pinned monthly", PLAN, true);

        assertThat(insightRepository.findByProfileIdOrderByPinnedDescNameAsc(profile.getId()))
                .extracting(Insight::getName)
                .containsExactly("Pinned monthly", "Apple spend", "Zebra spend");
    }

    @Test
    void neverReachesAnotherProfilesInsight() {
        Insight theirs = fixtures.insight(otherProfile, "Their spend", PLAN, false);

        assertThat(insightRepository.findByIdAndProfileId(theirs.getId(), profile.getId()))
                .isEmpty();
        assertThat(insightRepository.findByProfileIdOrderByPinnedDescNameAsc(profile.getId()))
                .isEmpty();
    }

    @Test
    void nameCollisionChecksAreScopedAndSkipTheRowItself() {
        Insight mine = fixtures.insight(profile, "Groceries per month", PLAN, false);

        assertThat(insightRepository.existsByProfileIdAndName(profile.getId(), "Groceries per month"))
                .isTrue();
        assertThat(insightRepository.existsByProfileIdAndName(otherProfile.getId(), "Groceries per month"))
                .isFalse();
        assertThat(insightRepository.existsByProfileIdAndNameAndIdNot(
                        profile.getId(), "Groceries per month", mine.getId()))
                .isFalse();
        assertThat(insightRepository.existsByProfileIdAndNameAndIdNot(
                        profile.getId(), "Groceries per month", mine.getId() + 1))
                .isTrue();
    }
}
