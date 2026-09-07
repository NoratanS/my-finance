package com.myfinance.backend.service;

import com.myfinance.backend.dto.CapabilitiesResponse;
import com.myfinance.backend.dto.InsightRequest;
import com.myfinance.backend.dto.InsightResponse;
import com.myfinance.backend.dto.InterpretRequest;
import com.myfinance.backend.dto.NarrationResponse;
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

    /** See {@link #requireRefinablePlan}. */
    static final int MAX_CURRENT_PLAN_CHARS = 4000;

    private final InsightRepository insightRepository;
    private final ProfileRepository profileRepository;
    private final ActiveProfile activeProfile;
    private final AnalyticsClient analyticsClient;

    public InsightService(InsightRepository insightRepository, ProfileRepository profileRepository,
                          ActiveProfile activeProfile, AnalyticsClient analyticsClient) {
        this.insightRepository = insightRepository;
        this.profileRepository = profileRepository;
        this.activeProfile = activeProfile;
        this.analyticsClient = analyticsClient;
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

    /**
     * Runs a plan without saving it (docs/API.md "POST /api/insights/execute"). The profile comes
     * from the session, never from the body, and the envelope is returned exactly as received.
     */
    public JsonNode execute(JsonNode plan) {
        Long profileId = activeProfile.requireId();
        requirePlanObject(plan);
        return analyticsClient.execute(profileId, plan);
    }

    /** Instance-wide, not profile-scoped: nothing here reads profile data. */
    public CapabilitiesResponse capabilities() {
        return analyticsClient.capabilities();
    }

    /** Free text -> a draft plan, for the profile the session says is active (Phase 5). */
    public JsonNode interpret(InterpretRequest request) {
        Long profileId = activeProfile.requireId();
        requireRefinablePlan(request.currentPlan());
        return analyticsClient.interpret(profileId, request.text(), request.currentPlan());
    }

    /**
     * A caption for what a plan's results show (docs/API.md "POST /api/insights/narrate").
     * The plan is executed here rather than trusting an envelope from the browser: a caption is
     * only worth anything if its numbers are this profile's real numbers, and re-running a
     * millisecond query is cheaper than a second place where client-supplied figures could reach
     * the user (docs/INSIGHTS.md, principle 2). Reusing {@link #execute} also reuses the profile
     * resolution and the "is it a JSON object" check, so this method owns no plan bound of its
     * own — the plan inside the envelope was already schema-validated by the executor before it
     * reached the model, unlike {@code currentPlan} on {@link #interpret}.
     */
    public NarrationResponse narrate(JsonNode plan) {
        JsonNode envelope = execute(plan);
        return new NarrationResponse(analyticsClient.narrate(envelope));
    }

    private Insight requireInsight(Long id, Long profileId) {
        return insightRepository.findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("insight", id));
    }

    /**
     * The only plan rule the backend owns (docs/API.md "POST /api/insights/execute"): everything
     * else — the version included — belongs to the executor, so the two cannot disagree.
     */
    /**
     * {@code currentPlan} is bounded here and not on the DTO because it is the one request field
     * that reaches the language model without being validated first. {@code plan} on
     * {@code /execute} looks similar but is not comparable: the executor schema-validates it before
     * any expensive work, so an oversized one is rejected cheaply. This one is serialised straight
     * into a prompt turn, where the cost falls on local inference.
     *
     * <p>The bound is generous against a real plan: the widest the DSL permits is 25 merchants of
     * 100 characters, so roughly 2.8 kB. 4 kB leaves headroom without admitting a payload whose
     * only purpose is to be large.
     */
    private static void requireRefinablePlan(JsonNode currentPlan) {
        // currentPlan is optional: absent, a Java null, or an explicit JSON null (which Jackson
        // binds to a NullNode, not a Java null) all mean "no plan to refine" and must pass through.
        // Anything present that is not an object (C7) is a 400 the backend catches itself, rather
        // than reaching analytics' InterpretRequest.currentPlan: dict | None and coming back as a
        // pydantic 422 indistinguishable from a genuine "no usable plan" failure.
        if (currentPlan == null || currentPlan.isNull()) {
            return;
        }
        if (!currentPlan.isObject()) {
            throw new InvalidPlanException(List.of("currentPlan: must be a JSON object"));
        }
        if (currentPlan.toString().length() > MAX_CURRENT_PLAN_CHARS) {
            throw new InvalidPlanException(
                    List.of("currentPlan: must be at most " + MAX_CURRENT_PLAN_CHARS
                            + " characters when serialised"));
        }
    }

    private static void requirePlanObject(JsonNode plan) {
        if (plan == null || !plan.isObject()) {
            throw new InvalidPlanException(List.of("plan: must be a JSON object"));
        }
    }
}
