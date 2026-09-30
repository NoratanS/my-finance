package com.myfinance.backend.support;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.extension.AfterAllCallback;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Stands in for the analytics service's plan executor (docs/INSIGHTS.md "Testing strategy"): a
 * JDK {@link HttpServer} on a free loopback port that answers each plan with its <em>recorded
 * exchange</em>, one JSON file in {@code plan-executor-exchanges} on the test classpath. The
 * analytics suite proves every file against the real route, so every answer here is one the real
 * executor gives. A plan with no recorded exchange fails the test. Before answering, it refuses
 * what the executor refuses, in the executor's order: an HTTP/2 upgrade offer, another method, a
 * JSON body that does not parse, a wrong bearer token and a malformed request wrapper.
 * <p>
 * A test class holds it in a static field registered with {@code @RegisterExtension}. The field is
 * initialized when the class is loaded, before Spring builds the test context, so a
 * {@code @DynamicPropertySource} method can hand {@link #baseUrl()} and {@link #TOKEN} to the
 * context. Its state is reset before each test; the server stops after the test class.
 */
public final class PlanExecutorDouble implements BeforeEachCallback, AfterEachCallback, AfterAllCallback {

    /** The only bearer token the stand-in accepts. */
    public static final String TOKEN = "plan-executor-double-token";

    private static final String EXECUTE_PATH = "/internal/v1/execute";
    private static final String EXCHANGES = "classpath:plan-executor-exchanges/*.json";
    private static final String SEEDED = "seeded";
    private static final String FAILING = "failing";
    // One mapper for the files and for incoming requests: plans are matched as JSON trees, and
    // two mappers configured differently could build unequal trees for the same text.
    private static final JsonMapper JSON = JsonMapper.builder().build();

    /**
     * One recorded exchange: the executor's database state, the plan as the backend forwards it,
     * and the status and exact body text the stand-in answers with (Jackson's compact form of the
     * file's body).
     */
    public record Exchange(String name, String database, JsonNode plan, int status, String body) {

        /** The body's {@code problems} list, for a rejected plan or a failure. */
        public List<String> problems() {
            List<String> problems = new ArrayList<>();
            JSON.readTree(body).path("problems").forEach(problem -> problems.add(problem.asString()));
            return problems;
        }
    }

    private record Key(String database, JsonNode plan) {}

    private final HttpServer server;
    private final Map<String, Exchange> byName;
    private final Map<Key, Exchange> byKey;
    private final List<JsonNode> received = new CopyOnWriteArrayList<>();
    private final List<String> unrecorded = new CopyOnWriteArrayList<>();
    private volatile String database;
    private volatile Duration delay;
    private volatile boolean proxyPageNext;

    private PlanExecutorDouble(HttpServer server, List<Exchange> exchanges) {
        this.server = server;
        this.byName = new TreeMap<>();
        this.byKey = new HashMap<>();
        for (Exchange exchange : exchanges) {
            byName.put(exchange.name(), exchange);
            Exchange clash = byKey.put(new Key(exchange.database(), exchange.plan()), exchange);
            if (clash != null) {
                throw new IllegalStateException("Recorded exchanges " + clash.name() + " and " + exchange.name()
                        + " share a database state and plan");
            }
        }
        reset();
    }

    /** Loads every recorded exchange, binds loopback on a free port and starts answering. */
    public static PlanExecutorDouble start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            PlanExecutorDouble executor = new PlanExecutorDouble(server, loadExchanges());
            server.createContext(EXECUTE_PATH, executor::handle);
            server.start();
            return executor;
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    private static List<Exchange> loadExchanges() throws IOException {
        Resource[] files = new PathMatchingResourcePatternResolver().getResources(EXCHANGES);
        if (files.length == 0) {
            throw new IllegalStateException("No recorded exchanges found at " + EXCHANGES);
        }
        List<Exchange> exchanges = new ArrayList<>();
        for (Resource file : files) {
            JsonNode recorded;
            try (InputStream in = file.getInputStream()) {
                recorded = JSON.readTree(in);
            }
            exchanges.add(new Exchange(
                    file.getFilename().replaceFirst("\\.json$", ""),
                    recorded.path("database").asString(),
                    recorded.path("plan"),
                    recorded.path("status").asInt(),
                    JSON.writeValueAsString(recorded.path("body"))));
        }
        return exchanges;
    }

    /** A base URL nothing listens on: loopback on a port that was free a moment ago. */
    public static String unreachableBaseUrl() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return "http://127.0.0.1:" + socket.getLocalPort();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** The recorded exchange named after its file, without {@code .json}. */
    public Exchange exchange(String name) {
        Exchange exchange = byName.get(name);
        if (exchange == null) {
            throw new IllegalArgumentException("No recorded exchange " + name + "; recorded: " + byName.keySet());
        }
        return exchange;
    }

    /** For the rest of this test, the executor's database fails: plans get their "failing" answers. */
    public void databaseFails() {
        database = FAILING;
    }

    /** Every call in this test waits {@code delay} before it is answered. */
    public void delayAnswers(Duration delay) {
        this.delay = delay;
    }

    /**
     * The next call is answered 200 with an HTML page: what a proxy in front of the executor
     * might send. Never an executor answer.
     */
    public void answerNextWithAProxyPage() {
        proxyPageNext = true;
    }

    /** The request wrappers ({@code {profileId, plan}}) received during this test, in order. */
    public List<JsonNode> receivedRequests() {
        return List.copyOf(received);
    }

    @Override
    public void beforeEach(ExtensionContext context) {
        reset();
    }

    @Override
    public void afterEach(ExtensionContext context) {
        if (!unrecorded.isEmpty()) {
            throw new AssertionError("PlanExecutorDouble received a plan with no recorded exchange: " + unrecorded
                    + ". Recorded exchanges: " + byName.keySet()
                    + ". Record the executor's answer under plan-executor-exchanges (the analytics suite"
                    + " proves it) rather than inventing one.");
        }
    }

    @Override
    public void afterAll(ExtensionContext context) {
        server.stop(0);
    }

    private void reset() {
        database = SEEDED;
        delay = Duration.ZERO;
        proxyPageNext = false;
        received.clear();
        unrecorded.clear();
    }

    /**
     * The executor's checks, in the executor's order. Only the recorded answer's body is ever read
     * by the backend; the refusals' bodies are written here, each citing where the real one comes
     * from.
     */
    private void handle(HttpExchange http) throws IOException {
        try (http) {
            // Read the body before answering anything, so the client's write never fails first.
            byte[] body = http.getRequestBody().readAllBytes();
            if (!delay.isZero()) {
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            if (proxyPageNext) {
                proxyPageNext = false;
                send(http, 200, "text/html", "<html><body>502 Bad Gateway</body></html>");
                return;
            }
            Headers headers = http.getRequestHeaders();
            // 1. uvicorn with httptools (uvicorn[standard]) serves no upgrade but WebSocket: the
            // request reaches the app without its body, and the body's bytes, parsed as the next
            // request, get this answer (uvicorn/protocols/http/httptools_impl.py, send_400_response).
            // AnalyticsClient reads it as "not JSON", so every call becomes analytics-unavailable.
            if (headers.containsKey("Upgrade")) {
                http.getResponseHeaders().add("Connection", "close");
                send(http, 400, "text/plain; charset=utf-8", "Invalid HTTP request received.");
                return;
            }
            // 2. Starlette's route matching: 405 with Allow, rendered by FastAPI as {"detail": ...}.
            if (!"POST".equals(http.getRequestMethod())) {
                http.getResponseHeaders().add("Allow", "POST");
                send(http, 405, "application/json", "{\"detail\":\"Method Not Allowed\"}");
                return;
            }
            // 3. FastAPI decodes a non-empty JSON body before any dependency runs (fastapi/routing.py);
            // a decode error is a 422 whose detail list is abbreviated here.
            JsonNode wrapper = null;
            if (isJson(headers.getFirst("Content-Type")) && body.length > 0) {
                try {
                    wrapper = JSON.readTree(body);
                } catch (JacksonException ex) {
                    send(
                            http,
                            422,
                            "application/json",
                            "{\"detail\":[{\"type\":\"json_invalid\",\"msg\":\"JSON decode error\"}]}");
                    return;
                }
            }
            // 4. The executor's token check (analytics/src/analytics/auth.py): a missing and a wrong
            // token get the same 401, rendered by FastAPI as {"detail": ...}.
            if (!("Bearer " + TOKEN).equals(headers.getFirst("Authorization"))) {
                send(http, 401, "application/json", "{\"detail\":\"Missing or invalid bearer token\"}");
                return;
            }
            // 5. FastAPI validates the wrapper against ExecuteRequest (analytics/src/analytics/main.py):
            // an object with an integer profileId and a plan. Pydantic would also coerce "3"; the
            // backend always sends a JSON integer, so the stand-in is stricter.
            if (wrapper == null
                    || !wrapper.isObject()
                    || !wrapper.path("profileId").isIntegralNumber()
                    || !wrapper.has("plan")) {
                send(
                        http,
                        422,
                        "application/json",
                        "{\"detail\":[{\"msg\":\"not an object with an integer profileId and a plan\"}]}");
                return;
            }
            received.add(wrapper);
            // 6. The recorded answer for (database state, plan); the profileId's value never matters.
            JsonNode plan = wrapper.get("plan");
            Exchange exchange = byKey.get(new Key(database, plan));
            if (exchange == null) {
                unrecorded.add("(database " + database + ") " + plan);
                send(http, 500, "application/json", "{\"problems\":[\"PlanExecutorDouble: no recorded exchange\"]}");
                return;
            }
            send(http, exchange.status(), "application/json", exchange.body());
        }
    }

    /** FastAPI decodes {@code application/json} and {@code application/*+json}, parameters ignored. */
    private static boolean isJson(String contentType) {
        if (contentType == null) {
            return false;
        }
        String mediaType = contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return mediaType.equals("application/json")
                || (mediaType.startsWith("application/") && mediaType.endsWith("+json"));
    }

    private static void send(HttpExchange http, int status, String contentType, String body) throws IOException {
        byte[] out = body.getBytes(StandardCharsets.UTF_8);
        http.getResponseHeaders().add("Content-Type", contentType);
        http.sendResponseHeaders(status, out.length);
        http.getResponseBody().write(out);
    }
}
