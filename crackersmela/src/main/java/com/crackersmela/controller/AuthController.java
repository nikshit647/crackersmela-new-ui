package com.crackersmela.controller;

import com.crackersmela.dto.ApiResponse;
import com.crackersmela.dto.AuthRequest;
import com.crackersmela.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "User registration, login, and token management")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    @Operation(summary = "Register a new customer account")
    public ResponseEntity<ApiResponse.Success<ApiResponse.AuthResponse>> register(
            @Valid @RequestBody AuthRequest.Register request
    ) {
        ApiResponse.AuthResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(
                new ApiResponse.Success<>(true, "Registration successful", response)
        );
    }

    @PostMapping("/login")
    @Operation(summary = "Login with email and password")
    public ResponseEntity<ApiResponse.Success<ApiResponse.AuthResponse>> login(
            @Valid @RequestBody AuthRequest.Login request
    ) {
        ApiResponse.AuthResponse response = authService.login(request);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Login successful", response));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh access token using refresh token")
    public ResponseEntity<ApiResponse.Success<ApiResponse.TokenPair>> refreshToken(
            @Valid @RequestBody AuthRequest.RefreshToken request
    ) {
        ApiResponse.TokenPair tokens = authService.refreshTokens(request);
        return ResponseEntity.ok(new ApiResponse.Success<>(true, "Token refreshed successfully", tokens));
    }
}
