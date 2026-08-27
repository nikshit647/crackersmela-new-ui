package com.crackersmela.exception;

import com.crackersmela.dto.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * Global exception handler — converts all exceptions to consistent JSON responses.
 *
 * All exceptions are caught here and returned as:
 *   {
 *     "success": false,
 *     "message": "Human-readable error message",
 *     "errors": { ... }  // Optional field-level errors
 *   }
 *
 * This prevents stack traces from leaking to clients (security best practice).
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // =========================================================================
    // 404 - Resource Not Found
    // =========================================================================
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse.Error> handleResourceNotFound(ResourceNotFoundException ex) {
        log.warn("Resource not found: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.Error.builder()
                        .message(ex.getMessage())
                        .build());
    }

    // =========================================================================
    // 400 - Bad Request (Validation)
    // =========================================================================
    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiResponse.Error> handleBadRequest(BadRequestException ex) {
        log.warn("Bad request: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.Error.builder()
                        .message(ex.getMessage())
                        .build());
    }

    // =========================================================================
    // 400 - Bean Validation Failures
    // =========================================================================
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse.Error> handleValidationErrors(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new HashMap<>();

        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(error.getField(), error.getDefaultMessage());
        }

        log.warn("Validation failed: {}", fieldErrors);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.Error.builder()
                        .message("Validation failed")
                        .errors(fieldErrors)
                        .build());
    }

    // =========================================================================
    // 400 - Constraint Violation
    // =========================================================================
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse.Error> handleConstraintViolation(ConstraintViolationException ex) {
        log.warn("Constraint violation: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.Error.builder()
                        .message("Validation failed: " + ex.getMessage())
                        .build());
    }

    // =========================================================================
    // 401 - Authentication Failures
    // =========================================================================
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponse.Error> handleBadCredentials(BadCredentialsException ex) {
        log.warn("Bad credentials: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.Error.builder()
                        .message("Invalid email or password")
                        .build());
    }

    // =========================================================================
    // 403 - Access Denied
    // =========================================================================
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse.Error> handleAccessDenied(AccessDeniedException ex) {
        log.warn("Access denied: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.Error.builder()
                        .message("Access denied. Insufficient permissions.")
                        .build());
    }

    // =========================================================================
    // 409 - Conflict (duplicate email, SKU, etc.)
    // =========================================================================
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse.Error> handleConflict(IllegalStateException ex) {
        log.warn("Conflict: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(ApiResponse.Error.builder()
                        .message(ex.getMessage())
                        .build());
    }

    // =========================================================================
    // 500 - Internal Server Error (catch-all)
    // =========================================================================
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse.Error> handleGenericException(Exception ex) {
        log.error("Unexpected error: {}", ex.getMessage(), ex);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.Error.builder()
                        .message("An unexpected error occurred. Please try again later.")
                        .build());
    }
}
