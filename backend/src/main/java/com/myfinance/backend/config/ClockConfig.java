package com.myfinance.backend.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * One injectable UTC clock for everything time-based (the charge job and the dashboard's
 * {@code asOf}), so tests can swap in {@code Clock.fixed(...)} instead of stubbing statics.
 * Also enables {@code @Scheduled} — the charge job is the app's only scheduled task.
 */
@Configuration
@EnableScheduling
public class ClockConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
