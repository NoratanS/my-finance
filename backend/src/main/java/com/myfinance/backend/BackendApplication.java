package com.myfinance.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.myfinance.backend.config.AnalyticsProperties;
import com.myfinance.backend.config.AuthProperties;

@SpringBootApplication
@EnableConfigurationProperties({AnalyticsProperties.class, AuthProperties.class})
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }
}
