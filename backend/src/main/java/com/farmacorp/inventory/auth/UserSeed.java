package com.farmacorp.inventory.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class UserSeed {
  @Bean
  ApplicationRunner seedUsers(
      JdbcTemplate jdbc,
      PasswordEncoder encoder,
      @Value("${app.seed-users:false}") boolean enabled,
      @Value("${app.admin-password:}") String admin,
      @Value("${app.inventory-password:}") String inventory,
      @Value("${app.manager-password:}") String manager) {
    return args -> {
      if (!enabled) return;
      if (admin.isBlank() || inventory.isBlank() || manager.isBlank())
        throw new IllegalStateException("SEED_USERS requiere las tres contraseñas de usuario");
      insert(jdbc, encoder, "admin", admin, "Administrador");
      insert(jdbc, encoder, "inventario", inventory, "Inventario");
      insert(jdbc, encoder, "encargado", manager, "Encargado");
    };
  }

  private void insert(
      JdbcTemplate jdbc, PasswordEncoder encoder, String username, String password, String role) {
    jdbc.update(
        "insert into app_users(username,password_hash,role) values (?,?,?) on conflict (username)"
            + " do nothing",
        username,
        encoder.encode(password),
        role);
  }
}
