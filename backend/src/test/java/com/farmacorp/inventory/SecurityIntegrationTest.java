package com.farmacorp.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@SpringBootTest(
    properties = {
      "app.seed-users=true",
      "app.admin-password=test-admin",
      "app.inventory-password=test-inventory",
      "app.manager-password=test-manager"
    })
@AutoConfigureMockMvc
class SecurityIntegrationTest {
  @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17.6");

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper mapper;

  @Test
  void sessionCsrfAndLogout() throws Exception {
    mvc.perform(get("/api/auth/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.message").exists());
    MvcResult csrfResult =
        mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
    MockHttpSession session = (MockHttpSession) csrfResult.getRequest().getSession(false);
    String oldId = session.getId();
    JsonNode token = mapper.readTree(csrfResult.getResponse().getContentAsString());
    mvc.perform(
            post("/api/auth/login")
                .session(session)
                .contentType("application/json")
                .content("{\"username\":\"admin\",\"password\":\"test-admin\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/auth/login")
                .session(session)
                .header(token.get("headerName").asText(), token.get("token").asText())
                .contentType("application/json")
                .content("{\"username\":\"admin\",\"password\":\"test-admin\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.role").value("Administrador"));
    assertThat(session.getId()).isNotEqualTo(oldId);
    mvc.perform(get("/api/auth/me").session(session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.username").value("admin"));
    mvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isForbidden());
    mvc.perform(
            post("/api/auth/logout")
                .session(session)
                .header(token.get("headerName").asText(), token.get("token").asText()))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
  }
  @Test
  void httpPermissionsAndActorComeFromAuthentication() throws Exception {
    mvc.perform(get("/api/state")).andExpect(status().isUnauthorized());
    String product = "{\"name\":\"HTTP test\",\"sku\":\"HTTP-SKU\",\"unit\":\"unidad\",\"category\":\"General\",\"price\":1,\"threshold\":1,\"replenishment\":1,\"lotTracked\":true,\"role\":\"Administrador\"}";
    mvc.perform(post("/api/products").with(user("manager").roles("Encargado")).with(csrf()).contentType("application/json").content(product))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").exists());
    mvc.perform(post("/api/products").with(user("admin").roles("Administrador")).with(csrf()).contentType("application/json").content("{}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
    mvc.perform(post("/api/locations").with(user("admin").roles("Administrador")).with(csrf()).contentType("application/json").content("{\"name\":\"HTTP location\"}"))
        .andExpect(status().isOk());
    MvcResult created = mvc.perform(post("/api/products").with(user("admin").roles("Administrador")).with(csrf()).contentType("application/json").content(product))
        .andExpect(status().isOk()).andReturn();
    String id = mapper.readTree(created.getResponse().getContentAsString()).path("state").path("products").get(0).path("id").asText();
    String receipt = mapper.writeValueAsString(java.util.Map.of("type", "receipt", "productId", id, "location", "HTTP location", "amount", 2, "lotId", "HTTP-lot", "expiry", "2099-12-31", "reference", "HTTP", "role", "Administrador", "user", "forged"));
    mvc.perform(post("/api/commands").with(user("inventory").roles("Inventario")).with(csrf()).contentType("application/json").content(receipt))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").exists());
    mvc.perform(post("/api/commands").with(user("real-manager").roles("Encargado")).contentType("application/json").content(receipt))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/commands").with(user("real-manager").roles("Encargado")).with(csrf()).contentType("application/json").content(receipt))
        .andExpect(status().isOk()).andExpect(jsonPath("$.state.movements[0].user").value("real-manager · Encargado"));
  }

}
