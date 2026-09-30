package com.myfinance.backend.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.myfinance.backend.dto.InsightRequest;
import com.myfinance.backend.dto.InsightResponse;
import com.myfinance.backend.exception.InsightNameTakenException;
import com.myfinance.backend.exception.InvalidPlanException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.InsightRepository;
import com.myfinance.backend.security.ActiveProfile;

import tools.jackson.databind.JsonNode;

/**
 * Saved insights of the active profile (docs/API.md "Insights"). Every repository call is scoped
 * by the session's profile id, so another profile's rows are simply not found.
 */
@Service
@Transactional(readOnly = true)
public class InsightService {

    private final InsightRepository insightRepository;
    private final ActiveProfile activeProfile;
    private final AnalyticsClient analyticsClient;

    public InsightService(
            InsightRepository insightRepository, ActiveProfile activeProfile, AnalyticsClient analyticsClient) {
        this.insightRepository = insightRepository;
        this.activeProfile = activeProfile;
        this.analyticsClient = analyticsClient;
    }

    @Transactional
    public InsightResponse create(InsightRequest request) {
        Profile profile = activeProfile.require();
        requirePlanObject(request.plan());
        // Check-then-insert; UNIQUE (profile_id, name) is the backstop for races.
        if (insightRepository.existsByProfileIdAndName(profile.getId(), request.name())) {
            throw new InsightNameTakenException(request.name());
        }
        Insight insight = insightRepository.save(
                new Insight(profile, request.name(), request.plan(), request.viz(), request.pinned()));
        return InsightResponse.from(insight);
    }

    public List<InsightResponse> list() {
        return insightRepository.findByProfileIdOrderByPinnedDescNameAsc(activeProfile.requireId()).stream()
                .map(InsightResponse::from)
                .toList();
    }

    public InsightResponse get(Long id) {
        return InsightResponse.from(requireInsight(id, activeProfile.requireId()));
    }

    @Transactional
    public InsightResponse update(Long id, InsightRequest request) {
        Long profileId = activeProfile.requireId();
        Insight insight = requireInsight(id, profileId);
        requirePlanObject(request.plan());
        // Renaming an insight to its own current name is not a collision.
        if (insightRepository.existsByProfileIdAndNameAndIdNot(profileId, request.name(), id)) {
            throw new InsightNameTakenException(request.name());
        }
        insight.update(request.name(), request.plan(), request.viz(), request.pinned());
        // Managed entity: the change is flushed on commit, no explicit save() needed.
        return InsightResponse.from(insight);
    }

    @Transactional
    public void delete(Long id) {
        insightRepository.delete(requireInsight(id, activeProfile.requireId()));
    }

    /**
     * Runs a plan without saving it (docs/API.md "POST /api/insights/execute"). The profile comes
     * from the session, never from the body, and the envelope is returned exactly as received.
     */
    public JsonNode execute(JsonNode plan) {
        Long profileId = activeProfile.requireId();
        requirePlanObject(plan);
        return analyticsClient.execute(profileId, plan);
    }

    private Insight requireInsight(Long id, Long profileId) {
        return insightRepository
                .findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("insight", id));
    }

    /**
     * The only plan rule the backend owns (docs/API.md "POST /api/insights/execute"): everything
     * else — the version included — belongs to the executor, so the two cannot disagree.
     */
    private static void requirePlanObject(JsonNode plan) {
        if (plan == null || !plan.isObject()) {
            throw new InvalidPlanException(List.of("plan: must be a JSON object"));
        }
    }
}
