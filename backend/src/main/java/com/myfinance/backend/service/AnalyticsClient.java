package com.myfinance.backend.service;

import com.myfinance.backend.config.AnalyticsProperties;
import com.myfinance.backend.dto.CapabilitiesResponse;
import com.myfinance.backend.exception.AnalyticsUnavailableException;
import com.myfinance.backend.exception.InvalidPlanException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;

/**
 * The backend's only outbound HTTP call: the analytics service (docs/INSIGHTS.md "The analytics
 * service"). Bodies are moved as raw JSON text and handed back as a tree, so the result envelope
 * reaches the browser exactly as the executor computed it — no Java types in the middle to
 * re-apply this application's own number formatting.
 */
@Service
public class AnalyticsClient {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsClient.class);
    private static final CapabilitiesResponse UNAVAILABLE = new CapabilitiesResponse(false, null);

    private final RestClient restClient;
    private final JsonMapper jsonMapper;

    public AnalyticsClient(AnalyticsProperties properties, JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
        // Boot's RestClient.Builder auto-configuration is not on this project's classpath, so the
        // client is assembled here: JDK HttpClient for the connect timeout, factory for the read one.
        // HTTP_1_1 explicitly: the JDK client's default (HTTP_2) sends a cleartext h2c upgrade
        // request that uvicorn's h11 protocol implementation rejects outright ("Unsupported
        // upgrade request" / "Invalid HTTP request received"), which this class then reports as
        // "not JSON" -> AnalyticsUnavailableException. The in-process JDK HttpServer used by
        // AnalyticsClientTest tolerates the same upgrade header, which is why this only surfaced
        // against the real analytics service.
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(properties.connectTimeout())
                        .build());
        requestFactory.setReadTimeout(properties.readTimeout());
        this.restClient = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.token())
                .requestFactory(requestFactory)
                .build();
    }

    /**
     * Runs {@code plan} for {@code profileId} and returns the result envelope unchanged.
     * {@code profileId} always comes from the session — never from the request body.
     */
    public JsonNode execute(Long profileId, JsonNode plan) {
        ObjectNode request = jsonMapper.createObjectNode();
        request.put("profileId", profileId);
        request.set("plan", plan);

        ResponseEntity<String> response = post("/internal/v1/execute", request.toString());
        if (response.getStatusCode().isSameCodeAs(HttpStatus.BAD_REQUEST)) {
            throw new InvalidPlanException(problems(response.getBody()));
        }
        if (!response.getStatusCode().is2xxSuccessful()) {
            log.error("Analytics POST /internal/v1/execute answered {}", response.getStatusCode());
            throw new AnalyticsUnavailableException();
        }
        return parse(response.getBody());
    }

    /**
     * Capability probe. Unlike {@link #execute}, a failure here is not a 503: "the analytics
     * service is unreachable" and "Ollama is not running" both mean interpretation is
     * unavailable, which is exactly what the caller asked. Answering false keeps the explorer
     * in templates-and-chips mode instead of showing an error for a feature nobody invoked.
     * <p>
     * Every transport, HTTP, and parsing failure surfaces from {@code RestClient} as a
     * {@link RestClientException} (connection refused/timeout as {@link ResourceAccessException},
     * non-2xx as {@code RestClientResponseException}, an unparsable or wrongly-shaped body as a
     * response-extraction {@code RestClientException}) — catching that one type is total, so this
     * method has no path left that can throw.
     * <p>
     * That totality is checked against this DTO's shape, not guaranteed by Spring in general:
     * {@code DefaultRestClient.readWithMessageConverters} catches {@code
     * HttpMessageNotReadableException} but not its {@code HttpMessageConversionException}
     * superclass, so a Jackson {@code InvalidDefinitionException} would escape uncaught. No
     * response body can provoke one for two fields of {@code boolean} and {@code String}. If
     * {@link CapabilitiesResponse} ever grows a field Jackson could fail to construct a
     * deserializer for, re-verify this method before trusting the "cannot throw" claim.
     */
    public CapabilitiesResponse capabilities() {
        try {
            return normalize(restClient.get()
                    .uri("/internal/v1/capabilities")
                    .retrieve()
                    .body(CapabilitiesResponse.class));
        } catch (RestClientException e) {
            return UNAVAILABLE;
        }
    }

    /**
     * The only shapes worth trusting are {@code (false, null)} and {@code (true, <model>)};
     * an inconsistent pair from analytics (interpret true with no named model, or interpret
     * false with a model name attached) is normalised to fully unavailable rather than passed
     * on — never report a model the caller cannot use.
     */
    private static CapabilitiesResponse normalize(CapabilitiesResponse response) {
        if (response == null) {
            return UNAVAILABLE;
        }
        boolean usable = response.interpret() && response.model() != null && !response.model().isBlank();
        return usable ? response : UNAVAILABLE;
    }

    private ResponseEntity<String> post(String path, String body) {
        try {
            return restClient.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    // Status is inspected below instead: a 400 carries the executor's problem list.
                    .onStatus(status -> true, (request, response) -> { })
                    .toEntity(String.class);
        } catch (ResourceAccessException ex) {
            log.error("Analytics service unreachable at {}", path, ex);
            throw new AnalyticsUnavailableException();
        }
    }

    private JsonNode parse(String body) {
        try {
            return jsonMapper.readTree(body == null ? "" : body);
        } catch (JacksonException ex) {
            log.error("Analytics service returned a body that is not JSON", ex);
            throw new AnalyticsUnavailableException();
        }
    }

    /** The executor's {@code {"problems": [...]}} payload, passed through untouched. */
    private List<String> problems(String body) {
        List<String> problems = new ArrayList<>();
        parse(body).path("problems").forEach(problem -> problems.add(problem.asString()));
        if (problems.isEmpty()) {
            problems.add("The analytics service rejected the plan.");
        }
        return problems;
    }
}
