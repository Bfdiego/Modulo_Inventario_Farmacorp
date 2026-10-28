package com.farmacorp.inventory;

import static org.assertj.core.api.Assertions.*;

import com.farmacorp.inventory.inventory.InventoryService;
import java.util.*;
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
class InventoryRulesIntegrationTest {
  @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17.6");

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", postgres::getJdbcUrl);
    r.add("spring.datasource.username", postgres::getUsername);
    r.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired InventoryService service;
  @Autowired JdbcTemplate jdbc;
  final Authentication admin = auth("admin", "Administrador"),
      inventory = auth("inventory", "Inventario"),
      manager = auth("manager", "Encargado");

  static Authentication auth(String user, String role) {
    return new UsernamePasswordAuthenticationToken(
        user, "", List.of(new SimpleGrantedAuthority("ROLE_" + role)));
  }

  void mutate(String op, String id, Map<String, Object> b, Authentication a) {
    service.mutate(op, id, b, a);
  }

  void command(Map<String, Object> b, Authentication a) {
    mutate("command", null, b, a);
  }

  @SuppressWarnings("unchecked")
  List<Map<String, Object>> entries(String key) {
    return (List<Map<String, Object>>) service.state(admin).get(key);
  }

  String p() {
    return (String) entries("products").get(0).get("id");
  }

  void receipt(String loc, String lot, int amount, String expiry) {
    command(
        Map.of(
            "type",
            "receipt",
            "productId",
            p(),
            "location",
            loc,
            "lotId",
            lot,
            "amount",
            amount,
            "expiry",
            expiry,
            "reference",
            "OC"),
        admin);
  }

  @BeforeEach
  void setup() {
    jdbc.execute(
        "truncate inventory_audit, inventory_history, inventory_reviews, inventory_revisions,"
            + " inventory_lots, inventory_products, inventory_locations cascade");
    mutate("location-create", null, Map.of("name", "A"), admin);
    mutate("location-create", null, Map.of("name", "B"), admin);
    mutate(
        "product",
        null,
        Map.of(
            "name",
            "Producto",
            "sku",
            "SKU",
            "unit",
            "caja",
            "category",
            "General",
            "price",
            10,
            "threshold",
            1,
            "replenishment",
            2,
            "lotTracked",
            true),
        admin);
  }

  @Test
  void saleExcludesReservedBlockedAndExpiredAndRejectIsPermanent() {
    receipt("A", "usable", 5, "2099-01-01");
    receipt("A", "blocked", 5, "2099-02-01");
    receipt("A", "expired", 5, "2099-03-01");
    jdbc.update("update inventory_lots set reserved=3 where id='usable'");
    jdbc.update("update inventory_lots set blocked=true where id='blocked'");
    jdbc.update("update inventory_lots set expiry='2000-01-01' where id='expired'");
    Map<String, Object> sale =
        Map.of(
            "type", "sale", "productId", p(), "location", "A", "amount", 3, "saleId", "rejected");
    command(sale, manager);
    assertThat(entries("sales").get(0)).containsEntry("fulfilled", false);
    assertThat(entries("movements"))
        .filteredOn(x -> "Venta POS simulada".equals(x.get("type")))
        .isEmpty();
    receipt("A", "replenished", 10, "2099-04-01");
    command(sale, manager);
    assertThat(entries("sales")).hasSize(1);
    assertThat(entries("sales").get(0)).containsEntry("fulfilled", false);
    assertThatThrownBy(
            () ->
                command(
                    Map.of(
                        "type",
                        "sale",
                        "productId",
                        p(),
                        "location",
                        "A",
                        "amount",
                        2,
                        "saleId",
                        "rejected"),
                    manager))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("409");
  }

  @Test
  void receiveTransferRollsBackEveryAllocationWhenSecondLotConflicts() {
    receipt("A", "first", 2, "2098-01-01");
    receipt("A", "second", 2, "2099-01-01");
    receipt("B", "second", 1, "2099-02-01");
    command(
        Map.of(
            "type", "dispatch", "productId", p(), "origin", "A", "destination", "B", "amount", 4),
        manager);
    String transfer = (String) entries("transfers").get(0).get("id");
    int movements = entries("movements").size();
    assertThatThrownBy(() -> command(Map.of("type", "receiveTransfer", "id", transfer), manager))
        .isInstanceOf(ResponseStatusException.class);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from inventory_lots where location='B' and id='first'",
                Integer.class))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "select quantity from inventory_lots where location='B' and id='second'",
                Integer.class))
        .isEqualTo(1);
    assertThat(entries("movements")).hasSize(movements);
    assertThat(entries("transfers").get(0)).containsEntry("status", "En tránsito");
  }

  @Test
  void negativeCountCannotConsumeReservedOrBlockedAndRollsBack() {
    receipt("A", "stock", 5, "2099-01-01");
    jdbc.update("update inventory_lots set reserved=4 where id='stock'");
    command(
        Map.of(
            "type", "count", "productId", p(), "location", "A", "physical", 0, "reason", "conteo"),
        manager);
    String count = (String) entries("counts").get(0).get("id");
    int movements = entries("movements").size();
    assertThatThrownBy(() -> command(Map.of("type", "approve", "id", count), inventory))
        .isInstanceOf(ResponseStatusException.class);
    assertThat(entries("counts").get(0)).containsEntry("status", "Pendiente");
    assertThat(entries("movements")).hasSize(movements);
    assertThat(
            jdbc.queryForObject(
                "select quantity from inventory_lots where id='stock'", Integer.class))
        .isEqualTo(5);
  }

  @Test
  void countApprovalChecksRoleAndRequiresPhysicalLotAndFutureExpiry() {
    command(
        Map.of(
            "type",
            "count",
            "productId",
            p(),
            "location",
            "A",
            "physical",
            2,
            "reason",
            "faltante"),
        inventory);
    String own = (String) entries("counts").get(0).get("id");
    assertThatThrownBy(() -> command(Map.of("type", "approve", "id", own), inventory))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("403");
    assertThatThrownBy(() -> command(Map.of("type", "approve", "id", own), manager))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("403");
    assertThatThrownBy(() -> command(Map.of("type", "approve", "id", own), admin))
        .isInstanceOf(ResponseStatusException.class);
    assertThat(entries("counts").get(0)).containsEntry("status", "Pendiente");
    command(
        Map.of(
            "type",
            "count",
            "productId",
            p(),
            "location",
            "A",
            "physical",
            2,
            "reason",
            "sobrante",
            "lotId",
            "physical",
            "expiry",
            "2099-01-01"),
        manager);
    String valid = (String) entries("counts").get(0).get("id");
    command(Map.of("type", "approve", "id", valid), inventory);
    assertThat(
            jdbc.queryForObject(
                "select quantity from inventory_lots where id='physical'", Integer.class))
        .isEqualTo(2);
  }

  @Test
  void masterDataPreservesHistoryAndLastLocation() {
    receipt("A", "stock", 1, "2099-01-01");
    String product = p();
    Map<String, Object> changed = new HashMap<>(entries("products").get(0));
    changed.put("lotTracked", false);
    assertThatThrownBy(() -> mutate("product", product, changed, admin))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("409");
    assertThatThrownBy(
            () -> mutate("location-update", null, Map.of("name", "A", "newName", "C"), admin))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("409");
    assertThatThrownBy(() -> mutate("location-delete", null, Map.of("name", "A"), admin))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("409");
    mutate("location-delete", null, Map.of("name", "B"), admin);
    assertThatThrownBy(() -> mutate("location-delete", null, Map.of("name", "A"), admin))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("409");
  }
}
