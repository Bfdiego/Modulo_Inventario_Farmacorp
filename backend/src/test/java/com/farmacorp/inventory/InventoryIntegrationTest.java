package com.farmacorp.inventory;

import static org.assertj.core.api.Assertions.*;

import com.farmacorp.inventory.inventory.InventoryService;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@SpringBootTest
class InventoryIntegrationTest {
  @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17.6");

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", postgres::getJdbcUrl);
    r.add("spring.datasource.username", postgres::getUsername);
    r.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired InventoryService service;
  @Autowired JdbcTemplate jdbc;
  Authentication admin = auth("admin", "Administrador"),
      inventory = auth("inventario", "Inventario");

  static Authentication auth(String name, String role) {
    return new UsernamePasswordAuthenticationToken(
        name, "", List.of(new SimpleGrantedAuthority("ROLE_" + role)));
  }

  @BeforeEach
  void setup() {
    jdbc.execute(
        "truncate inventory_audit, inventory_history, inventory_reviews, inventory_revisions,"
            + " inventory_lots, inventory_products, inventory_locations cascade");
    service.mutate("location-create", null, Map.of("name", "A"), admin);
    service.mutate("location-create", null, Map.of("name", "B"), admin);
    service.mutate(
        "product",
        null,
        Map.of(
            "name",
            "Prueba",
            "sku",
            "SKU",
            "unit",
            "unidad",
            "category",
            "General",
            "price",
            1,
            "threshold",
            1,
            "replenishment",
            1,
            "lotTracked",
            true),
        admin);
  }

  @SuppressWarnings("unchecked")
  String product() {
    return (String)
        ((List<Map<String, Object>>) service.state(admin).get("products")).get(0).get("id");
  }

  void cmd(Map<String, Object> m) {
    service.mutate("command", null, m, admin);
  }

  void receipt(String id, int n, String expiry) {
    cmd(
        Map.of(
            "type",
            "receipt",
            "productId",
            product(),
            "location",
            "A",
            "amount",
            n,
            "lotId",
            id,
            "expiry",
            expiry,
            "reference",
            "compra"));
  }

  @SuppressWarnings("unchecked")
  List<Map<String, Object>> entries(String name) {
    return (List<Map<String, Object>>) service.state(admin).get(name);
  }

  @Test
  void fefoIdempotencyTransferAndStaleCount() {
    receipt("late", 5, "2099-12-31");
    receipt("early", 3, "2098-12-31");
    String p = product();
    Map<String, Object> sale =
        Map.of("type", "sale", "productId", p, "location", "A", "amount", 4, "saleId", "sale-1");
    cmd(sale);
    cmd(sale);
    assertThat(entries("sales")).hasSize(1);
    assertThat((List<?>) entries("sales").get(0).get("allocations")).hasSize(2);
    assertThat(
            jdbc.queryForObject(
                "select quantity from inventory_lots where id='early'", Integer.class))
        .isZero();
    assertThatThrownBy(
            () ->
                cmd(
                    Map.of(
                        "type",
                        "sale",
                        "productId",
                        p,
                        "location",
                        "A",
                        "amount",
                        2,
                        "saleId",
                        "sale-1")))
        .isInstanceOf(ResponseStatusException.class);
    cmd(Map.of("type", "dispatch", "productId", p, "origin", "A", "destination", "B", "amount", 2));
    String transfer = (String) entries("transfers").get(0).get("id");
    cmd(Map.of("type", "receiveTransfer", "id", transfer));
    cmd(Map.of("type", "receiveTransfer", "id", transfer));
    assertThat(
            jdbc.queryForObject(
                "select quantity from inventory_lots where location='B'", Integer.class))
        .isEqualTo(2);
    cmd(
        Map.of(
            "type", "count", "productId", p, "location", "A", "physical", 1, "reason", "revisión"));
    String count = (String) entries("counts").get(0).get("id");
    receipt("other", 1, "2099-01-01");
    assertThatThrownBy(
            () ->
                service.mutate("command", null, Map.of("type", "approve", "id", count), inventory))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("409");
    assertThatThrownBy(
            () -> service.mutate("location-create", null, Map.of("name", "C"), inventory))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("403");
  }

  @Test
  void concurrentSalesCannotOversell() throws Exception {
    receipt("stock", 5, "2099-12-31");
    String p = product();
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      CountDownLatch start = new CountDownLatch(1);
      List<Future<?>> jobs = new ArrayList<>();
      for (int i = 0; i < 2; i++) {
        String id = "parallel-" + i;
        jobs.add(
            pool.submit(
                () -> {
                  start.await();
                  cmd(
                      Map.of(
                          "type",
                          "sale",
                          "productId",
                          p,
                          "location",
                          "A",
                          "amount",
                          4,
                          "saleId",
                          id));
                  return null;
                }));
      }
      start.countDown();
      for (Future<?> job : jobs) job.get();
      assertThat(entries("sales"))
          .hasSize(2)
          .filteredOn(s -> Boolean.TRUE.equals(s.get("fulfilled")))
          .hasSize(1);
      assertThat(
              jdbc.queryForObject(
                  "select quantity from inventory_lots where id='stock'", Integer.class))
          .isEqualTo(1);
    } finally {
      pool.shutdownNow();
    }
  }
}
