package com.myfinance.backend.support;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.extension.AfterAllCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Stands in for the analytics service's plan executor (docs/INSIGHTS.md "Testing strategy"): a
 * JDK {@link HttpServer} on a free loopback port that answers what the test scripts.
 * <p>
 * A test class holds it in a static field registered with {@code @RegisterExtension}. The field is
 * initialized when the class is loaded, before Spring builds the test context, so a
 * {@code @DynamicPropertySource} method can hand {@link #baseUrl()} to the context. The script and
 * the recorded requests are reset before each test; the server stops after the test class.
 */
public final class PlanExecutorDouble implements BeforeEachCallback, AfterAllCallback {

    private static final String EXECUTE_PATH = "/internal/v1/execute";

    /** One request the stand-in received: its headers and its body text. */
    public record ReceivedRequest(Headers headers, String body) {}

    private final HttpServer server;
    private final List<ReceivedRequest> received = new CopyOnWriteArrayList<>();
    private volatile int status;
    private volatile String body;
    private volatile Duration delay;

    private PlanExecutorDouble(HttpServer server) {
        this.server = server;
        reset();
    }

    /** Binds loopback on a free port and starts answering. */
    public static PlanExecutorDouble start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            PlanExecutorDouble executor = new PlanExecutorDouble(server);
            server.createContext(EXECUTE_PATH, executor::handle);
            server.start();
            return executor;
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
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

    /** Every call in this test is answered with {@code status} and the JSON {@code body}. */
    public void answer(int status, String body) {
        this.status = status;
        this.body = body;
    }

    /** Every call in this test waits {@code delay} before it is answered. */
    public void delayAnswers(Duration delay) {
        this.delay = delay;
    }

    /** The requests received during this test, in order. */
    public List<ReceivedRequest> receivedRequests() {
        return List.copyOf(received);
    }

    @Override
    public void beforeEach(ExtensionContext context) {
        reset();
    }

    @Override
    public void afterAll(ExtensionContext context) {
        server.stop(0);
    }

    private void reset() {
        status = 500;
        body = "{\"problems\": [\"PlanExecutorDouble: no answer was scripted for this test\"]}";
        delay = Duration.ZERO;
        received.clear();
    }

    private void handle(HttpExchange exchange) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        received.add(new ReceivedRequest(exchange.getRequestHeaders(), requestBody));
        if (!delay.isZero()) {
            try {
                Thread.sleep(delay);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        byte[] out = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, out.length);
        exchange.getResponseBody().write(out);
        exchange.close();
    }
}
