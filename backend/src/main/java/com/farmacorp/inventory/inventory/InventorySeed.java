package com.farmacorp.inventory.inventory;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
public class InventorySeed implements ApplicationRunner {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final TransactionTemplate tx;

  public InventorySeed(JdbcTemplate db, ObjectMapper json, TransactionTemplate tx) {
    this.db = db;
    this.json = json;
    this.tx = tx;
  }

  @Override
  public void run(ApplicationArguments args) {
    tx.executeWithoutResult(
        status -> {
          db.execute("select pg_advisory_xact_lock(718452391)");
          if (Boolean.TRUE.equals(
              db.queryForObject(
                  "select exists(select 1 from inventory_seed_marker)", Boolean.class))) return;
          db.update("insert into inventory_seed_marker values (1)");
          if (Boolean.TRUE.equals(
              db.queryForObject(
                  "select exists(select 1 from inventory_products) or exists(select 1 from"
                      + " inventory_locations)",
                  Boolean.class))) return;
          try {
            for (String loc : List.of("CEDIS Central", "Sucursal Equipetrol", "Sucursal Cala Cala"))
              db.update("insert into inventory_locations values(?)", loc);
            Object[][] products = {
              {"P01", "Paracetamol 500 mg", "FAR-001", "caja", 25, 50, 18, true, "Analgésicos"},
              {
                "P02", "Ibuprofeno 400 mg", "FAR-002", "caja", 20, 40, 31, true, "Antiinflamatorios"
              },
              {"P03", "Amoxicilina 500 mg", "FAR-003", "caja", 15, 30, 48, true, "Antibióticos"},
              {"P04", "Vitamina C 1 g", "FAR-004", "tubo", 18, 36, 27, true, "Vitaminas"},
              {"P05", "Alcohol en gel 500 ml", "FAR-005", "unidad", 30, 60, 22, false, "Higiene"},
              {"P06", "Omeprazol 20 mg", "FAR-006", "caja", 20, 40, 35, true, "Gastrointestinal"},
              {"P07", "Loratadina 10 mg", "FAR-007", "caja", 12, 24, 24, true, "Antialérgicos"},
              {
                "P08", "Suero fisiológico 500 ml", "FAR-008", "unidad", 25, 50, 15, false, "Insumos"
              },
              {
                "P09",
                "Protector solar FPS 50",
                "FAR-009",
                "unidad",
                10,
                20,
                68,
                true,
                "Dermocosmética"
              },
              {"P10", "Jeringa 5 ml", "FAR-010", "unidad", 50, 100, 3, false, "Insumos"}
            };
            for (Object[] p : products) {
              Map<String, Object> m =
                  Map.of(
                      "id",
                      p[0],
                      "name",
                      p[1],
                      "sku",
                      p[2],
                      "unit",
                      p[3],
                      "threshold",
                      p[4],
                      "replenishment",
                      p[5],
                      "price",
                      p[6],
                      "lotTracked",
                      p[7],
                      "category",
                      p[8]);
              db.update(
                  "insert into inventory_products(id,sku,price,data) values(?,?,?,?::jsonb)",
                  p[0],
                  p[2],
                  p[6],
                  json.writeValueAsString(m));
            }
            Object[][] lots = {
              {"L-1001", "P01", "Sucursal Equipetrol", 18, 0, false, 15},
              {"L-1002", "P01", "Sucursal Equipetrol", 32, 2, false, 212},
              {"L-2001", "P02", "Sucursal Equipetrol", 9, 0, false, 86},
              {"L-2002", "P02", "CEDIS Central", 95, 0, false, 261},
              {"L-3001", "P03", "Sucursal Cala Cala", 22, 0, true, 10},
              {"L-3002", "P03", "CEDIS Central", 64, 0, false, 143},
              {"L-4001", "P04", "Sucursal Cala Cala", 14, 0, false, 21},
              {"L-6001", "P06", "Sucursal Equipetrol", 30, 0, false, 333},
              {"L-7001", "P07", "CEDIS Central", 35, 0, false, 481},
              {"L-9001", "P09", "Sucursal Equipetrol", 7, 0, false, 101},
              {"L-VENC", "P01", "Sucursal Equipetrol", 8, 0, false, -51}
            };
            LocalDate today = LocalDate.now(ZoneId.of("America/La_Paz"));
            int i = 0;
            for (Object[] l : lots) {
              String expiry = today.plusDays((Integer) l[6]).toString();
              db.update(
                  "insert into"
                      + " inventory_lots(product_id,location,id,quantity,reserved,blocked,expiry)"
                      + " values(?,?,?,?,?,?,?)",
                  l[1],
                  l[2],
                  l[0],
                  l[3],
                  l[4],
                  l[5],
                  expiry);
              String mid = "APERTURA-" + (++i);
              Map<String, Object> mov =
                  new LinkedHashMap<>(
                      Map.of(
                          "id",
                          mid,
                          "type",
                          "Saldo inicial de prueba",
                          "productId",
                          l[1],
                          "location",
                          l[2],
                          "lotId",
                          l[0],
                          "expiry",
                          expiry,
                          "quantity",
                          l[0].equals("L-7001") ? 45 : l[3],
                          "date",
                          today.toString(),
                          "user",
                          "Administrador · datos ficticios",
                          "reference",
                          "SEMILLA-LOCAL"));
              mov.put("before", 0);
              mov.put("after", l[0].equals("L-7001") ? 45 : l[3]);
              mov.put("note", "Apertura ficticia de desarrollo");
              db.update(
                  "insert into inventory_history(kind,id,data) values('movement',?,?::jsonb)",
                  mid,
                  json.writeValueAsString(mov));
            }
            String expiry = today.plusDays(481).toString();
            Map<String, Object> transfer =
                Map.of(
                    "id",
                    "TR-001",
                    "productId",
                    "P07",
                    "quantity",
                    10,
                    "origin",
                    "CEDIS Central",
                    "destination",
                    "Sucursal Cala Cala",
                    "status",
                    "En tránsito",
                    "date",
                    today.minusDays(5).toString(),
                    "allocations",
                    List.of(Map.of("lotId", "L-7001", "expiry", expiry, "quantity", 10)));
            db.update(
                "insert into inventory_history(kind,id,data) values('transfer','TR-001',?::jsonb)",
                json.writeValueAsString(transfer));
            Map<String, Object> dispatch =
                new LinkedHashMap<>(
                    Map.of(
                        "id",
                        "M-002",
                        "type",
                        "Despacho de transferencia",
                        "productId",
                        "P07",
                        "location",
                        "CEDIS Central",
                        "quantity",
                        -10,
                        "date",
                        today.minusDays(5).toString(),
                        "user",
                        "Encargado",
                        "reference",
                        "TR-001",
                        "lotId",
                        "L-7001",
                        "expiry",
                        expiry));
            dispatch.put("before", 45);
            dispatch.put("after", 35);
            dispatch.put("note", "Despacho ficticio inicial hacia Sucursal Cala Cala");
            db.update(
                "insert into inventory_history(kind,id,data) values('movement','M-002',?::jsonb)",
                json.writeValueAsString(dispatch));
          } catch (Exception e) {
            throw new IllegalStateException("No se pudo cargar la semilla", e);
          }
        });
  }
}
