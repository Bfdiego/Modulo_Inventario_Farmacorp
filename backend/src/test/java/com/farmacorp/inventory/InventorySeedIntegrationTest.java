package com.farmacorp.inventory;

import com.farmacorp.inventory.inventory.InventorySeed;
import com.farmacorp.inventory.inventory.InventoryService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@SpringBootTest(properties="app.seed.enabled=true")
class InventorySeedIntegrationTest {
 @Container static PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:17.6");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);}
 @Autowired JdbcTemplate jdbc; @Autowired InventorySeed seed; @Autowired InventoryService service;
 @Test void seedIsAuditableAndRunsOnlyOnce(){
  assertThat(jdbc.queryForObject("select count(*) from inventory_products",Integer.class)).isEqualTo(10);
  assertThat(jdbc.queryForObject("select count(*) from inventory_lots",Integer.class)).isEqualTo(11);
  assertThat(jdbc.queryForObject("select count(*) from inventory_history where kind='transfer'",Integer.class)).isEqualTo(1);
  assertThat(jdbc.queryForObject("select count(*) from inventory_history where kind='movement' and (not data ? 'before' or not data ? 'after')",Integer.class)).isZero();
  assertThat(jdbc.queryForObject("select count(*) from inventory_lots l where l.quantity <> (select coalesce(sum((h.data->>'quantity')::numeric),0) from inventory_history h where h.kind='movement' and h.product_id=l.product_id and h.data->>'location'=l.location and h.data->>'lotId'=l.id)",Integer.class)).isZero();
  Integer movementCount=jdbc.queryForObject("select count(*) from inventory_history",Integer.class);seed.run(null);seed.run(null);
  assertThat(jdbc.queryForObject("select count(*) from inventory_history",Integer.class)).isEqualTo(movementCount);
  var admin=new UsernamePasswordAuthenticationToken("admin","",List.of(new SimpleGrantedAuthority("ROLE_Administrador")));
  String expiry=jdbc.queryForObject("select expiry from inventory_lots where product_id='P01' and location='Sucursal Equipetrol' and id='L-1001'",String.class);
  service.mutate("command",null,Map.of("type","receipt","productId","P01","location","Sucursal Equipetrol","lotId","L-1001","amount",3,"expiry",expiry,"reference","TEST"),admin);
  BigDecimal quantity=jdbc.queryForObject("select quantity from inventory_lots where product_id='P01' and location='Sucursal Equipetrol' and id='L-1001'",BigDecimal.class);
  Integer afterReceipt=jdbc.queryForObject("select count(*) from inventory_history",Integer.class);seed.run(null);
  assertThat(jdbc.queryForObject("select quantity from inventory_lots where product_id='P01' and location='Sucursal Equipetrol' and id='L-1001'",BigDecimal.class)).isEqualByComparingTo(quantity);
  assertThat(jdbc.queryForObject("select expiry from inventory_lots where product_id='P01' and location='Sucursal Equipetrol' and id='L-1001'",String.class)).isEqualTo(expiry);
  assertThat(jdbc.queryForObject("select count(*) from inventory_history",Integer.class)).isEqualTo(afterReceipt);
 }
}
