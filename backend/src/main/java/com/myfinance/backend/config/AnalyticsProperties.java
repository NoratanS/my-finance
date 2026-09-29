package com.myfinance.backend.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Connection settings for the analytics service (docs/INSIGHTS.md "The analytics service").
 * The timeouts are short and explicit on purpose: an outbound call with no deadline turns one
 * slow dependency into an exhausted Tomcat thread pool.
 */
@ConfigurationProperties("analytics")
public record AnalyticsProperties(String baseUrl, String token, Duration connectTimeout, Duration readTimeout) {}
