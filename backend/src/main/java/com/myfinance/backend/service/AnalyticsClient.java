package com.myfinance.backend.service;

import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;

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

import com.myfinance.backend.config.AnalyticsProperties;
import com.myfinance.backend.exception.AnalyticsUnavailableException;
import com.myfinance.backend.exception.InvalidPlanException;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The backend's only outbound HTTP call: the analytics service (docs/INSIGHTS.md "The analytics
 * service"). Bodies are moved as raw JSON text and handed back as a tree, so the result envelope
 * reaches the browser exactly as the executor computed it — no Java types in the middle to
 * re-apply this application's own number formatting.
 */
@Service
public class AnalyticsClient {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsClient.class);
    private static final String EXECUTE_PATH = "/internal/v1/execute";

    private final RestClient restClient;
    private final JsonMapper jsonMapper;

    public AnalyticsClient(AnalyticsProperties properties, JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
        // Boot's RestClient.Builder auto-configuration is not on this project's classpath, so the
        // client is assembled here: JDK HttpClient for the connect timeout, factory for the read one.
        // HTTP_1_1 explicitly: the JDK client's default (HTTP_2) sends a cleartext h2c upgrade
        // request, and uvicorn supports no upgrade except WebSocket. Against the real analytics
        // service that request failed, and this class reported the answer as "not JSON" ->
        // AnalyticsUnavailableException. Pinned to HTTP/1.1 the backend sends no upgrade, so it
        // does not depend on how uvicorn's HTTP implementation (httptools under uvicorn[standard],
        // h11 without it) treats one. The test stand-in for the executor (PlanExecutorDouble) now
        // refuses upgrade offers the way the shipped executor did, so a revert of this line fails
        // the backend's tests, not only the e2e job.
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
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

        ResponseEntity<String> response = post(request.toString());
        if (response.getStatusCode().isSameCodeAs(HttpStatus.BAD_REQUEST)) {
            throw new InvalidPlanException(problems(response.getBody()));
        }
        if (!response.getStatusCode().is2xxSuccessful()) {
            log.error("Analytics POST {} answered {}", EXECUTE_PATH, response.getStatusCode());
            throw new AnalyticsUnavailableException();
        }
        return parse(response.getBody());
    }

    private ResponseEntity<String> post(String body) {
        try {
            return restClient
                    .post()
                    .uri(EXECUTE_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    // Status is inspected below instead: a 400 carries the executor's problem list.
                    .onStatus(status -> true, (request, response) -> {})
                    .toEntity(String.class);
        } catch (ResourceAccessException ex) {
            log.error("Analytics service unreachable at {}", EXECUTE_PATH, ex);
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
