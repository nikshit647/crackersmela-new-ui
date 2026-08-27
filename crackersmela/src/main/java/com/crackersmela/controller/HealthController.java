package com.crackersmela.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Health check endpoint for monitoring, load balancers, and Docker.
 */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Health", description = "Service health checks")
public class HealthController {

    @Value("${spring.application.name}")
    private String appName;

    @Value("${app.jwt.access-token-expiration}")
    private long tokenExpiration;

    @GetMapping("/health")
    @Operation(summary = "Service health check")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "service", appName,
                "timestamp", LocalDateTime.now().toString(),
                "version", "1.0.0"
        ));
    }
}
