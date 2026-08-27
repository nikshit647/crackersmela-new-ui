package com.crackersmela.security;

import com.crackersmela.model.User;
import com.crackersmela.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Collections;

/**
 * Custom UserDetailsService that loads users from PostgreSQL.
 *
 * Spring Security uses this to:
 *   - Load user details during JWT authentication
 *   - Verify user exists and is active
 *   - Map user role to Spring Security authorities
 */
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String userId) throws UsernameNotFoundException {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UsernameNotFoundException(
                        "User not found with id: " + userId
                ));

        if (Boolean.FALSE.equals(user.getIsActive())) {
            throw new UsernameNotFoundException(
                    "User account is deactivated: " + userId
            );
        }

        return new org.springframework.security.core.userdetails.User(
                user.getId(),                    // username = user ID
                user.getPasswordHash(),          // password hash
                Collections.singletonList(
                        new SimpleGrantedAuthority("ROLE_" + user.getRole().name())
                )
        );
    }
}
