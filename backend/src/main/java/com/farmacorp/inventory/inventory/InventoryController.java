package com.farmacorp.inventory.inventory;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class InventoryController {
  private final InventoryService service;
  private final ObjectMapper mapper;

  public InventoryController(InventoryService service, ObjectMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> map(Object value) {
    return mapper.convertValue(value, Map.class);
  }

  @GetMapping("/state")
  public Object state(Authentication a) {
    return service.state(a);
  }

  @PostMapping("/commands")
  public Object command(@Valid @RequestBody InventoryRequests.Command body, Authentication a) {
    return service.mutate("command", null, map(body), a);
  }

  @PostMapping("/products")
  public Object product(@Valid @RequestBody InventoryRequests.Product body, Authentication a) {
    return service.mutate("product", null, map(body), a);
  }

  @PutMapping("/products/{id}")
  public Object productUpdate(
      @PathVariable String id,
      @Valid @RequestBody InventoryRequests.Product body,
      Authentication a) {
    return service.mutate("product", id, map(body), a);
  }

  @PostMapping("/locations")
  public Object location(@Valid @RequestBody InventoryRequests.Location body, Authentication a) {
    return service.mutate("location-create", null, map(body), a);
  }

  @PutMapping("/locations")
  public Object locationUpdate(
      @Valid @RequestBody InventoryRequests.Location body, Authentication a) {
    return service.mutate("location-update", null, map(body), a);
  }

  @DeleteMapping("/locations")
  public Object locationDelete(
      @Valid @RequestBody InventoryRequests.Location body, Authentication a) {
    return service.mutate("location-delete", null, map(body), a);
  }

  @PatchMapping("/lots")
  public Object lot(@Valid @RequestBody InventoryRequests.Lot body, Authentication a) {
    return service.mutate("lot", null, map(body), a);
  }

  @PutMapping("/settings")
  public Object settings(@Valid @RequestBody InventoryRequests.Settings body, Authentication a) {
    return service.mutate("settings", null, map(body), a);
  }

  @PostMapping("/replenishment-reviews")
  public Object review(@Valid @RequestBody InventoryRequests.Review body, Authentication a) {
    return service.mutate("review", null, map(body), a);
  }
}
