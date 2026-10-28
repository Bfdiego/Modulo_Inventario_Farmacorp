package com.farmacorp.inventory.inventory;

import com.farmacorp.inventory.persistence.InventoryRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Service
public class InventoryService {
  private static final org.slf4j.Logger log =
      org.slf4j.LoggerFactory.getLogger(InventoryService.class);
  private final InventoryRepository db;
  private final ObjectMapper json;

  public InventoryService(InventoryRepository db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  private static ResponseStatusException error(HttpStatus s, String m) {
    return new ResponseStatusException(s, m);
  }

  private static void require(boolean ok, String m) {
    if (!ok) throw error(HttpStatus.BAD_REQUEST, m);
  }

  private static String str(Map<String, Object> m, String k) {
    Object v = m.get(k);
    return v == null ? "" : v.toString().trim();
  }

  private static String needed(Map<String, Object> m, String k) {
    String v = str(m, k);
    require(!v.isEmpty(), "Campo requerido: " + k);
    return v;
  }

  private static BigDecimal num(Map<String, Object> m, String k) {
    try {
      return new BigDecimal(needed(m, k));
    } catch (NumberFormatException e) {
      throw error(HttpStatus.BAD_REQUEST, "Número inválido: " + k);
    }
  }

  private static String id(String p) {
    return p + "-" + UUID.randomUUID();
  }

  private String encode(Object v) {
    try {
      return json.writeValueAsString(v);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private Map<String, Object> decode(String v) {
    try {
      return json.readValue(v, new TypeReference<>() {});
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private String role(Authentication a) {
    if (a == null || !a.isAuthenticated())
      throw error(HttpStatus.UNAUTHORIZED, "Sesión requerida.");
    return a.getAuthorities().stream()
        .map(x -> x.getAuthority().replaceFirst("^ROLE_", ""))
        .filter(x -> List.of("Administrador", "Inventario", "Encargado").contains(x))
        .findFirst()
        .orElseThrow(() -> error(HttpStatus.FORBIDDEN, "Perfil no autorizado."));
  }

  private void allow(String role, String... roles) {
    if (!Arrays.asList(roles).contains(role))
      throw error(HttpStatus.FORBIDDEN, "Perfil no autorizado.");
  }

  private Map<String, Object> one(String sql, Object... args) {
    List<Map<String, Object>> rows = db.queryForList(sql, args);
    if (rows.isEmpty()) throw error(HttpStatus.NOT_FOUND, "Registro inexistente.");
    return rows.get(0);
  }

  private Map<String, Object> history(String kind, String id) {
    return decode(
        (String)
            one("select data::text as data from inventory_history where kind=? and id=?", kind, id)
                .get("data"));
  }

  private void save(String kind, String id, Map<String, Object> data) {
    db.update(
        "insert into inventory_history(kind,id,data) values (?,?,?::jsonb) on conflict(kind,id) do"
            + " update set data=excluded.data",
        kind,
        id,
        encode(data));
  }

  private List<Map<String, Object>> histories(String kind) {
    return db.query(
        "select data::text from inventory_history where kind=? order by created_at desc,id",
        (rs, n) -> decode(rs.getString(1)),
        kind);
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public Map<String, Object> state(Authentication a) {
    return build(role(a));
  }

  private Map<String, Object> build(String role) {
    Map<String, Object> s = new LinkedHashMap<>();
    s.put("version", 2);
    s.put("role", role);
    s.put(
        "locations",
        db.queryForList("select name from inventory_locations order by name", String.class));
    s.put(
        "alertDays",
        db.queryForObject("select alert_days from inventory_settings where id=1", Integer.class));
    s.put(
        "products",
        db.query(
            "select data::text from inventory_products order by id",
            (rs, n) -> decode(rs.getString(1))));
    s.put(
        "lots",
        db.query(
            "select id,product_id,location,quantity,reserved,blocked,expiry,note from"
                + " inventory_lots order by product_id,location,id",
            (rs, n) -> {
              Map<String, Object> m = new LinkedHashMap<>();
              m.put("id", rs.getString(1));
              m.put("productId", rs.getString(2));
              m.put("location", rs.getString(3));
              m.put("quantity", rs.getBigDecimal(4));
              m.put("reserved", rs.getBigDecimal(5));
              m.put("blocked", rs.getBoolean(6));
              m.put("expiry", rs.getString(7));
              if (rs.getString(8) != null) m.put("note", rs.getString(8));
              return m;
            }));
    s.put("movements", histories("movement"));
    s.put("transfers", histories("transfer"));
    s.put("counts", histories("count"));
    List<Map<String, Object>> sales = histories("sale");
    s.put("sales", sales);
    Map<String, String> processed = new LinkedHashMap<>();
    sales.forEach(
        x ->
            processed.put(
                (String) x.get("id"),
                Boolean.TRUE.equals(x.get("fulfilled"))
                    ? "confirmada"
                    : "rechazada por stock insuficiente"));
    s.put("processedSales", processed);
    Map<String, String> reviews = new LinkedHashMap<>();
    db.query(
        "select product_id,location,reviewed_at from inventory_reviews",
        (org.springframework.jdbc.core.RowCallbackHandler)
            rs -> {
              reviews.put(rs.getString(1) + "|" + rs.getString(2), rs.getString(3));
            });
    s.put("replenishmentReviews", reviews);
    return s;
  }

  private String now() {
    return Instant.now().toString();
  }

  private String today() {
    return LocalDate.now(ZoneId.of("America/La_Paz")).toString();
  }

  private void date(String value) {
    try {
      require(LocalDate.parse(value).toString().equals(value), "Fecha inválida.");
    } catch (DateTimeException e) {
      throw error(HttpStatus.BAD_REQUEST, "Fecha inválida.");
    }
  }

  private Map<String, Object> product(String p, String l) {
    Map<String, Object> x =
        decode(
            (String)
                one("select data::text data from inventory_products where id=?", p).get("data"));
    one("select name from inventory_locations where name=?", l);
    return x;
  }

  private boolean locationHistory(String name) {
    if (!db.queryForList("select 1 from inventory_lots where location=?", name).isEmpty())
      return true;
    for (String kind : List.of("movement", "transfer", "count", "sale"))
      for (Map<String, Object> x : histories(kind))
        if (name.equals(x.get("location"))
            || name.equals(x.get("origin"))
            || name.equals(x.get("destination"))) return true;
    return false;
  }

  private boolean productHistory(String p) {
    if (!db.queryForList("select 1 from inventory_lots where product_id=?", p).isEmpty())
      return true;
    for (String kind : List.of("movement", "transfer", "count", "sale"))
      for (Map<String, Object> x : histories(kind)) if (p.equals(x.get("productId"))) return true;
    return false;
  }

  private void revision(String p, String l) {
    db.update(
        "insert into inventory_revisions(product_id,location,revision) values (?,?,1) on"
            + " conflict(product_id,location) do update set"
            + " revision=inventory_revisions.revision+1",
        p,
        l);
  }

  private long rev(String p, String l) {
    return db.query(
        "select revision from inventory_revisions where product_id=? and location=?",
        rs -> rs.next() ? rs.getLong(1) : 0L,
        p,
        l);
  }

  private BigDecimal balance(String p, String l) {
    return db.queryForObject(
        "select coalesce(sum(quantity),0) from inventory_lots where product_id=? and location=?",
        BigDecimal.class,
        p,
        l);
  }

  private void movement(
      String p,
      String l,
      BigDecimal amount,
      String type,
      String ref,
      String note,
      String lot,
      String expiry,
      BigDecimal before,
      String actor) {
    Map<String, Object> m = new LinkedHashMap<>();
    String id = id("MOV");
    m.put("id", id);
    m.put("productId", p);
    m.put("location", l);
    m.put("quantity", amount);
    m.put("type", type);
    m.put("reference", ref);
    if ("Ajuste autorizado".equals(type)) {
      Map<String, Object> count = history("count", ref);
      note =
          note
              + "; Conteo "
              + count.get("system")
              + " → "
              + count.get("physical")
              + "; "
              + count.get("reason");
    }
    m.put("note", note);
    m.put("date", now());
    m.put("user", actor);
    if (lot != null) {
      m.put("lotId", lot);
      m.put("expiry", expiry);
    }
    if (before != null) {
      m.put("before", before);
      m.put("after", before.add(amount));
    }
    save("movement", id, m);
  }

  private void add(
      String p,
      String l,
      String lot,
      String expiry,
      BigDecimal amount,
      String type,
      String ref,
      String actor) {
    List<Map<String, Object>> rows =
        db.queryForList(
            "select * from inventory_lots where product_id=? and location=? and id=?", p, l, lot);
    BigDecimal before = BigDecimal.ZERO;
    if (!rows.isEmpty()) {
      Map<String, Object> r = rows.get(0);
      require(expiry.equals(r.get("expiry")), "El lote existente tiene otro vencimiento.");
      before = (BigDecimal) r.get("quantity");
      db.update(
          "update inventory_lots set quantity=quantity+?,version=version+1 where product_id=? and"
              + " location=? and id=?",
          amount,
          p,
          l,
          lot);
    } else
      db.update(
          "insert into inventory_lots(product_id,location,id,quantity,reserved,expiry,blocked)"
              + " values(?,?,?,?,0,?,false)",
          p,
          l,
          lot,
          amount,
          expiry);
    revision(p, l);
    movement(p, l, amount, type, ref, "Entrada en lote " + lot, lot, expiry, before, actor);
  }

  private List<Map<String, Object>> eligible(String p, String l) {
    return db.queryForList(
        "select * from inventory_lots where product_id=? and location=? and not blocked and"
            + " (expiry='' or expiry>?) and quantity>reserved order by case when expiry='' then"
            + " '9999' else expiry end,id",
        p,
        l,
        today());
  }

  private BigDecimal available(String p, String l) {
    return eligible(p, l).stream()
        .map(x -> ((BigDecimal) x.get("quantity")).subtract((BigDecimal) x.get("reserved")))
        .reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  private List<Map<String, Object>> consume(
      String p, String l, BigDecimal amount, String type, String ref, String actor) {
    require(available(p, l).compareTo(amount) >= 0, "Saldo elegible insuficiente.");
    List<Map<String, Object>> allocations = new ArrayList<>();
    BigDecimal remaining = amount;
    for (Map<String, Object> r : eligible(p, l)) {
      if (remaining.signum() <= 0) break;
      BigDecimal before = (BigDecimal) r.get("quantity"),
          take = remaining.min(before.subtract((BigDecimal) r.get("reserved")));
      String lot = (String) r.get("id"), expiry = (String) r.get("expiry");
      db.update(
          "update inventory_lots set quantity=quantity-?,version=version+1 where product_id=? and"
              + " location=? and id=?",
          take,
          p,
          l,
          lot);
      allocations.add(Map.of("lotId", lot, "expiry", expiry, "quantity", take));
      movement(p, l, take.negate(), type, ref, "FEFO lote " + lot, lot, expiry, before, actor);
      remaining = remaining.subtract(take);
    }
    revision(p, l);
    return allocations;
  }

  @Transactional
  public Map<String, Object> mutate(
      String op, String target, Map<String, Object> b, Authentication auth) {
    String role = role(auth), actor = auth.getName() + " · " + role;
    db.execute("select pg_advisory_xact_lock(718452391)");
    String message = "Operación completada.";
    switch (op) {
      case "product" -> {
        allow(role, "Administrador");
        String name = needed(b, "name"),
            sku = needed(b, "sku"),
            unit = needed(b, "unit"),
            category = needed(b, "category");
        BigDecimal price = num(b, "price"),
            threshold = num(b, "threshold"),
            replenishment = num(b, "replenishment");
        require(
            price.stripTrailingZeros().scale() <= 4 && price.precision() - price.scale() <= 15,
            "Precio excede precisión permitida.");
        require(
            price.signum() >= 0 && threshold.signum() >= 0 && replenishment.signum() >= 0,
            "Los valores deben ser no negativos.");
        require(b.get("lotTracked") instanceof Boolean, "Indique control de lote.");
        String pid = target == null ? id("P") : target;
        if (target != null) {
          Map<String, Object> existing =
              decode(
                  (String)
                      one("select data::text data from inventory_products where id=?", target)
                          .get("data"));
          if (!Objects.equals(existing.get("lotTracked"), b.get("lotTracked"))
              && productHistory(target))
            throw error(
                HttpStatus.CONFLICT,
                "No se puede cambiar la trazabilidad de un producto con historial.");
        }
        Integer duplicate =
            db.queryForObject(
                "select count(*) from inventory_products where lower(sku)=lower(?) and id<>?",
                Integer.class,
                sku,
                pid);
        if (duplicate != null && duplicate > 0) throw error(HttpStatus.CONFLICT, "SKU duplicado.");
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", pid);
        p.put("name", name);
        p.put("sku", sku);
        p.put("unit", unit);
        p.put("category", category);
        p.put("price", price);
        p.put("threshold", threshold);
        p.put("replenishment", replenishment);
        p.put("lotTracked", b.get("lotTracked"));
        db.update(
            "insert into inventory_products(id,sku,price,data) values(?,?,?,?::jsonb) on"
                + " conflict(id) do update set"
                + " sku=excluded.sku,price=excluded.price,data=excluded.data",
            pid,
            sku,
            price,
            encode(p));
        message = "Producto guardado.";
      }
      case "location-create" -> {
        allow(role, "Administrador");
        String name = needed(b, "name");
        if (!db.queryForList(
                "select name from inventory_locations where lower(name)=lower(?)", name)
            .isEmpty()) throw error(HttpStatus.CONFLICT, "Ubicación duplicada.");
        db.update("insert into inventory_locations(name) values(?)", name);
      }
      case "location-update" -> {
        allow(role, "Administrador");
        String name = needed(b, "name"), next = needed(b, "newName");
        one("select name from inventory_locations where name=?", name);
        if (!name.equals(next) && locationHistory(name))
          throw error(HttpStatus.CONFLICT, "La ubicación tiene historial.");
        if (!name.equals(next)
            && !db.queryForList(
                    "select name from inventory_locations where lower(name)=lower(?)", next)
                .isEmpty()) throw error(HttpStatus.CONFLICT, "Ubicación duplicada.");
        db.update("update inventory_locations set name=? where name=?", next, name);
      }
      case "location-delete" -> {
        allow(role, "Administrador");
        String name = needed(b, "name");
        one("select name from inventory_locations where name=?", name);
        if (db.queryForObject("select count(*) from inventory_locations", Integer.class) <= 1)
          throw error(HttpStatus.CONFLICT, "Debe conservar al menos una ubicación.");
        boolean used =
            !db.queryForList("select 1 from inventory_lots where location=?", name).isEmpty();
        for (String kind : List.of("movement", "transfer", "count", "sale"))
          for (Map<String, Object> x : histories(kind))
            used |=
                name.equals(x.get("location"))
                    || name.equals(x.get("origin"))
                    || name.equals(x.get("destination"));
        if (used) throw error(HttpStatus.CONFLICT, "La ubicación tiene historial o existencias.");
        db.update("delete from inventory_reviews where location=?", name);
        db.update("delete from inventory_revisions where location=?", name);
        db.update("delete from inventory_locations where name=?", name);
      }
      case "settings" -> {
        allow(role, "Administrador", "Inventario");
        BigDecimal n = num(b, "alertDays");
        require(
            n.signum() >= 0
                && n.stripTrailingZeros().scale() <= 0
                && n.compareTo(BigDecimal.valueOf(3650)) <= 0,
            "Días inválidos.");
        db.update("update inventory_settings set alert_days=? where id=1", n.intValue());
      }
      case "review" -> {
        allow(role, "Administrador");
        String p = needed(b, "productId"), l = needed(b, "location");
        product(p, l);
        db.update(
            "insert into inventory_reviews values(?,?,?,?) on conflict(product_id,location) do"
                + " update set reviewed_at=excluded.reviewed_at,actor=excluded.actor",
            p,
            l,
            now(),
            actor);
      }
      case "lot" -> {
        allow(role, "Administrador");
        String p = needed(b, "productId"), l = needed(b, "location"), lot = needed(b, "id");
        require(b.get("blocked") instanceof Boolean, "Bloqueo inválido.");
        Map<String, Object> old =
            one(
                "select * from inventory_lots where product_id=? and location=? and id=?",
                p,
                l,
                lot);
        boolean blocked = (Boolean) b.get("blocked");
        String note = str(b, "note");
        db.update(
            "update inventory_lots set blocked=?,note=?,version=version+1 where product_id=? and"
                + " location=? and id=?",
            blocked,
            note,
            p,
            l,
            lot);
        revision(p, l);
        movement(
            p,
            l,
            BigDecimal.ZERO,
            "Administración de lote",
            lot,
            "Bloqueo: "
                + old.get("blocked")
                + " → "
                + blocked
                + "; nota anterior: "
                + old.get("note")
                + "; nota actual: "
                + note,
            lot,
            (String) old.get("expiry"),
            (BigDecimal) old.get("quantity"),
            actor);
      }
      case "command" -> message = command(b, role, actor);
      default -> throw error(HttpStatus.BAD_REQUEST, "Operación desconocida.");
    }
    db.update(
        "insert into inventory_audit(actor,operation,payload) values(?,?,?::jsonb)",
        actor,
        op,
        encode(b));
    log.info("Inventory operation={} command={} actor={}", op, str(b, "type"), actor);
    return Map.of("state", build(role), "message", message);
  }

  @SuppressWarnings("unchecked")
  private String command(Map<String, Object> c, String role, String actor) {
    String type = needed(c, "type");
    switch (type) {
      case "receipt" -> {
        allow(role, "Encargado", "Administrador");
        String p = needed(c, "productId"), l = needed(c, "location"), ref = needed(c, "reference");
        Map<String, Object> prod = product(p, l);
        BigDecimal amount = num(c, "amount");
        require(amount.signum() > 0, "Cantidad debe ser positiva.");
        boolean tracked = Boolean.TRUE.equals(prod.get("lotTracked"));
        String lot = tracked ? needed(c, "lotId") : "SIN-LOTE",
            expiry = tracked ? needed(c, "expiry") : "";
        if (tracked) {
          date(expiry);
          require(expiry.compareTo(today()) > 0, "Vencimiento debe ser posterior a hoy.");
        }
        add(p, l, lot, expiry, amount, "Recepción de compra", ref, actor);
      }
      case "sale" -> {
        String p = needed(c, "productId"), l = needed(c, "location"), sid = needed(c, "saleId");
        product(p, l);
        BigDecimal amount = num(c, "amount");
        require(amount.signum() > 0, "Cantidad debe ser positiva.");
        List<Map<String, Object>> previous =
            db.query(
                "select data::text from inventory_history where kind='sale' and id=?",
                (rs, n) -> decode(rs.getString(1)),
                sid);
        if (!previous.isEmpty()) {
          Map<String, Object> old = previous.get(0);
          if (!p.equals(old.get("productId"))
              || !l.equals(old.get("location"))
              || new BigDecimal(old.get("quantity").toString()).compareTo(amount) != 0)
            throw error(HttpStatus.CONFLICT, "ID POS ya utilizado con otros datos.");
          return "Venta ya procesada: "
              + old.get("allocations")
              + (Boolean.TRUE.equals(old.get("fulfilled"))
                  ? ""
                  : "; rechazada por stock insuficiente.");
        }
        boolean fulfilled = available(p, l).compareTo(amount) >= 0;
        List<Map<String, Object>> alloc =
            fulfilled ? consume(p, l, amount, "Venta POS simulada", sid, actor) : List.of();
        Map<String, Object> sale =
            new LinkedHashMap<>(
                Map.of(
                    "id",
                    sid,
                    "productId",
                    p,
                    "location",
                    l,
                    "quantity",
                    amount,
                    "date",
                    now(),
                    "fulfilled",
                    fulfilled,
                    "allocations",
                    alloc));
        if (!fulfilled)
          sale.put(
              "reason",
              "Stock elegible insuficiente. Reintentos del mismo ID conservan este rechazo; use un"
                  + " nuevo ID tras reponer.");
        save("sale", sid, sale);
        return fulfilled ? "Venta confirmada: " + alloc : "Venta rechazada por stock insuficiente.";
      }
      case "dispatch" -> {
        allow(role, "Encargado", "Administrador");
        String p = needed(c, "productId"),
            origin = needed(c, "origin"),
            dest = needed(c, "destination");
        product(p, origin);
        product(p, dest);
        require(!origin.equals(dest), "Origen y destino deben ser diferentes.");
        BigDecimal amount = num(c, "amount");
        require(amount.signum() > 0, "Cantidad debe ser positiva.");
        String id = id("TR");
        List<Map<String, Object>> alloc =
            consume(p, origin, amount, "Despacho de transferencia", id, actor);
        save(
            "transfer",
            id,
            new LinkedHashMap<>(
                Map.of(
                    "id",
                    id,
                    "productId",
                    p,
                    "origin",
                    origin,
                    "destination",
                    dest,
                    "quantity",
                    amount,
                    "status",
                    "En tránsito",
                    "date",
                    now(),
                    "allocations",
                    alloc)));
      }
      case "receiveTransfer" -> {
        allow(role, "Encargado", "Administrador");
        Map<String, Object> tr = history("transfer", needed(c, "id"));
        if ("Recibida".equals(tr.get("status"))) return "Transferencia ya recibida.";
        require("En tránsito".equals(tr.get("status")), "Transferencia no está en tránsito.");
        String p = (String) tr.get("productId"), dest = (String) tr.get("destination");
        Map<String, Object> prod = product(p, dest);
        List<Map<String, Object>> alloc = (List<Map<String, Object>>) tr.get("allocations");
        require(alloc != null && !alloc.isEmpty(), "Transferencia sin detalle de lotes.");
        BigDecimal sum = BigDecimal.ZERO;
        for (Map<String, Object> a : alloc) {
          BigDecimal n = num(a, "quantity");
          require(n.signum() > 0, "Cantidad inválida.");
          sum = sum.add(n);
        }
        require(
            sum.compareTo(new BigDecimal(tr.get("quantity").toString())) == 0,
            "Asignaciones inválidas.");
        for (Map<String, Object> a : alloc) {
          String lot = needed(a, "lotId"), expiry = str(a, "expiry");
          if (Boolean.TRUE.equals(prod.get("lotTracked"))) date(expiry);
          add(
              p,
              dest,
              lot,
              expiry,
              num(a, "quantity"),
              "Recepción de transferencia",
              (String) tr.get("id"),
              actor);
        }
        tr.put("status", "Recibida");
        save("transfer", (String) tr.get("id"), tr);
      }
      case "count" -> {
        String p = needed(c, "productId"), l = needed(c, "location"), reason = needed(c, "reason");
        product(p, l);
        BigDecimal physical = num(c, "physical");
        require(physical.signum() >= 0, "Conteo físico inválido.");
        String id = id("CNT");
        Map<String, Object> count =
            new LinkedHashMap<>(
                Map.of(
                    "id",
                    id,
                    "productId",
                    p,
                    "location",
                    l,
                    "physical",
                    physical,
                    "system",
                    balance(p, l),
                    "status",
                    "Pendiente",
                    "createdBy",
                    role,
                    "reason",
                    reason,
                    "snapshot",
                    Long.toString(rev(p, l))));
        count.put("createdByUsername", actor);
        if (!str(c, "lotId").isEmpty()) count.put("lotId", str(c, "lotId"));
        if (!str(c, "expiry").isEmpty()) count.put("expiry", str(c, "expiry"));
        save("count", id, count);
      }
      case "approve" -> {
        allow(role, "Inventario", "Administrador");
        Map<String, Object> count = history("count", needed(c, "id"));
        require("Pendiente".equals(count.get("status")), "Conteo ya aprobado.");
        if (!role.equals("Administrador") && role.equals(count.get("createdBy")))
          throw error(HttpStatus.FORBIDDEN, "No puede aprobar su propio ajuste.");
        String p = (String) count.get("productId"), l = (String) count.get("location");
        if (!String.valueOf(rev(p, l)).equals(count.get("snapshot")))
          throw error(HttpStatus.CONFLICT, "El inventario cambió desde el conteo.");
        BigDecimal system = new BigDecimal(count.get("system").toString()),
            physical = new BigDecimal(count.get("physical").toString()),
            delta = physical.subtract(system);
        String id = (String) count.get("id");
        if (delta.signum() < 0) consume(p, l, delta.negate(), "Ajuste autorizado", id, actor);
        else if (delta.signum() > 0) {
          Map<String, Object> prod = product(p, l);
          boolean tracked = Boolean.TRUE.equals(prod.get("lotTracked"));
          String lot = tracked ? needed(count, "lotId") : "SIN-LOTE",
              expiry = tracked ? str(count, "expiry") : "";
          if (tracked && expiry.isEmpty()) {
            List<String> found =
                db.queryForList(
                    "select expiry from inventory_lots where product_id=? and location=? and id=?",
                    String.class,
                    p,
                    l,
                    lot);
            if (!found.isEmpty()) expiry = found.get(0);
          }
          if (tracked) {
            date(expiry);
            require(expiry.compareTo(today()) > 0, "Vencimiento debe ser futuro.");
          }
          add(p, l, lot, expiry, delta, "Ajuste autorizado", id, actor);
        } else
          movement(
              p,
              l,
              BigDecimal.ZERO,
              "Ajuste autorizado",
              id,
              "Conteo sin diferencia",
              null,
              null,
              null,
              actor);
        count.put("status", "Aprobado");
        count.put("approvedBy", actor);
        count.put("approvedAt", now());
        save("count", id, count);
      }
      default -> throw error(HttpStatus.BAD_REQUEST, "Comando desconocido.");
    }
    return "Operación completada.";
  }
}
