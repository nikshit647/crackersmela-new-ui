package com.crackersmela;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * CrackersMela - Seasonal Fireworks E-Commerce Platform
 *
 * Main application entry point.
 * Caching is enabled via RedisConfig (or SimpleCacheManager in local profile).
 *
 * @author CrackersMela Team
 * @version 1.0.0
 */
@SpringBootApplication
public class CrackersMelaApplication {

    public static void main(String[] args) {
        SpringApplication.run(CrackersMelaApplication.class, args);
    }
}
