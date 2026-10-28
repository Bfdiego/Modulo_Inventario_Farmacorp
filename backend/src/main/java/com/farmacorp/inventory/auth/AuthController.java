package com.farmacorp.inventory.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthenticationManager manager;
  private final SecurityContextRepository repository;

  public AuthController(AuthenticationManager manager, SecurityContextRepository repository) {
    this.manager = manager;
    this.repository = repository;
  }

  record Login(String username, String password) {}

  @GetMapping("/csrf")
  Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
  }

  @PostMapping("/login")
  ResponseEntity<?> login(
      @RequestBody Login login, HttpServletRequest request, HttpServletResponse response) {
    if (login.username() == null || login.password() == null)
      return ResponseEntity.badRequest()
          .body(Map.of("message", "Usuario y contraseña son obligatorios"));
    try {
      Authentication authentication =
          manager.authenticate(
              UsernamePasswordAuthenticationToken.unauthenticated(
                  login.username(), login.password()));
      new ChangeSessionIdAuthenticationStrategy()
          .onAuthentication(authentication, request, response);
      SecurityContext context = SecurityContextHolder.createEmptyContext();
      context.setAuthentication(authentication);
      SecurityContextHolder.setContext(context);
      repository.saveContext(context, request, response);
      return ResponseEntity.ok(identity(authentication));
    } catch (BadCredentialsException ex) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("message", "Usuario o contraseña incorrectos"));
    }
  }

  @GetMapping("/me")
  Map<String, String> me(Authentication authentication) {
    return identity(authentication);
  }

  @PostMapping("/logout")
  ResponseEntity<Void> logout(
      HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
    new SecurityContextLogoutHandler().logout(request, response, authentication);
    return ResponseEntity.noContent().build();
  }

  private Map<String, String> identity(Authentication auth) {
    return Map.of(
        "username",
        auth.getName(),
        "role",
        auth.getAuthorities().iterator().next().getAuthority().substring(5));
  }
}
