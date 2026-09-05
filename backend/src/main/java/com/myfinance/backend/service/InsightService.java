package com.myfinance.backend.service;

import com.myfinance.backend.dto.InsightRequest;
import com.myfinance.backend.dto.InsightResponse;
import com.myfinance.backend.exception.InsightNameTakenException;
import com.myfinance.backend.exception.InvalidPlanException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.InsightRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.security.ActiveProfile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.util.List;

/**
 * Saved insights of the active profile (docs/API.md "Insights"). Every repository call is scoped
 * by the session's profile id, so another profile's rows are simply not found.
 */
@Service
@Transactional(readOnly = true)
public class InsightService {

    private final InsightRepository insightRepository;
    private final ProfileRepository profileRepository;
    private final ActiveProfile activeProfile;

    public InsightService(InsightRepository insightRepository, ProfileRepository profileRepository,
                          ActiveProfile activeProfile) {
        this.insightRepository = insightRepository;
        this.profileRepository = profileRepository;
        this.activeProfile = activeProfile;
    }

    @Transactional
    public InsightResponse create(InsightRequest request) {
        Long profileId = activeProfile.requireId();
        requirePlanObject(request.plan());
        // Check-then-insert; UNIQUE (profile_id, name) is the backstop for races.
        if (insightRepository.existsByProfileIdAndName(profileId, request.name())) {
            throw new InsightNameTakenException(request.name());
        }
        Profile profile = profileRepository.getReferenceById(profileId);
        Insight insight = insightRepository.save(
                new Insight(profile, request.name(), request.plan(), request.viz(), request.pinned()));
        return InsightResponse.from(insight);
    }

    public List<InsightResponse> list() {
        return insightRepository.findByProfileIdOrderByPinnedDescNameAsc(activeProfile.requireId())
                .stream().map(InsightResponse::from).toList();
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

    private Insight requireInsight(Long id, Long profileId) {
        return insightRepository.findByIdAndProfileId(id, profileId)
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
