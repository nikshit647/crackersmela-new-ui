package com.crackersmela.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettucePoolingClientConfiguration;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Redis caching configuration.
 *
 * Why Redis for CrackersMela?
 *   - Seasonal traffic: During Diwali, product pages get 50x normal traffic
 *   - Redis serves cached product catalog from memory (sub-millisecond reads)
 *   - Reduces PostgreSQL load from thousands of identical catalog queries
 *   - Also used for rate limiting and session management
 *
 * Cache TTL strategy:
 *   - Products: 5 minutes (balances freshness vs. DB load)
 *   - Product detail: 10 minutes (individual pages are less volatile)
 *   - Categories: 30 minutes (rarely change)
 *   - User data: 10 minutes (profile updates should reflect reasonably fast)
 *
 * In local profile, Spring Boot auto-configures a SimpleCacheManager instead.
 */
@Configuration
@EnableCaching
public class RedisConfig {

    @Bean
    @ConditionalOnBean(RedisConnectionFactory.class)
    @ConditionalOnMissingBean(CacheManager.class)
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        // Default cache configuration (5 minutes TTL)
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(5))
                .serializeKeysWith(
                        RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer())
                )
                .serializeValuesWith(
                        RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer())
                )
                .disableCachingNullValues();

        // Per-cache TTL configuration
        Map<String, RedisCacheConfiguration> cacheConfigs = new HashMap<>();

        // Product catalog: 5 minutes (high traffic, moderate freshness)
        cacheConfigs.put("products", defaultConfig.entryTtl(Duration.ofMinutes(5)));

        // Individual product: 10 minutes (less volatile)
        cacheConfigs.put("product-detail", defaultConfig.entryTtl(Duration.ofMinutes(10)));

        // Categories: 30 minutes (rarely change)
        cacheConfigs.put("categories", defaultConfig.entryTtl(Duration.ofMinutes(30)));

        // User profiles: 10 minutes
        cacheConfigs.put("users", defaultConfig.entryTtl(Duration.ofMinutes(10)));

        // Shopping cart: 5 minutes (needs to be fresh)
        cacheConfigs.put("cart", defaultConfig.entryTtl(Duration.ofMinutes(5)));

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigs)
                .transactionAware()
                .build();
    }
}
